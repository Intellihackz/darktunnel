// A ghost wallet is a fresh keypair made in this browser tab. Nothing here is stored or sent anywhere:
// the key lives in component state until the visitor makes another one or leaves the page.
export type GhostWallet = { address: string; key: string };

export async function makeGhost(): Promise<GhostWallet> {
  // viem is loaded only when someone asks for a wallet, so the first page load stays light.
  const { generatePrivateKey, privateKeyToAccount } = await import("viem/accounts");
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address };
}
