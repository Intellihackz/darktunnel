// The chains a ghost wallet can talk to. Every node is reached through the tunnel, so none of them sees the visitor.
export type Chain = { id: number; name: string; symbol: string; rpc: string };

export const CHAINS: Chain[] = [
  { id: 1, name: "Ethereum", symbol: "ETH", rpc: "https://ethereum-rpc.publicnode.com" },
  { id: 8453, name: "Base", symbol: "ETH", rpc: "https://base-rpc.publicnode.com" },
  { id: 42161, name: "Arbitrum One", symbol: "ETH", rpc: "https://arbitrum-one-rpc.publicnode.com" },
  { id: 10, name: "Optimism", symbol: "ETH", rpc: "https://optimism-rpc.publicnode.com" },
  { id: 137, name: "Polygon", symbol: "POL", rpc: "https://polygon-bor-rpc.publicnode.com" },
  { id: 56, name: "BNB Chain", symbol: "BNB", rpc: "https://bsc-rpc.publicnode.com" },
  { id: 4663, name: "Robinhood Chain", symbol: "ETH", rpc: "https://rpc.mainnet.chain.robinhood.com" },
];

export const chainById = (id: number) => CHAINS.find((c) => c.id === id);

/** Wei (as a bigint) to a short decimal string. */
export function formatEth(wei: bigint, digits = 5): string {
  const base = 10n ** 18n;
  const whole = wei / base;
  const rest = (wei % base).toString().padStart(18, "0");
  const frac = rest.slice(0, digits).replace(/0+$/, "");
  // a tiny but real amount is shown in full rather than rounded down to nothing
  if (!frac && rest !== "0".repeat(18)) return `0.${rest.replace(/0+$/, "")}`;
  return frac ? `${whole}.${frac}` : `${whole}`;
}
