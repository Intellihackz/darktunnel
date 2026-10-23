import { useCallback, useEffect, useRef, useState } from "react";
import { Mark } from "../Frame";
import { route } from "../data/site";
import { sceneMarkup } from "../motion/iso";
import { startJourney } from "../motion/journey";
import { makeGhost, type GhostWallet } from "../wallet";
import { handle, type Approval } from "./bridge";
import { CHAINS, chainById, formatEth } from "./chains";
import { ALLOWLIST, parseTarget, type Target } from "./target";

type Entry = { t: string; text: string };
type Tunnel = "none" | "starting" | "live" | "error";
// One tab is one session: its own ghost wallet, its own tunnel window, its own address, its own log.
type Tab = {
  id: number;
  ghost: GhostWallet | null;
  target: Target | null;
  input: string;
  lifted: boolean;
  log: Entry[];
  tunnel: Tunnel;
  opened: boolean;
  chainId: number;
  connected: string[]; // sites this wallet has agreed to show its address to
  url: string; // where the page in the tunnel window really is, as reported by the window
  balance: string | null;
  loading: boolean;
  pending: string | null; // an address to open as soon as this tab's tunnel window is ready
  icon: string | null; // the page's icon as a data address, fetched through the tunnel
  iconTone: "light" | "dark"; // is the icon light or dark, so its tile can be the opposite
  iconHost: string; // the site the icon belongs to, so it is never shown on another site's tab
};
type Pending = Approval & { id: number; tabId: number; host: string; resolve: (ok: boolean) => void };

const SCENE = sceneMarkup();
const now = () => new Date().toTimeString().slice(0, 8);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const blank = (id: number): Tab => ({ id, ghost: null, target: null, input: "", lifted: false, log: [], tunnel: "none", opened: false, chainId: 1, connected: [], url: "", balance: null, loading: false, pending: null, icon: null, iconTone: "dark", iconHost: "" });
/** Whether an icon is mostly light or mostly dark, so it can sit on a tile that shows it. */
function toneOf(src: string): Promise<"light" | "dark"> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 16;
        const x = c.getContext("2d")!;
        x.drawImage(img, 0, 0, 16, 16);
        const d = x.getImageData(0, 0, 16, 16).data;
        let sum = 0;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 40) continue;
          sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          n++;
        }
        resolve(n && sum / n > 0.6 ? "light" : "dark");
      } catch {
        resolve("dark");
      }
    };
    img.onerror = () => resolve("dark");
    img.src = src;
  });
}
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "this site";
  }
};
const showIcon = (t: Tab) => !!t.icon && (!t.url || hostOf(t.url) === t.iconHost);
const title = (t: Tab) => (t.target?.ok ? t.target.host : "New tab");

