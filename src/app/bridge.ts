// The wallet side of the bridge. A page opened in the tunnel asks its provider for something; the request arrives
// here, from the tunnel window, with no key attached. This code decides what to do, asks the person for anything
// that matters, signs with the tab's ghost key, and answers. It runs on the app origin, which no site can reach.
import { chainById, CHAINS, formatEth } from "./chains";
import type { GhostWallet } from "../wallet";

export type Reply = { result: unknown } | { error: { code: number; message: string } };
export type Approval = { kind: "connect" | "sign" | "typed" | "send" | "switch"; title: string; lines: [string, string][]; warn?: string };

export type Ctx = {
  ghost: GhostWallet;
  chainId: number;
  host: string; // the site asking, worked out by the app from the address it knows, never from the page
  connected: boolean;
  approve: (a: Approval) => Promise<boolean>;
  rpc: (chainId: number, method: string, params: unknown[]) => Promise<unknown>;
  connect: () => void;
  switchChain: (id: number) => void;
};

const err = (code: number, message: string): Reply => ({ error: { code, message } });
const refused = err(4001, "The person rejected the request");

const READ = new Set([
  "eth_blockNumber", "eth_call", "eth_estimateGas", "eth_feeHistory", "eth_gasPrice", "eth_getBalance", "eth_getBlockByHash",
  "eth_getBlockByNumber", "eth_getBlockTransactionCountByHash", "eth_getBlockTransactionCountByNumber", "eth_getCode", "eth_getLogs",
  "eth_getStorageAt", "eth_getTransactionByHash", "eth_getTransactionByBlockHashAndIndex", "eth_getTransactionByBlockNumberAndIndex",
  "eth_getTransactionCount", "eth_getTransactionReceipt", "eth_maxPriorityFeePerGas", "eth_protocolVersion", "eth_sendRawTransaction",
]);

const hex = (n: number | bigint) => "0x" + n.toString(16);
const asBig = (v: unknown, fallback?: bigint) => (v === undefined || v === null ? fallback : BigInt(v as string));

/** Readable text for a personal_sign payload: the text if it is text, the raw bytes if not. */
function readable(data: string): string {
  if (!/^0x([0-9a-f]{2})*$/i.test(data)) return data;
  try {
    const bytes = Uint8Array.from(data.slice(2).match(/../g) ?? [], (b) => parseInt(b, 16));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return /^[\x09\x0a\x0d\x20-\x7e -￿]*$/.test(text) ? text : data;
  } catch {
    return data;
  }
}
const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + "…" : s);

