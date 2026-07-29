# R0 — Design System
*A working name — swap the wordmark whenever branding lands. Everything below stays valid.*

## 0. The one idea this whole system hangs on

R0 looks, on the surface, like a forum. Communities, posts, votes, threads, DMs. That's deliberate — a forum shape is the one thing people already know how to use without a tutorial.

The hard part is that underneath, this app is making three claims on every screen that a normal forum never has to make: *this content is really from who it says it's from* (VIS‑01/02/03), *this was hidden, not erased* (VIS‑05/06), and *this still works even when your ISP or your government doesn't want it to* (VIS‑10). A security tool that shouts these claims looks paranoid and gets deleted. A forum that hides them is lying by omission.

So the design thesis is: **make trust and reach ambient, not alarming.** Every screen quietly answers "is this real, who said it, can I still reach someone right now" using the same three visual devices, applied consistently, never as a modal interruption:

1. **The Seal** — a small stamp glyph on every signed object, showing verified/synced vs. pending.
2. **The Reach Pill** — a persistent, color‑coded chip showing Connected / Constrained / Blackout, always visible, never hidden behind a settings page.
3. **Two accent colors, never mixed** — pseudonymous community space is warm (Ember), identified broadcast/DM space is cool (Signal). VIS‑09 says these are separate systems. The palette makes that separation physically visible, not just architecturally true.

Nothing else in this system is trying to be clever. Everything else should be quiet enough that these three things are what a person actually notices.

---

## 1. Color

### 1.1 Neutrals — Light

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F6F5F2` | App background |
| `surface` | `#FFFFFF` | Cards, sheets |
| `surface-2` | `#ECEAE5` | Nested surfaces, input fills, chips at rest |
| `border` | `#1B1B1D` @ 10% | Hairline dividers, card edges |
| `text` | `#1B1B1D` | Primary text |
| `text-2` | `#6B6B70` | Secondary text, timestamps, metadata |
| `text-3` | `#9C9B9F` | Placeholder, disabled |

### 1.2 Neutrals — Dark

| Token | Hex | Use |
|---|---|---|
| `bg` | `#0E0F11` | App background |
| `surface` | `#17181B` | Cards, sheets |
| `surface-2` | `#202226` | Nested surfaces, input fills, chips at rest |
| `border` | `#F2F1EE` @ 12% | Hairline dividers, card edges |
| `text` | `#F2F1EE` | Primary text |
| `text-2` | `#9A9A9F` | Secondary text, timestamps, metadata |
| `text-3` | `#6E6E73` | Placeholder, disabled |

Neither neutral scale is pure black/white or a warm cream — both sit slightly gray so that the two accent colors (below) read as intentional against a quiet field rather than fighting a bright white or a cozy off‑white for attention.

### 1.3 The two systems (VIS‑09, made visible)

| System | Token | Hex (base) | Hex (dark‑mode adjusted) | Where it's allowed to appear |
|---|---|---|---|---|
| Community / pseudonymous | `ember` | `#E85D2C` | `#F0723F` | Feed, posts, comments, votes, communities, Create tab |
| Broadcast / identified | `signal` | `#3654A6` | `#6C8FE0` | Messages tab, DM threads, broadcast channels, verified‑identity badge |

**Hard rule:** a single screen belongs to exactly one system. The Messages tab never shows ember. The feed never shows signal. If a feature needs both (e.g. sharing a post into a DM), the *destination* screen's color wins — the post card renders in neutral ink with no accent once it's inside a Signal‑space thread. This is the one palette rule that should never bend, because bending it is exactly the failure mode VIS‑09 warns about.

### 1.4 Functional colors (shared by both systems)

| Token | Hex (light) | Hex (dark) | Meaning |
|---|---|---|---|
| `verified` | `#1F9D77` | `#3CBE94` | Signature verified & synced (Seal, filled) |
| `constrained` | `#D98C1D` | `#E8A23D` | Constrained‑mode state, pending sync |
| `blackout` | `#C23B3B` | `#E05C5C` | Blackout mode, queued/unsent, hard failure |
| `link` | `#2E5FE0` | `#7DA0FF` | Inline hyperlinks only (kept distinct from `signal` so a link never gets mistaken for a broadcast affordance) |

### 1.5 Gradients — used twice, on purpose

Gradients are reserved for exactly two places: the onboarding hero, and a "just synced" success sheen. Anywhere else, flat color. A resilience tool that leans on decorative gradients everywhere starts to feel like a lifestyle app, which undersells what it does.

- **Ember gradient:** `#E85D2C → #F2A93D` (135°)
- **Signal gradient:** `#3654A6 → #6C8FE0` (135°)

### 1.6 Contrast

All text/background pairs above meet WCAG AA (4.5:1 body, 3:1 large text) in both modes. `text-3` / placeholder is the one intentional exception and is never used for anything actionable or informational — only true placeholder ghost‑text.

---

