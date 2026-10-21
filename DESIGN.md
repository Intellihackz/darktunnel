# Dark Tunnel design notes

## Brief

- **Subject:** Dark Tunnel, a side project. It opens web3 apps for you over Tor through a proxy, and signs with a "ghost wallet" made in your browser. The key is shown once with a warning.
- **Audience:** privacy-minded web3 users and developers who distrust anything that overclaims.
- **Job of the page:** explain in ten seconds what the tunnel hides, and state just as plainly what it does not. Build trust, not hype. There is no product to open yet, so the page is a landing page with honest placeholders.
- **Stack:** the existing Vite + React + TypeScript project. Added GSAP + ScrollTrigger, Lenis, self-hosted Archivo and Martian Mono. No WebGL: the concept is a document, and crisp DOM holds 60 fps on a phone. No loader: a landing page does not earn one.
- **Why this replaces the first version:** the first version (canvas arch rings, serif italic, pale blue light) was a literal tunnel. It could have been any "dark Tor" page. This one is built from what the product actually does.
- **Assumptions:** the onion address, domain, X handle and preview image do not exist yet. Connection and chain rows in the dossier are examples (labelled). Browser rows are read from the visitor's own device and sent nowhere.

## Concepts

| | Idea | Anchor | Signature | Original | Fit | Feasible | Portable (low is good) |
|---|---|---|---|---|---|---|---|
| A. Redaction file (material) | The page is a file on you: everything an app learns when you visit. Scrolling makes the marker strike what the tunnel hides, and the marker visibly fails on what nothing can hide | the product decides which facts an app can read about you, and its honest limits | the marker strikes row by row, then jams on the chain rows | 4 | 5 | 4 | 1 |
| B. Onion layers (mechanism) | Scrolling wraps a packet in three layers and unwraps it at the far end | Tor's layered encryption | concentric layers peel | 3 | 4 | 3 | 2 |
| C. Transit line (process) | The page is a line with a stop for each hop | the route you, Tor, our server, the app | a train rides the route | 3 | 4 | 4 | 3 |

**Pick: A.** It is the only one where the honest limits are the climax instead of a footnote. B is too close to the rings the owner rejected. C survives as the route diagram in section 2.

## Concept card

```
Idea:        a file on you: a marker strikes out what an app would otherwise see, starting with the headline itself
Metaphor:    a declassified document, redacted
Signature:   the hero poster. The marker strikes the word "connection" in the headline at load (pointing at it lifts the bar), then a sticky dossier stage strikes row after row as you scroll
Emotion:     a small chill (this is what apps know about you), then control
Motion verb: strike. Hard, fast, expo-out: a bar is drawn across a line and stays
Screenshot:  "Apps see the tunnel. Not your [bone slab]." over the dossier with its rows struck out
```

## System

- **Palette (roles):** ground `#09090a`, panel `#101012`, ink (and slab) `#ecebe6` bone, muted `#8f8e88` (AA on ground), line `#232327`, line-2 `#34343a`. No hue accent: bone slabs are the accent. Monochrome on purpose, because the concept is black and white ink on a page. Focus ring and selection use bone.
- **Genericness test:** a dark Tor page would default to near-black plus acid green or purple, a hooded figure and a globe. None of those appear. The first version's serif italic and pale blue light are gone.
- **Type:** Archivo (display and text, one family, two personalities) in condensed width 62 at weight 800 for display, normal width for text. Martian Mono for every data string: dossier values, tags, numerals. Sources: `@fontsource-variable/archivo` and `@fontsource-variable/martian-mono`, self-hosted.
- **Scale:** display `clamp(3.4rem, 1rem + 8.4vw, 9.6rem)`, leading 0.9, tracking -0.01em (condensed needs little). Body 17 px, measure under 60ch. Data 11.5 to 13 px.
- **Grid:** 12 columns, 32 px gutter (20 px phone), 1440 max. Hero: copy on columns 1 to 5, dossier on 6 to 12. Route: sticky 1 to 5, chapters 7 to 12. Everything hangs from columns 1, 6 and 7.
- **Shape:** 0 radius everywhere. Documents and slabs are rectangles. 1 px hairlines.
- **Motion language:** `expo.out` for the strike, 0.45 s for hovers, 0.7 s for reveals. Strike direction is always left to right, retract right to left.
- **Idle state:** a faint scan line sweeps the dossier (an app reading you), and the whole page sits on a background field: drifting traffic-log lines (documentation addresses only) that the marker strikes at random, pushed along by scrolling. Both run on the GSAP ticker, pause off screen, and are a single still frame under reduced motion.
- **Selling, not hedging:** the page shows only what the tunnel does. It makes no claim beyond that, and the limits are not dramatised. The footer keeps a short disclaimer.
- **Reduced motion:** the dossier is not sticky and shows its end state: connection rows struck, browser rows readable, chain rows tagged. Content is complete and calm.
- **Phone:** the dossier sits under the headline in the same sticky stage, rows compact (row height from `svh`), tags kept. Menu is a full-screen overlay with focus trap and Escape.

## Treatments (one per role)

| Role | Treatment |
|---|---|
| Primary button | a bone slab strikes across from the left, label turns ground. It retracts to the right on leave |
| Nav links, FAQ questions | underline draws left to right (1 px) |
| Footer wordmark | a difference-blend band strikes through the middle |
| Section headings | revealed by a slab that wipes out to the right (declassified) |
| Ghost key | a bar over the sample key, lifted by a button |

## Composition plan

```
[hero stage, sticky 100svh in 260svh]   poster + object
  left: h1, lede, button + link        right: the dossier, rows strike with scroll
  corners: brand, nav / onion address note, scroll cue

[route]   sticky narrative: stations on the left light up as four chapters scroll on the right
[ghost]   statement: one huge sentence and the key card with its bar
[ways]    asymmetric pair: onion (wide) and surface (narrow), big words, facts as rows
[faq]     index list: question rows, the whole row is the target
[footer]  finale: giant wordmark with the strike, disclaimer, anchors
```

## Open items

- Onion address, domain, canonical URL and OG image once they exist.
- A real 404 status needs a server (the SPA draws a designed 404, but the status is 200 on a static host without a rewrite rule).
- The ghost wallet and proxy are not built. The page says "in build".