function AppBody() {
  const [tabs, setTabs] = useState<Tab[]>([blank(1)]);
  const [activeId, setActiveId] = useState(1);
  const [note, setNote] = useState("");
  const [proxyOrigin, setProxyOrigin] = useState<string | null>(null);
  const [appOrigin, setAppOrigin] = useState("");
  const nextId = useRef(2);
  const started = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const frames = useRef(new Map<number, HTMLIFrameElement>());
  const [approvals, setApprovals] = useState<Pending[]>([]);
  const approvalsRef = useRef<Pending[]>([]);
  approvalsRef.current = approvals;
  const rpcWait = useRef(new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>());
  const counters = useRef({ rpc: 0, approval: 0, lastOpen: 0 });

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const tab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const patch = useCallback((id: number, f: (t: Tab) => Tab) => setTabs((ts) => ts.map((t) => (t.id === id ? f(t) : t))), []);
  const say = useCallback((id: number, text: string) => patch(id, (t) => ({ ...t, log: [{ t: now(), text }, ...t.log].slice(0, 40) })), [patch]);

  // JSON-RPC to a chain node. The request goes through that tab's tunnel window, so the node never sees the visitor.
  const rpcVia = useCallback(
    (tabId: number, chainId: number, method: string, params: unknown[]) =>
      new Promise<unknown>((resolve, reject) => {
        const chain = chainById(chainId);
        const el = frames.current.get(tabId);
        if (!chain || !el?.contentWindow || !proxyOrigin) return reject(new Error("There is no route to that network"));
        const id = ++counters.current.rpc;
        rpcWait.current.set(id, { resolve, reject });
        el.contentWindow.postMessage({ type: "rpc", id, url: chain.rpc, body: { jsonrpc: "2.0", id: 1, method, params } }, proxyOrigin);
        setTimeout(() => rpcWait.current.delete(id) && reject(new Error("The network did not answer in time")), 30_000);
      }),
    [proxyOrigin],
  );

  // Ask the person. The prompt is drawn by this page, which no site can reach, so no site can fake or click it.
  const ask = useCallback(
    (tabId: number, host: string, a: Approval) => {
      // a site cannot bury the person in prompts: past three waiting, the rest are refused
      if (approvalsRef.current.filter((x) => x.tabId === tabId).length >= 3) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => setApprovals((q) => [...q, { ...a, id: ++counters.current.approval, tabId, host, resolve }]));
    },
    [],
  );
  const decide = (p: Pending, ok: boolean) => {
    setApprovals((q) => q.filter((x) => x.id !== p.id));
    say(p.tabId, `${ok ? "Approved" : "Rejected"}: ${p.title.replace(/\?$/, "")}`);
    p.resolve(ok);
  };

  // Every tab gets a fresh ghost wallet, made in this page and kept nowhere.
  const giveWallet = useCallback(
    async (id: number) => {
      const g = await makeGhost();
      patch(id, (t) => ({ ...t, ghost: g }));
      say(id, `Ghost wallet made: ${short(g.address)}`);
    },
    [patch, say],
  );
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    setAppOrigin(location.origin);
    say(1, "Tab opened");
    giveWallet(1);
    // where does the tunnel window live? If the server does not say, there is no tunnel.
    fetch("/_dt/config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (c?.proxyOrigin) {
          setProxyOrigin(c.proxyOrigin);
          setTabs((ts) => ts.map((t) => (t.tunnel === "none" ? { ...t, tunnel: "starting" } : t)));
        }
      })
      .catch(() => {});
  }, [giveWallet, say]);

  // The empty screen shows the route from the front page, idling.
  useEffect(() => startJourney(screenRef.current!, { fixed: 0.02 }), []);

  // The wallet's balance, asked of the node through the tunnel.
  const addr = tab.ghost?.address;
  useEffect(() => {
    if (!addr || tab.tunnel !== "live") return;
    const chain = chainById(tab.chainId);
    if (!chain) return;
    let stale = false;
    rpcVia(tab.id, tab.chainId, "eth_getBalance", [addr, "latest"]).then(
      (wei) => !stale && patch(tab.id, (t) => ({ ...t, balance: `${formatEth(BigInt(wei as string))} ${chain.symbol}` })),
      () => !stale && patch(tab.id, (t) => ({ ...t, balance: "unavailable" })),
    );
    return () => {
      stale = true;
    };
  }, [addr, tab.id, tab.tunnel, tab.chainId, rpcVia, patch]);

  // Messages from the tunnel windows. Only the proxy origin is listened to, and only from a frame we made.
  useEffect(() => {
    if (!proxyOrigin) return;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== proxyOrigin) return;
      const entry = [...frames.current.entries()].find(([, el]) => el.contentWindow === e.source);
      if (!entry) return;
      const id = entry[0];
      const m = (e.data ?? {}) as { type?: string; url?: string; message?: string; id?: number; payload?: { method?: unknown; params?: unknown }; json?: { result?: unknown; error?: { message?: string } }; error?: string };
      if (m.type === "loaded") patch(id, (t) => ({ ...t, loading: false }));
      else if (m.type === "ready") {
        const queued = tabsRef.current.find((t) => t.id === id)?.pending;
        patch(id, (t) => ({ ...t, tunnel: "live", ...(queued ? { pending: null, opened: true, loading: true } : {}) }));
        say(id, "Tunnel window ready");
        if (queued) frames.current.get(id)?.contentWindow?.postMessage({ type: "go", url: queued }, proxyOrigin);
      } else if (m.type === "error") {
        patch(id, (t) => ({ ...t, tunnel: "error" }));
        say(id, `Tunnel window failed: ${String(m.message ?? "unknown").slice(0, 120)}`);
      } else if (m.type === "url" && typeof m.url === "string") {
        const t = parseTarget(m.url);
        patch(id, (x) => ({ ...x, input: m.url!, url: m.url!, target: t.ok ? t : x.target }));
      } else if (m.type === "icon" && typeof (m as { data?: unknown }).data === "string") {
        const data = (m as { data: string }).data;
        const iconHost = hostOf(String((m as { page?: unknown }).page ?? ""));
        if (/^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)[;,]/i.test(data) && data.length < 200_000) {
          patch(id, (x) => ({ ...x, icon: data, iconHost }));
          toneOf(data).then((tone) => patch(id, (x) => (x.icon === data ? { ...x, iconTone: tone } : x)));
        }
      } else if (m.type === "open" && typeof m.url === "string") {
        const t = parseTarget(m.url);
        const from = tabsRef.current.find((x) => x.id === id);
        const now = Date.now();
        // a page cannot flood the app with tabs: a few at most, and not faster than one every two seconds
        if (!t.ok || tabsRef.current.length >= 8 || now - counters.current.lastOpen < 2000) {
          if (from) say(id, `A page asked to open ${t.ok ? t.host : "an address"} in a new tab. Not opened`);
          return;
        }
        counters.current.lastOpen = now;
        say(id, `Opened ${t.host} in a new tab`);
        openTab(t.url.href, t);
      } else if (m.type === "rpc-result" && typeof m.id === "number") {
        const w = rpcWait.current.get(m.id);
        rpcWait.current.delete(m.id);
        if (!w) return;
        if (m.error) w.reject(new Error(m.error));
        else if (m.json?.error) w.reject(new Error(m.json.error.message ?? "The node refused"));
        else w.resolve(m.json?.result);
      } else if (m.type === "wallet" && typeof m.id === "number") {
        const reqId = m.id;
        const reply = (r: unknown) => frames.current.get(id)?.contentWindow?.postMessage({ type: "wallet-result", id: reqId, reply: r }, proxyOrigin);
        const now = tabsRef.current.find((t) => t.id === id);
        const method = m.payload?.method;
        const params = m.payload?.params;
        if (!now?.ghost || typeof method !== "string" || method.length > 64 || !Array.isArray(params) || params.length > 8 || JSON.stringify(params).length > 200_000) {
          return reply({ error: { code: -32602, message: "Invalid request" } });
        }
        const host = hostOf(now.url);
        if (!/^(eth_call|eth_get|eth_block|eth_chainId|eth_accounts|net_|web3_|eth_gasPrice|eth_estimateGas|eth_maxPriority|eth_feeHistory|eth_protocol|wallet_getPermissions)/.test(method)) say(id, `${host} asked: ${method}`);
        handle(
          {
            ghost: now.ghost,
            chainId: now.chainId,
            host,
            connected: now.connected.includes(host),
            approve: (a) => ask(id, host, a),
            rpc: (cid, mth, prm) => rpcVia(id, cid, mth, prm),
            connect: () => patch(id, (t) => ({ ...t, connected: [...new Set([...t.connected, host])] })),
            switchChain: (cid) => {
              patch(id, (t) => ({ ...t, chainId: cid, balance: null }));
              frames.current.get(id)?.contentWindow?.postMessage({ type: "wallet-event", event: "chainChanged", data: "0x" + cid.toString(16) }, proxyOrigin);
            },
          },
          method,
          params,
        ).then(reply);
      }
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [proxyOrigin, patch, say, ask, rpcVia]);

  // "/" jumps to the address bar, like a browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(el.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const toFrame = (id: number, message: Record<string, unknown>) => {
    const el = frames.current.get(id);
    if (el?.contentWindow && proxyOrigin) el.contentWindow.postMessage(message, proxyOrigin);
  };

  const openTab = (address?: string, checked?: Target) => {
    const id = nextId.current++;
    setTabs((ts) => [...ts, { ...blank(id), tunnel: proxyOrigin ? "starting" : "none", input: address ?? "", target: checked ?? null, pending: address ?? null }]);
    setActiveId(id);
    say(id, address ? `Tab opened from a link: ${checked?.ok ? checked.host : address}` : "Tab opened");
    giveWallet(id);
    if (!address) queueMicrotask(() => inputRef.current?.focus());
  };
  const closeTab = (id: number) => {
    if (tabs.length === 1) return;
    const i = tabs.findIndex((t) => t.id === id);
    const rest = tabs.filter((t) => t.id !== id);
    frames.current.delete(id);
    setApprovals((q) => {
      q.filter((a) => a.tabId === id).forEach((a) => a.resolve(false));
      return q.filter((a) => a.tabId !== id);
    });
    setTabs(rest);
    if (id === activeId) setActiveId(rest[Math.max(0, i - 1)].id);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = parseTarget(tab.input);
    patch(tab.id, (x) => ({ ...x, target: t }));
    if (!t.ok) return say(tab.id, `Address refused: ${t.reason}`);
    say(tab.id, `Address checked: ${t.host}${t.listed ? " (on the first allowlist)" : " (not on the allowlist)"}`);
    if (tab.tunnel === "starting") {
      patch(tab.id, (x) => ({ ...x, pending: t.url.href }));
      return say(tab.id, "The tunnel window is still starting. It will open as soon as it is ready");
    }
    if (tab.tunnel !== "live") return say(tab.id, "Tunnel is offline. Nothing was sent");
    toFrame(tab.id, { type: "go", url: t.url.href });
    patch(tab.id, (x) => ({ ...x, opened: true, loading: true }));
    say(tab.id, `Opening ${t.host} through the tunnel`);
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied`);
      say(tab.id, `${what} copied`);
    } catch {
      setNote("Copy failed. Select it by hand.");
    }
    setTimeout(() => setNote(""), 2200);
  };

  const target = tab.target;
  const refused = target && !target.ok ? target.reason : "";
  const live = tab.tunnel === "live";
  const stateWord = live ? "live" : tab.tunnel === "starting" ? "starting" : tab.tunnel === "error" ? "failed" : "offline";
  const showScreenCopy = !tab.opened;

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <div className="window">
        <aside className="side" aria-label="Tabs and wallet">
          <a className="brand" href="/" aria-label="Dark Tunnel, home">
            <Mark />
            <span className="u">dark tunnel</span>
          </a>

          <div className="side-h">
            <h2>Tabs</h2>
            <button className="plus" onClick={() => openTab()} aria-label="New tab">
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <ul className="tabs">
            {tabs.map((t) => (
              <li key={t.id} className={t.id === tab.id ? "is-active" : ""}>
                <button className="tab" aria-current={t.id === tab.id ? "true" : undefined} onClick={() => setActiveId(t.id)}>
                  <span className={"fav" + (showIcon(t) ? ` has-icon tone-${t.iconTone}` : "")} aria-hidden="true">
                    {showIcon(t) ? <img src={t.icon!} alt="" width={20} height={20} /> : t.target?.ok ? t.target.host[0].toUpperCase() : "+"}
                  </span>
                  <span className="tab-t">
                    <b>{title(t)}</b>
                    <small>{t.ghost ? `Ghost ${short(t.ghost.address)}` : "Making a wallet"}</small>
                  </span>
                </button>
                {tabs.length > 1 && (
                  <button className="x" onClick={() => closeTab(t.id)} aria-label={`Close ${title(t)}`}>
                    <span aria-hidden="true">×</span>
                  </button>
                )}
              </li>
            ))}
          </ul>

          <section className="wallet" aria-labelledby="w-h">
            <h2 id="w-h" className="side-h2">
              Ghost wallet <span className="muted">this tab</span>
            </h2>
            <dl className="rows">
              <div>
                <dt>Address</dt>
                <dd>{tab.ghost ? short(tab.ghost.address) : "making one"}</dd>
              </div>
              <div>
                <dt>
                  <label htmlFor="chain">Network</label>
                </dt>
                <dd>
                  <select
                    id="chain"
                    className="chain"
                    value={tab.chainId}
                    onChange={(e) => {
                      const cid = Number(e.target.value);
                      patch(tab.id, (t) => ({ ...t, chainId: cid, balance: null }));
                      toFrame(tab.id, { type: "wallet-event", event: "chainChanged", data: "0x" + cid.toString(16) });
                    }}
                  >
                    {CHAINS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
              <div>
                <dt>Balance</dt>
                <dd>{tab.balance ?? (tab.tunnel === "live" ? "asking" : "needs the tunnel")}</dd>
              </div>
              <div className="keyrow">
                <dt>Key</dt>
                <dd className="kv">
                  <span>{tab.ghost ? tab.ghost.key : "0x" + "0".repeat(64)}</span>
                  <i className={"kbar" + (tab.ghost && tab.lifted ? " is-lifted" : "")} aria-hidden="true" />
                </dd>
              </div>
            </dl>
            <div className="btns">
              <button className="btn btn-sm" disabled={!tab.ghost} aria-pressed={tab.lifted} onClick={() => patch(tab.id, (t) => ({ ...t, lifted: !t.lifted }))}>
                <span>{tab.lifted ? "Cover it" : "Lift bar"}</span>
              </button>
              <button className="btn btn-sm" disabled={!tab.ghost} onClick={() => tab.ghost && copy(tab.ghost.key, "Key")}>
                <span>Copy key</span>
              </button>
              <button className="btn btn-sm" disabled={!tab.ghost} onClick={() => tab.ghost && copy(tab.ghost.address, "Address")}>
                <span>Address</span>
              </button>
            </div>
            <p className="note" role="status" aria-live="polite">
              {note}
            </p>
            <p className="warn">Made in this page and kept nowhere. Closing the tab throws it away. Fund only what you can lose.</p>
          </section>

          <section className="logp" aria-labelledby="l-h">
            <h2 id="l-h" className="side-h2">
              Log <span className="muted">this tab</span>
            </h2>
            <ol className="log">
              {tab.log.slice(0, 8).map((e, i) => (
                <li key={`${e.t}-${i}`}>
                  <time>{e.t}</time>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          </section>
        </aside>

        <main id="main" className="main">
          <a className="brand top-brand" href="/" aria-label="Dark Tunnel, home">
            <Mark />
            <span className="u">dark tunnel</span>
          </a>
          <form className="toolbar" onSubmit={submit}>
            <div className="nav-btns">
              <button type="button" className="nb" disabled={!tab.opened} onClick={() => toFrame(tab.id, { type: "back" })} aria-label="Back">
                <span aria-hidden="true">‹</span>
              </button>
              <button type="button" className="nb" disabled={!tab.opened} onClick={() => toFrame(tab.id, { type: "forward" })} aria-label="Forward">
                <span aria-hidden="true">›</span>
              </button>
              <button type="button" className="nb" disabled={!tab.opened} onClick={() => toFrame(tab.id, { type: "reload" })} aria-label="Reload">
                <span aria-hidden="true">↻</span>
              </button>
            </div>
            <label htmlFor="addr" className="sr">
              Web3 app address
            </label>
            <div className="pill">
              <svg className="lock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="M2.5 14V7a5.5 5.5 0 0 1 11 0v7" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <path d="M6 14V7.5a2 2 0 0 1 4 0V14" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <input
                ref={inputRef}
                id="addr"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Paste a web3 app address"
                value={tab.input}
                onChange={(e) => patch(tab.id, (t) => ({ ...t, input: e.target.value }))}
                aria-invalid={!!refused}
                aria-describedby="addr-msg"
              />
              <kbd aria-hidden="true">/</kbd>
            </div>
            <button className="btn btn-sm go" type="submit">
              <span>Enter the tunnel</span>
            </button>
            <div className={"routedots" + (live ? " is-live" : "")} role="status" aria-label={`Tunnel ${stateWord}`}>
              <ol aria-hidden="true">
                {route.stations.map((s) => (
                  <li key={s} title={s} />
                ))}
              </ol>
              <span>{stateWord}</span>
            </div>
          </form>
          <p className={"addr-msg" + (refused ? " bad" : "")} id="addr-msg" role="status">
            {refused}
          </p>

          <div className={"screen" + (tab.opened ? " is-open" : "")} ref={screenRef}>
            <svg className="scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENE }} style={tab.opened ? { visibility: "hidden" } : undefined} />

            {/* one tunnel window per tab, on the proxy origin: the sites you open can never reach this page */}
            {proxyOrigin &&
              tabs.map((t) => (
                <iframe
                  key={t.id}
                  ref={(el) => {
                    if (el) frames.current.set(t.id, el);
                  }}
                  className={"view" + (t.id === tab.id && t.opened ? " is-on" : "")}
                  src={`${proxyOrigin}/p/?app=${encodeURIComponent(appOrigin)}`}
                  title={`Tunnel window, ${title(t)}`}
                  referrerPolicy="no-referrer"
                  allow=""
                />
              ))}

            {tab.opened && tab.loading && (
              <div className="loading" role="status">
                <i aria-hidden="true" />
                <span>Opening {target?.ok ? target.host : "the app"} through the tunnel</span>
              </div>
            )}

            {showScreenCopy && (
              <div className="s-copy">
                {target?.ok ? (
                  <>
                    <h1 className="s-host">{target.host}</h1>
                    <p>
                      {live
                        ? "The address passed the checks. Press Enter to open it through the tunnel."
                        : tab.tunnel === "starting"
                          ? "The address passed the checks. The tunnel window is still starting."
                          : "The address passed the checks. The tunnel is offline, so nothing was opened."}
                    </p>
                    <table className="facts">
                      <tbody>
                        <tr>
                          <th scope="row">Address</th>
                          <td>{target.url.href}</td>
                        </tr>
                        <tr>
                          <th scope="row">Allowlist</th>
                          <td>{target.listed ? "On the first list" : "Not on the list yet"}</td>
                        </tr>
                        <tr>
                          <th scope="row">Wallet</th>
                          <td>{tab.ghost ? `Ghost ${short(tab.ghost.address)}` : "Making one"}</td>
                        </tr>
                        <tr>
                          <th scope="row">Tunnel</th>
                          <td>{stateWord[0].toUpperCase() + stateWord.slice(1)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </>
                ) : (
                  <>
                    <h1>Open an app through the tunnel.</h1>
                    <p>Paste the address of a web3 app in the bar above. It opens here and signs with this tab's ghost wallet.</p>
                    <p className="chips">
                      <span className="muted">First hosts we plan to allow, not yet tested:</span>
                      {ALLOWLIST.map((h) => (
                        <button key={h} type="button" className="host" onClick={() => patch(tab.id, (t) => ({ ...t, input: h }))}>
                          {h}
                        </button>
                      ))}
                    </p>
                  </>
                )}
              </div>
            )}
            {showScreenCopy && (
              <p className="s-foot">
                <b>Tunnel {stateWord}</b>
                {live ? "" : tab.tunnel === "starting" ? "." : ". Checks only. Nothing is sent."}
              </p>
            )}
          </div>
        </main>

        {approvals.find((a) => a.tabId === tab.id) && <Prompt p={approvals.find((a) => a.tabId === tab.id)!} onDecide={decide} />}
      </div>
    </div>
  );
}

function Prompt({ p, onDecide }: { p: Pending; onDecide: (p: Pending, ok: boolean) => void }) {
  const reject = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    reject.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDecide(p, false);
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [p, onDecide]);
  return (
    <div className="scrim" role="presentation">
      <div className="prompt" role="alertdialog" aria-modal="true" aria-labelledby="p-t">
        <h2 id="p-t">{p.title}</h2>
        <dl>
          {p.lines.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {p.warn && <p className="p-warn">{p.warn}</p>}
        <div className="p-btns">
          <button ref={reject} className="btn btn-sm" onClick={() => onDecide(p, false)}>
            <span>Reject</span>
          </button>
          <button className="btn btn-sm btn-go" onClick={() => onDecide(p, true)}>
            <span>Approve</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// The app is for desktop browsers: it needs room for the window and a keyboard for the address bar.
// The choice is made once, when the page opens. Resizing later never throws a wallet away.
export function AppPage() {
  const [mode, setMode] = useState<"check" | "app" | "gate">("check");
  useEffect(() => {
    setMode(matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)").matches ? "app" : "gate");
  }, []);
  if (mode === "app") return <AppBody />;
  return (
    <div className="gate">
      <a className="brand" href="/" aria-label="Dark Tunnel, home">
        <Mark />
        <span className="u">dark tunnel</span>
      </a>
      {mode === "gate" && (
        <main id="main" className="gate-body">
          <h1>The app is for desktop browsers.</h1>
          <p>
            Dark Tunnel opens sites in a window that needs a large screen and a keyboard. Open this address on a computer, or make this window wider.
          </p>
          <div className="gate-actions">
            <a className="btn" href="/">
              <span>Back to the site</span>
            </a>
          </div>
        </main>
      )}
    </div>
  );
}