## 2. Typography

**Poppins**, one family, three weights, across the whole product. Geometric and rounded enough to feel friendly rather than institutional — important for a tool whose subject matter (blocking, seizure, blackout) is heavy. The one exception: a monospace face for anything cryptographic.

| Weight | Used for |
|---|---|
| SemiBold (600) | Headings, the Reach Pill label, primary button labels, wordmark |
| Medium (500) | Nav labels, section labels, secondary buttons, overlines |
| Regular (400) | Body copy, comments, post text, timestamps |

**Utility mono — JetBrains Mono, Regular/Medium.** Used *only* for the things that are literally cryptographic material: truncated public keys, content hashes, signature timestamps. e.g. `a9f3…e21c · signed 2m ago`. Keeping this to a single, narrow, structurally‑justified use means when a person sees monospace anywhere in the app, they know without reading closely that they're looking at something checkable, not decorative.

### Type scale

| Role | Size / Line | Weight | Tracking |
|---|---|---|---|
| Display (onboarding only) | 32 / 40 | SemiBold | −1% |
| H1 (post title) | 22 / 30 | SemiBold | −0.5% |
| H2 (section header) | 18 / 26 | SemiBold | 0 |
| Label (nav, buttons) | 15 / 20 | Medium | 0 |
| Body L (post body) | 16 / 26 | Regular | 0 |
| Body M (comments, UI text) | 14 / 22 | Regular | 0 |
| Caption / metadata | 12 / 18 | Regular | +1% |
| Overline (community name, "r/…") | 11 / 16 | Medium, uppercase | +6% |
| Mono (hashes, keys) | 12 / 18 | JetBrains Mono Regular | 0 |

**Poppins runs wide** at display sizes — tighten tracking on H1/Display as above, and never set long paragraphs (Body L) below 16px or you'll fight the letterforms' roundness at small sizes.

*Optional pairing:* if long threads start feeling dense in all‑Poppins, Inter is a clean drop‑in for Body L/M only, keeping Poppins for every label, heading, and button. Not required — the system above works standalone — but noted here so it's a deliberate choice later, not a scramble.

---

## 3. Surface language — "frosted, not flat"

Most of the UI is flat: `surface` color, a 1px `border` hairline, 12–16px radius, no shadow. This is what "minimal" buys you — restraint everywhere except the few places depth actually communicates something.

**Frosted glass (`backdrop-filter: blur(20px)`, surface at ~72% opacity) is reserved for things that float above content:** the top app bar, the Reach Pill, bottom sheets/modals, toasts. The rule of thumb: if it's part of the page, it's flat; if it's *on top of* the page, it's glass. That's the whole glassmorphism budget for the app — spending it everywhere would cost the "minimal" part of the brief.

| Token | Radius | Shadow |
|---|---|---|
| `radius-sm` | 8px | chips, tags, small badges |
| `radius-md` | 12px | buttons, inputs |
| `radius-lg` | 16px | cards, sheets |
| `radius-pill` | 999px | Reach Pill, vote pills, avatar |
| `shadow-sm` | — | `0 1px 2px rgba(0,0,0,.06)` — resting cards only if on a busy background |
| `shadow-md` | — | `0 8px 24px rgba(0,0,0,.16)` light / `rgba(0,0,0,.5)` dark — modals, sheets, floating nav |

---

## 4. Signature elements

### 4.1 The Reach Pill

A persistent, small chip in the top app bar. Never buried in settings — VIS‑10 says the fallback path should stay warm, and a UI element you only see in an emergency is one nobody trusts when the emergency comes.

| State | Color | Icon | Label |
|---|---|---|---|
| Connected | `verified` teal | 3 full signal bars | "Connected" |
| Constrained | `constrained` amber | 2 of 3 bars, one dashed | "Constrained" |
| Blackout | `blackout` red | 1 bar, pulsing slowly | "Blackout" |

Tapping it opens a short sheet: what's degraded right now, in plain language ("Federation is slow. Posting and reading still work. Live updates are paused.") — never a status code, always the sentence a person needs to decide what to do next.

Color is never the only signal — icon shape and text label change with it, so the pill still communicates fully in grayscale or to a color‑blind reader.

### 4.2 The Seal

A small stamp‑shaped glyph attached to every post, comment, and broadcast message.

- **Filled seal, solid ring** — signature verified, synced across the network.
- **Outline seal, dashed ring** — signature verified locally, not yet relayed (authored offline, queued — VIS‑08 duress/offline case).
- No seal ever means no claim of authenticity is being made — this should never happen for real content; its absence is itself informative.

Always paired with a caption in mono: `verified · synced 2m ago` or `verified · queued, offline`. Tooltip/long‑press reveals the truncated key or hash. Never color‑only; the ring style (solid vs. dashed) carries the same meaning as the color, for the same accessibility reason as the Reach Pill.

### 4.3 The moderation banner (VIS‑05 / VIS‑06)