export async function handle(ctx: Ctx, method: string, params: unknown[]): Promise<Reply> {
  const addr = ctx.ghost.address;
  try {
    switch (method) {
      case "eth_chainId":
        return { result: hex(ctx.chainId) };
      case "net_version":
        return { result: String(ctx.chainId) };
      case "web3_clientVersion":
        return { result: "DarkTunnel/0.1" };
      case "eth_accounts":
        return { result: ctx.connected ? [addr] : [] };
      case "wallet_getPermissions":
        return { result: ctx.connected ? [{ parentCapability: "eth_accounts" }] : [] };

      case "eth_requestAccounts":
      case "wallet_requestPermissions": {
        if (!ctx.connected) {
          const ok = await ctx.approve({
            kind: "connect",
            title: "Connect this site to your ghost wallet?",
            lines: [["Site", ctx.host], ["Wallet", addr], ["Network", chainById(ctx.chainId)?.name ?? String(ctx.chainId)]],
            warn: "The site will be able to see this address. It cannot move anything without asking you first.",
          });
          if (!ok) return refused;
          ctx.connect();
        }
        return { result: method === "eth_requestAccounts" ? [addr] : [{ parentCapability: "eth_accounts" }] };
      }

      case "wallet_switchEthereumChain": {
        const id = Number(((params[0] ?? {}) as { chainId?: string }).chainId);
        const chain = chainById(id);
        if (!chain) return err(4902, "That network is not available in this wallet");
        if (id !== ctx.chainId) {
          const ok = await ctx.approve({ kind: "switch", title: `Switch to ${chain.name}?`, lines: [["Site", ctx.host], ["Network", chain.name]] });
          if (!ok) return refused;
          ctx.switchChain(id);
        }
        return { result: null };
      }
      case "wallet_addEthereumChain":
        return err(4200, "Adding networks is not supported yet");

      case "personal_sign":
      case "eth_sign": {
        if (method === "eth_sign") return err(4200, "eth_sign is not supported because it can sign a transaction by accident");
        if (!ctx.connected) return err(4100, "Connect the wallet first");
        const [data, from] = params as [string, string];
        if (from && from.toLowerCase() !== addr.toLowerCase()) return err(-32602, "That account is not in this wallet");
        const ok = await ctx.approve({ kind: "sign", title: "Sign this message?", lines: [["Site", ctx.host], ["Message", clip(readable(String(data)))]] });
        if (!ok) return refused;
        const { privateKeyToAccount } = await import("viem/accounts");
        const account = privateKeyToAccount(ctx.ghost.key as `0x${string}`);
        const message = /^0x([0-9a-f]{2})*$/i.test(String(data)) ? { raw: data as `0x${string}` } : String(data);
        return { result: await account.signMessage({ message }) };
      }

      case "eth_signTypedData_v4":
      case "eth_signTypedData_v3": {
        if (!ctx.connected) return err(4100, "Connect the wallet first");
        const [from, raw] = params as [string, string | object];
        if (from && from.toLowerCase() !== addr.toLowerCase()) return err(-32602, "That account is not in this wallet");
        const typed = typeof raw === "string" ? JSON.parse(raw) : raw;
        const ok = await ctx.approve({
          kind: "typed",
          title: "Sign this data?",
          lines: [["Site", ctx.host], ["Type", String(typed.primaryType)], ["Data", clip(JSON.stringify(typed.message, null, 1))]],
          warn: "Signed data can authorise things like token approvals. Read it before you agree.",
        });
        if (!ok) return refused;
        const { privateKeyToAccount } = await import("viem/accounts");
        const account = privateKeyToAccount(ctx.ghost.key as `0x${string}`);
        return { result: await account.signTypedData({ domain: typed.domain, types: typed.types, primaryType: typed.primaryType, message: typed.message }) };
      }

      case "eth_sendTransaction": {
        if (!ctx.connected) return err(4100, "Connect the wallet first");
        const tx = (params[0] ?? {}) as Record<string, string>;
        if (tx.from && tx.from.toLowerCase() !== addr.toLowerCase()) return err(-32602, "That account is not in this wallet");
        const chain = chainById(ctx.chainId)!;
        const value = asBig(tx.value, 0n)!;
        const data = tx.data ?? tx.input ?? "0x";
        const ok = await ctx.approve({
          kind: "send",
          title: "Send this transaction?",
          lines: [
            ["Site", ctx.host],
            ["Network", chain.name],
            ["To", tx.to ?? "(contract creation)"],
            ["Value", `${formatEth(value, 8)} ${chain.symbol}`],
            ["Data", data === "0x" ? "none" : `${(data.length - 2) / 2} bytes, starts ${data.slice(0, 10)}`],
          ],
          warn: "This sends from the ghost wallet. It only works if the wallet holds funds on this network.",
        });
        if (!ok) return refused;

        const call = (m: string, p: unknown[]) => ctx.rpc(ctx.chainId, m, p);
        const nonce = tx.nonce ? Number(tx.nonce) : Number(await call("eth_getTransactionCount", [addr, "pending"]));
        const gas = tx.gas ? BigInt(tx.gas) : (BigInt(await call("eth_estimateGas", [{ from: addr, to: tx.to, value: hex(value), data }]) as string) * 12n) / 10n;
        const { privateKeyToAccount } = await import("viem/accounts");
        const account = privateKeyToAccount(ctx.ghost.key as `0x${string}`);

        let signed: string;
        if (tx.gasPrice && !tx.maxFeePerGas) {
          signed = await account.signTransaction({ type: "legacy", chainId: ctx.chainId, nonce, gas, gasPrice: BigInt(tx.gasPrice), to: tx.to as `0x${string}` | undefined, value, data: data as `0x${string}` });
        } else {
          let maxFee = asBig(tx.maxFeePerGas);
          let tip = asBig(tx.maxPriorityFeePerGas);
          if (maxFee === undefined || tip === undefined) {
            const block = (await call("eth_getBlockByNumber", ["latest", false])) as { baseFeePerGas?: string };
            const base = BigInt(block.baseFeePerGas ?? "0x0");
            tip ??= await call("eth_maxPriorityFeePerGas", []).then((t) => BigInt(t as string)).catch(() => 1_000_000n);
            maxFee ??= base * 2n + tip;
          }
          signed = await account.signTransaction({ type: "eip1559", chainId: ctx.chainId, nonce, gas, maxFeePerGas: maxFee, maxPriorityFeePerGas: tip, to: tx.to as `0x${string}` | undefined, value, data: data as `0x${string}` });
        }
        return { result: await call("eth_sendRawTransaction", [signed]) };
      }

      default:
        if (READ.has(method)) return { result: await ctx.rpc(ctx.chainId, method, params) };
        if (method === "eth_subscribe" || method === "eth_unsubscribe") return err(4200, "Subscriptions are not supported. Poll instead");
        return err(-32601, `The method ${method} is not supported`);
    }
  } catch (e) {
    return err(-32603, e instanceof Error ? e.message.slice(0, 300) : "Request failed");
  }
}

export { CHAINS };
