// Assumptions (placeholders the owner must replace):
// - The onion address and the surface-site address do not exist yet, so both read "coming soon".
// - There is no X account, domain, canonical URL or preview image yet.
// - Dossier values are examples, not data about the visitor.

export const site = {
  name: "Dark Tunnel",
  status: "in build",
  onion: "coming soon",
  year: 2026,
};

export type Row = { key: string; label: string; value: string; at: number };
export type Group = { title: string; rows: Row[] };

export const dossier: { head: string; sub: string; groups: Group[] } = {
  head: "File 0001",
  sub: "You, as an app sees you",
  groups: [
    {
      title: "From your connection",
      rows: [
        { key: "ip", label: "IP address", value: "203.0.113.42", at: 0.08 },
        { key: "loc", label: "Location", value: "Your city", at: 0.24 },
        { key: "net", label: "Network", value: "Your provider", at: 0.4 },
        { key: "rpc", label: "RPC node", value: "Sees your IP", at: 0.56 },
      ],
    },
    {
      title: "From your wallet",
      rows: [{ key: "wal", label: "Main wallet", value: "0x7a3f…91c2", at: 0.72 }],
    },
  ],
};

export const hero = {
  h1: ["Apps see the tunnel.", "Not your connection."],
  lede: "Dark Tunnel opens any web3 app for you over Tor, and signs with a ghost wallet that was never yours. Scroll to ride the route.",
  cta: "Open the app",
  link: "Ride the route",
};

export const file = {
  title: "Everything it would learn, struck out.",
  body: "Your IP address, your location, your provider, and the node that answers the app's requests. The app gets the tunnel instead.",
};

export const route = {
  stations: ["You", "Tor", "Our server", "The app"],
  chapters: [
    { n: "01", title: "Paste an address.", body: "Type the address of any web3 app. That is the only thing you enter. Your request is wrapped in three layers before it leaves.", from: 0.1, to: 0.26 },
    {
      n: "02",
      title: "Tor carries you in.",
      body: "On the onion site, your browser reaches us through Tor. Each relay peels one layer, and no single relay sees both who you are and where you are going.",
      from: 0.26,
      to: 0.52,
    },
    {
      n: "03",
      title: "The server opens the app.",
      body: "Our server fetches the app and hands it back. Balance and price requests leave the same way, so the node that answers them does not see you.",
      from: 0.52,
      to: 0.76,
    },
    {
      n: "04",
      title: "The ghost wallet signs.",
      body: "The signature is made in your browser and travels to the app along the same route. The app sees the tunnel.",
      from: 0.76,
      to: 1.02,
    },
  ],
};

export const ghost = {
  cta: "Use it in the app",
  title: "A wallet that was never yours.",
  body: "Each session makes a new wallet in your browser and shows you its key once, with a warning. We never receive it, so your main wallet never has to meet the app.",
  card: {
    head: "Ghost wallet",
    tag: "Sample",
    rows: [
      { k: "Session", v: "7c2e" },
      { k: "Address", v: "0x9a3e…d41f" },
    ],
    keyLabel: "Key",
    sampleKey: "3f9a…c01e",
    make: "Make a ghost wallet",
    again: "New wallet",
    copy: "Copy key",
    reveal: "Lift the bar",
    cover: "Cover it",
    live: "Made just now",
    warn: "This key is a sample, not a real one. Make a real one with the button above.",
    warnLive: "Shown once. We do not keep it, and it is gone when you leave this page. Lose it and the funds are gone. Fund only what you can lose.",
  },
};

export const ways = {
  title: "Two ways in.",
  doors: [
    {
      id: "onion",
      name: "Onion",
      lede: "Open it in Tor Browser. Your IP stays out of it, and Tor Browser flattens much of what your browser tells apps.",
      rows: [
        ["Address", "Coming soon"],
        ["Tunnel over Tor", "Yes"],
        ["Ghost wallet", "Yes"],
        ["Good for", "Keeping your IP out of it"],
      ],
      action: null as { label: string; href: string } | null,
    },
    {
      id: "surface",
      name: "Surface",
      lede: "A normal website with a quick throwaway wallet.",
      rows: [
        ["Address", "Open now"],
        ["Tunnel over Tor", "No"],
        ["Ghost wallet", "Yes"],
        ["Good for", "A quick throwaway wallet"],
      ],
      action: { label: "Open the app", href: "/app" } as { label: string; href: string } | null,
    },
  ],
};

export const footer = {
  fine: "Experimental software. Not financial advice. Not affiliated with the Tor Project. Use throwaway wallets and amounts you can lose.",
};