Content a moderator has actioned is never blank. It collapses to a single outlined banner, same shape in both modes:

> **Hidden by r/community moderators.** The post itself hasn't changed — this is a client‑side choice you can override. **View original →**

No red, no alarm styling — this is routine, structural, and reversible by the reader, which is the entire point of "additive, not subtractive." Save `blackout` red for actual network failure, not for moderation, so the two don't get conflated.

---

## 5. Core components

**Buttons**
- Primary (Ember): `ember` fill, white label, 48px height, `radius-md`, Poppins Medium 15.
- Primary (Signal): identical spec, `signal` fill — used only inside Signal‑space screens.
- Secondary: `surface-2` fill, `text` label, 1px `border`.
- Ghost/tertiary: no fill, `text-2` label, underline on hover/focus only.
- Destructive: `blackout` red, used for delete/block/leave actions only — never for anything network‑state related, to keep that color's meaning singular.
- All buttons: visible 2px focus ring in the active accent color, 4px offset. Disabled: `text-3` label on `surface-2`, no border.

**Vote control** — up/down triangle pair, count between them, vertical on desktop‑width cards, horizontal on narrow phone cards. A thin ring around the control fills clockwise as a quiet proof‑of‑work/rate‑limit indicator when a client is computing the cost required to post anonymously (VIS‑07 made visible, not just backend logic).

**Post card** — overline (community name + Seal), H1 title, Body M snippet (2‑line clamp), footer row: vote control · comment count · transport tag (small icon + label: "via HTTP", "via LoRa", "via mesh" — VIS‑04, the same wire format however it arrived, so the tag is informational, never a different rendering path).

**Comment thread** — 16px indent per depth, a single 1px vertical `border` line per thread instead of nested boxes (keeps deep threads legible without visual noise), Seal + vote control at comment scale (smaller, Body M).

**Compose** — bottom sheet, frosted per §3, community selector chip → title input → body textarea → attachment row. If authored while Constrained/Blackout, the primary button relabels from "Post" to "Queue" and a caption appears: "Sends the moment a path opens."

**Bottom navigation** — 5 items: Home, Communities, **Create** (center, raised, Ember‑filled circle), Messages, Profile. Messages is the one nav icon that renders in `signal` blue even while every surrounding icon is neutral/ember — the nav bar itself teaches the two‑system split before a person ever opens the tab.

**Chips/tags, inputs, toasts** — `radius-sm`/`radius-pill`, `surface-2` at rest, 1px `border`; toasts use the frosted treatment from §3 and auto‑dismiss except for blackout‑queue confirmations, which persist until tapped.

---

## 6. Motion

Calm and fast, never decorative. This is a trust tool — motion should read as *responsive*, not *delightful*.

- Reach Pill state change: 300ms ease, color + icon morph together, no bounce.
- Card press: scale to 0.98, 100ms, no shadow pop.
- Comment thread expand/collapse: height auto‑animate, 200ms.
- Seal state flip (queued → synced): a single 400ms ring‑fill from dashed to solid — the only moment in the app allowed to feel slightly satisfying, because it's reporting real good news (your post made it out).
- No page‑load choreography, no scroll‑triggered reveals. Respect `prefers-reduced-motion` everywhere above.

---

## 7. Accessibility & resilience‑specific notes

- Reach Pill and Seal: color is always backed by shape/icon and a text label — see §4.
- Constrained/Blackout screens must remain usable in a text‑only, image‑stripped rendering — don't let any critical action live only inside an image or icon with no label.
- Compose always shows queued state explicitly; never let a person believe something sent when it's actually waiting for a path.
- Minimum tap target 44×44px throughout, given this is designed to be used one‑handed, possibly on a damaged or low‑end device.

---

## 8. Voice for empty/error/queue states

Plain, active, no apology — matches a tool whose whole pitch is "we tell you exactly what's happening."

- Empty blackout inbox: *"No signal yet. What you post here queues and sends the moment any path opens."*
- Failed relay: *"Couldn't reach any node. Still saved on this device — retries automatically."*
- Moderation banner: *"Hidden by r/community moderators. View original →"*
- Seizure/duress key wipe confirmation: *"This device's keys are gone. Your identity is safe on any other device you've verified."*

---

## 9. Traceability — component ↔ axiom

| Component | Axiom(s) it exists to make visible |
|---|---|
| Seal | VIS‑01, VIS‑03, VIS‑08 |
| Reach Pill | VIS‑10, operating‑mode ladder |
| Ember/Signal split | VIS‑09 |
| Moderation banner | VIS‑05, VIS‑06 |
| Transport tag | VIS‑04 |
| Vote‑control cost ring | VIS‑07 |
| Compose queue state | VIS‑08, blackout mode |

If a future screen doesn't map back to one of these rows, it's probably fine to design generically. If it touches trust, identity, or reach, it should reuse one of these seven devices rather than inventing an eighth.
