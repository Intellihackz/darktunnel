import { useEffect, useRef, useState } from "react";
import { dossier, file, footer, ghost, hero, route, site, ways } from "./data/site";
import { startDossier } from "./motion/dossier";
import { startJourney } from "./motion/journey";
import { sceneMarkup } from "./motion/iso";
import { Mark } from "./Frame";
import { makeGhost, type GhostWallet } from "./wallet";

const SCENE = sceneMarkup();

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => startJourney(ref.current!), []);

  return (
    <section className="hero" id="top" ref={ref}>
      <div className="stage">
        <svg className="scene" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SCENE }} />
        <div className="vignette" aria-hidden="true" />

        <div className="intro" data-intro>
          <h1>
            {hero.h1.map((l) => (
              <span key={l} className="ln">
                {l}{" "}
              </span>
            ))}
          </h1>
          <p className="lede">{hero.lede}</p>
          <div className="actions" data-actions>
            <a className="btn" href="#route">
              <span>{hero.cta}</span>
            </a>
            <a className="u" href="#ghost">
              {hero.link}
            </a>
          </div>
        </div>

        <div className="caps">
          <ol className="stepper" aria-label="The route">
            {route.stations.map((s) => (
              <li key={s} data-step>
                {s}
              </li>
            ))}
          </ol>
          <div className="cap-stack">
            {route.chapters.map((c) => (
              <article key={c.n} className="cap" data-cap data-from={c.from} data-to={c.to}>
                <span className="num">{c.n}</span>
                <h2>{c.title}</h2>
                <p>{c.body}</p>
              </article>
            ))}
          </div>
        </div>

        <p className="onion-note">
          Onion address: <b>{site.onion}</b>
        </p>
        <p className="cue" aria-hidden="true">
          Scroll to ride
        </p>
      </div>
      <span id="route" className="anchor" aria-hidden="true" />
    </section>
  );
}

export function File() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => startDossier(ref.current!), []);

  return (
    <section className="file" id="file" ref={ref}>
      <div className="f-stage">
        <div className="f-copy">
          <h2 className="display" data-strike>
            <span>{file.title}</span>
          </h2>
          <p>{file.body}</p>
        </div>

        <figure className="dossier" data-panel>
          <figcaption className="d-head">
            <span>{dossier.head}</span>
            <span>{dossier.sub}</span>
          </figcaption>
          <table>
            <colgroup>
              <col className="c1" />
              <col className="c2" />
              <col className="c3" />
            </colgroup>
            {dossier.groups.map((g) => (
              <tbody key={g.title}>
                <tr className="g-head">
                  <th scope="colgroup" colSpan={3}>
                    {g.title}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.key} data-row data-at={r.at}>
                    <th scope="row">{r.label}</th>
                    <td className="v">
                      <span>{r.value}</span>
                      <i className="bar" data-bar aria-hidden="true" />
                    </td>
                    <td className="t">
                      <span className="tag">
                        <span className="t-a" aria-hidden="true">
                          Visible
                        </span>
                        <span className="t-b">Hidden</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <i className="scan" data-scan aria-hidden="true" />
        </figure>
      </div>
    </section>
  );
}

export function Ghost() {
  const [g, setG] = useState<GhostWallet | null>(null);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const c = ghost.card;

  const make = async () => {
    setBusy(true);
    try {
      setG(await makeGhost());
      setShown(false);
      setNote("");
    } finally {
      setBusy(false);
    }
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote(`${what} copied`);
    } catch {
      setNote("Copy failed. Select it by hand.");
    }
    setTimeout(() => setNote(""), 2200);
  };
  const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <section className="ghost" id="ghost">
      <div className="grid12">
        <div className="g-copy">
          <h2 className="display" data-strike>
            <span>{ghost.title}</span>
          </h2>
          <p>{ghost.body}</p>
        </div>
        <figure className="gcard">
          <figcaption>
            <span>{c.head}</span>
            <span className="sample">{g ? c.live : c.tag}</span>
          </figcaption>
          <dl>
            <div>
              <dt>{c.rows[0].k}</dt>
              <dd>{g ? g.address.slice(2, 6) : c.rows[0].v}</dd>
            </div>
            <div>
              <dt>{c.rows[1].k}</dt>
              <dd>{g ? short(g.address) : c.rows[1].v}</dd>
            </div>
            <div className="keyrow">
              <dt>{c.keyLabel}</dt>
              <dd className="kv">
                <span>{g ? g.key : c.sampleKey}</span>
                <i className={"kbar" + (shown ? " is-lifted" : "")} aria-hidden="true" />
              </dd>
            </div>
          </dl>
          {g ? (
            <div className="btns">
              <button className="btn btn-sm" aria-pressed={shown} onClick={() => setShown((v) => !v)}>
                <span>{shown ? c.cover : c.reveal}</span>
              </button>
              <button className="btn btn-sm" onClick={() => copy(g.key, "Key")}>
                <span>{c.copy}</span>
              </button>
              <button className="btn btn-sm" onClick={make} disabled={busy}>
                <span>{c.again}</span>
              </button>
            </div>
          ) : (
            <button className="btn btn-block" onClick={make} disabled={busy}>
              <span>{c.make}</span>
            </button>
          )}
          <p className="note" role="status" aria-live="polite">
            {note}
          </p>
          <p className="warn">{g ? c.warnLive : c.warn}</p>
        </figure>
      </div>
    </section>
  );
}

export function Ways() {
  return (
    <section className="ways" id="ways">
      <div className="grid12">
        <h2 className="display w-title" data-strike>
          <span>{ways.title}</span>
        </h2>
        {ways.doors.map((d) => (
          <article key={d.id} className={"door door-" + d.id}>
            <h3>{d.name}</h3>
            <p>{d.lede}</p>
            <dl>
              {d.rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <div className="grid12">
        <p className="fine">{footer.fine}</p>
        <nav className="f-links" aria-label="Footer">
          <a className="u" href="#route">
            How it works
          </a>
          <a className="u" href="#ghost">
            Ghost wallet
          </a>
          <a className="u" href="/app">
            Open the app
          </a>
        </nav>
      </div>
      <a className="wm" href="#top" aria-label="Dark Tunnel, back to top">
        <span>dark tunnel</span>
      </a>
      <p className="legal">
        <Mark size={16} /> {site.name} · {site.year}
      </p>
    </footer>
  );
}

export function NotFound() {
  return (
    <main id="main" className="nf">
      <div className="nf-file">
        <p className="nf-code">404</p>
        <h1>
          <span className="ln">This file </span>
          <span className="ln">
            <i>does not exist</i>.
          </span>
        </h1>
        <p>The page you asked for is not here. Nothing was kept about the request.</p>
        <a className="btn" href="/">
          <span>Back to the start</span>
        </a>
      </div>
    </main>
  );
}
