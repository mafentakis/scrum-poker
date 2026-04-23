# Scrum Poker — Requirements

## Overview
A browser-based Scrum Poker (Planning Poker) tool for agile teams. The Scrum Master drives estimation sessions; developers vote on story points. A Jira issue link is shown below the poker UI so the team can open the ticket while estimating. Multiple teams run isolated sessions in separate **rooms**.

---

## Users & Roles

| Role | Description |
|---|---|
| **Participant** | Team member who joins a room and votes on story points |
| **Scrum Master (SM)** | Controls the session: timer, reveal cards, new round, Jira URL |

Role is self-selected at registration (no authentication required).

---

## Registration

- On first visit (or after logout) a **compact bar** (same 120 px height as the app) is shown.
- User enters:
  - **Room** — identifies the session (e.g. "Team Alpha Sprint 42")
  - **Your name** — display name within the room
  - **"as scrum master"** checkbox
- **Join** button is disabled until both fields are filled. Submits on Enter key.
- **Duplicate name prevention**: if another active connection already holds the same name in the room, the server rejects the join with a `NAME_TAKEN` error. The name input turns red and an inline error message is shown. The check is connection-based — a disconnected participant (e.g. page refresh) can reclaim their own name.
- **One Scrum Master per room**: if the room already has an active SM, a second join with the SM checkbox ticked is rejected with an `SM_TAKEN` error. The inline message names the existing SM: *"&lt;name&gt; is already the Scrum Master in this room."*
- All three values are persisted in `localStorage` and **pre-filled** on the next page load so the user can rejoin with one click.
- A **Leave session** button (toolbar) logs the user out; the participant is immediately removed from the room on the server.

---

## Rooms

- Each room is an isolated session: separate participants, votes, timer, and Jira URL.
- Any user can create a room simply by entering a new room name.
- Rooms are kept **in-memory** on the server; destroyed either when idle for **10 minutes** (hourly sweep) or **30 seconds after all participants disconnect** — whichever comes first. Both thresholds are configurable.
- Server status endpoint `GET /` returns a JSON summary of active rooms (name, participant count, last activity).

### Participant lifecycle

| Event | Behaviour |
|---|---|
| Join (WS `join` message) | Added to room if not present; previous state (vote, SM role, avatar) restored if name already exists |
| Page refresh / network blip | WS closes; chip immediately fades to 40% opacity (tooltip shows "offline") — participant **stays in the room indefinitely** until they reconnect or log out |
| Reconnect | Vote, SM role, and avatar fully restored — no data loss as long as the server hasn't restarted |
| Logout (WS `leave` message) | Participant **removed** from room immediately |
| All participants offline | Room **cleanup timer** starts (default 30 s, configurable via `ROOM_EMPTY_TTL_MS`). Cancelled immediately if anyone reconnects |
| Cleanup timer expires | Room destroyed — all state lost |
| Server restart | All rooms and participants lost (in-memory only) |

### Room TTL

- Rooms that have been **idle for more than 10 minutes** (configurable via `ROOM_TTL_MS`) are swept by an hourly background job.
- Additionally, a room is destroyed **30 seconds after the last participant goes offline** (configurable via `ROOM_EMPTY_TTL_MS`), so abandoned sessions don't linger.
- The two TTLs are independent — whichever fires first cleans up the room.

---

## Card Deck

- **Card deck**: `1, 2, 3, 5, 8, 13, 21, 40, 100, ?, ☕` — standard Fibonacci plus 40 and 100 for larger stories/epics
- Cards are displayed as a compact single horizontal row, always visible.
- Clicking a card casts/changes the vote.
- Selected card is highlighted (lifted, accent border).
- Cards are disabled after the SM reveals.
- Corner indices (playing-card style) on each card.
- Card numbers are muted (`#bdbdbd`, normal weight) at rest — bold dark (`#1F2937`, `font-weight: 700`) when selected, so the chosen value stands out without visual noise at rest.

---

## Timer

- **Full-width colored progress bar** directly below the toolbar — minimal design.
- Bar depletes as time runs out; MM:SS countdown overlaid.
- Color states:
  - **Blue** — > 30 s remaining
  - **Orange** — ≤ 30 s remaining
  - **Red + pulse** — ≤ 10 s remaining
- **Configurable duration** (SM only): 30 s / 1 min / 1:30 / 2 min / 3 min / 5 min.
- SM controls inline in the toolbar: **▶ Start / ⏸ Pause / 🔄 Reset**, duration selector, **Reveal Cards** button.
- **Timer runs server-side** — all participants in the room see the same countdown; one `setInterval` on the server broadcasts every second.

### Timeout behaviour
- At **10 s** remaining: short warning beep (client-side Web Audio API) — **only for non-SM participants who have not yet voted**.
- At **0 s**: alert beep + snackbar "Time's up — please cast your vote!" — **only shown to non-SM participants who have not yet voted**.
- Non-voted participant cards receive a **pulsing red border** (visible to all participants for team awareness).
- The **Scrum Master is excluded** from both timeout alerts and miss count tracking — they control the session and are not expected to vote.

---

## Team Strip

- Compact horizontal row, always visible (~80 px height).
- Participant navigation is responsive by input mode: **desktop / laptop layouts** use dedicated **‹ ›** buttons when the strip overflows, while **phones and tablets** use **swipe only**. Scrollbars are hidden in both cases.
- Participant names are **truncated with `…`** if they exceed the chip width (44 px). Full name is always readable via the chip's tooltip on hover.
- Each participant chip uses **two independent visual signals**:
  - **Voted badge**: charcoal `#374151` circle (bottom-left corner, 16 px) with a `✓` — present when voted, absent when not. Hidden after reveal (value is sufficient).
  - **Offline opacity**: whole chip fades to `opacity: 0.4` when offline. No text label — "offline" shown as tooltip on hover only.
- Face is always **neutral light gray** regardless of vote state — the badge is the only voted indicator.
- Opacity is **state-agnostic**: online voted = online unvoted (full); offline voted = offline unvoted (40%).
- Chip states:
  - **Not voted, online**: gray face, `?`, no badge, full opacity
  - **Voted, online**: gray face, `?`, charcoal ✓ badge, full opacity
  - **Not voted, offline**: gray face, `?`, no badge, 40% opacity
  - **Voted, offline**: gray face, `?`, charcoal ✓ badge, 40% opacity
  - **Revealed, voted**: numeric value shown in face; badge hidden
  - **Revealed, not voted**: `?` with red alert highlight
- Vote count pill: `3 / 5 voted`.
- After reveal: **Average** score circle (numeric votes only).

---

## Miss Score (Deadline Tracker)

- When the countdown timer reaches 0, any **non-SM participant** who has **not yet voted** has their miss count incremented by 1. The Scrum Master is never penalised.
- The miss count persists for the **entire session** (survives new rounds; resets only on server restart).
- **Visible to all participants** — everyone in the room sees the badges.
- Each participant chip shows a small monochrome **`×N` pill** (charcoal `#374151`, white text, bottom-right corner) when they have ≥ 1 miss. Matches the voted-badge visual system.
- Hovering the badge shows a tooltip: "Missed N deadline(s)".

---

## Jira Integration

- SM enters a Jira issue URL in a compact input bar (visible in expanded mode); it is broadcast to **all participants** in the room via WebSocket.
- Issue is shown as a **plain link** (opens in a new tab) — no iframe embedding.
  - Iframe approach was abandoned: Atlassian Cloud sends `X-Frame-Options: DENY`, causing a blank frame.
- SM can clear the URL (removes the link for all participants).

---

## Layout & Sizing

### Desktop Compact Layout
```
┌───────────────────────────────────────────────────────────────┐
│  Progress bar  (4 px)                                         │
├───────────────────────────────────────────────────────────────┤
│  Toolbar (36 px)  —  Logo | Room | Timer controls | User      │
├───────────────────────────────────────────────────────────────┤
│  Cards + Team strip  (80 px)  — bottom-aligned                │
└───────────────────────────────────────────────────────────────┘
Total height: 120 px  (fixed, resize-locked in standalone PWA)
```

> Note: this fixed `120 px` compact strip is the canonical **desktop / laptop** layout. It is not a hard height constraint for narrow touch devices.

### Responsive Rules

#### Desktop / Laptop

- Applies to desktops and laptops, including touchscreen laptops.
- Layout stays **120 px** tall and uses a **single row** with **cards first** and **participants second**.
- Participant overflow is handled with dedicated **‹ ›** buttons only; **no visible scrollbar**.

#### Phones / Tablets

- Touch devices use **swipe-only** participant navigation with **no visible scrollbar**.
- Below **`600 px` width**, the compact area reflows into **two rows**: **participants first**, **cards second**.
- At **`600 px` width and above**, the compact area stays **single-row** with **cards first** and **participants second**, including portrait tablets.
- On narrow touch layouts, the shell may grow **taller than `120 px`** to preserve usable touch targets and vertical centering.
- The toolbar stays a **single 36 px row**; secondary actions (**Leave**, **Share**, **Help**) move into one overflow menu.

#### Shared

- My own participant chip remains **first** in the strip across all breakpoints and input modes.

---

## PWA

- `manifest.webmanifest` with `display: standalone`, `theme_color: #5c35b5`.
- Icons at `assets/icon-192.svg` and `assets/icon-512.svg`.
- Installable via Chrome's address bar install button.
- In standalone mode `window.resizeTo()` locks the window to 120 px in compact mode.

---

## Backend (Node.js)

- **Runtime**: Node.js + `ws` library (no framework).
- **Transport**: WebSocket (`/ws`) — real-time, bidirectional.
- **State**: In-memory `Map<roomName, RoomState>`.
- **Timer**: Server-side `setInterval` per room; broadcasts `state` every second and `timerEnd` at zero.
- **Room cleanup**: Two mechanisms — hourly sweep deletes rooms idle > 10 min (`ROOM_TTL_MS`); per-room timer destroys room 30 s after last participant goes offline (`ROOM_EMPTY_TTL_MS`).
- **Status API**: `GET /` returns active room summary (JSON).

### WebSocket message types

| Direction | Type | Payload |
|---|---|---|
| C → S | `join` | `room, name, isSM` |
| C → S | `vote` | `room, value` |
| C → S | `unvote` | `room` |
| C → S | `reveal` | `room` |
| C → S | `newRound` | `room` |
| C → S | `startTimer` | `room` |
| C → S | `pauseTimer` | `room` |
| C → S | `resetTimer` | `room` |
| C → S | `setDuration` | `room, value` |
| C → S | `setJiraUrl` | `room, url` |
| C → S | `leave` | `room` |
| C → S | `kick` | `room, target` |
| S → C | `state` | full `RoomState` snapshot |
| S → C | `timerEnd` | full `RoomState` snapshot |
| S → C | `kicked` | _(no payload — sent only to the removed client)_ |

---

## Browser Persistence (localStorage)

| Key | Value |
|---|---|
| `scrumPokerUser` | `{ name, room, isSM }` |

Pre-fills the registration form on reload. Cleared on logout.

---

## Non-functional

- **Framework**: Angular 17 standalone components (`@if`/`@for` control flow).
- **UI library**: Angular Material 17 + custom SCSS.
- **Audio**: Web Audio API — gracefully silent if blocked.
- **Connection indicator**: Monochrome dot in toolbar (grey = connected, red = reconnecting). No green — keeps the toolbar quiet.
- **Reconnection**: Auto-reconnects every 2 s after WS close; sends `join` on reconnect.
- **Browser support**: Modern browsers (Chrome, Firefox, Edge, Safari).
- **Dev startup**: `npm run dev` starts Angular (port 4200) and Node.js (port 3000) concurrently.

## Design System

- **Color philosophy**: Minimalistic and professional — almost no color. Accent is charcoal, not a brand hue.
- **Primary accent**: `#374151` (charcoal) / `#1F2937` (near-black) / `#F3F4F6` (light grey surface)
- **Toolbar background**: `#f5f5f5` — light, quiet, low-contrast
- **Voted signal**: charcoal `#374151` circle badge (bottom-left, 16 px `✓`) — face stays neutral gray; badge is the only voted indicator
- **Timer warning**: `#ef6c00` orange (≤ 30 s) → `#c62828` red + pulse (≤ 10 s) — the only intentional color moments
- **Ghost actions**: Secondary toolbar icons at `rgba(0,0,0,0.28)`, full opacity on hover — reduce visual noise at rest
- **No progress bar** — removed; timer state communicated by MM:SS color alone

---

## PWA Offline Capabilities (Options)

Scrum Poker is inherently real-time and collaborative — full offline play is not meaningful. However, the following offline tiers can be implemented:

| Tier | What it gives | Effort | Notes |
|---|---|---|---|
| **1 — App shell cache** | App loads instantly without a network round-trip; shows the UI even if the server is down | Low | Angular `@angular/pwa` / `ngsw-config.json`; service worker caches all static assets |
| **2 — Offline splash** | When WS is unreachable, show a friendly "You are offline — waiting to reconnect" overlay instead of a blank screen | Low | Already partially there via `connected` flag; add overlay CSS |
| **3 — Solo / demo mode** | Allow a single user to use the card deck locally (no server needed) — useful for demos or onboarding | Medium | Local-only state; no multi-player; triggered automatically when WS never connects |
| **4 — Background sync** | Queue votes while offline; submit when connectivity resumes | High | Requires IndexedDB + Background Sync API; complex to reconcile with server state |

**Recommended path**: implement Tier 1 (service worker + asset caching) via `@angular/pwa`, then Tier 2 (offline overlay). Tier 3/4 are complex and of limited value for a collaborative tool.

### Deferred user stories

- **As a user**, the app shell loads instantly on a flaky connection because static assets are served from a service-worker cache — so the UI is usable even before the WS reconnects.
- **As a user**, when I lose internet I see a clear "offline" overlay rather than a frozen screen — so I know the app is trying to reconnect.

---

## Open / Deferred

- Persistent storage (database) — rooms survive server restarts.
- Password-protected rooms.
- Story title / issue summary editable field.
- Voting history / round log.
- PWA offline support (Tier 1: app-shell cache — service worker).
- Export results (CSV, clipboard).
- Dark mode.

---

## Implemented User Stories

### Registration & Identity

- **As a user**, I can enter a room name and my display name, then click **Join** (or press Enter) to join a planning session — so I can participate without creating an account.
- **As a user**, I can check "as scrum master" at registration to take the SM role for the room.
- **As a user**, my room, name, and SM preference are pre-filled on the next page load — so I can rejoin with one click after a refresh.
- **As a user**, if I try to join with a name already taken by an active connection, I see an inline error and the name field turns red — so I know to pick a different name.
- **As a user**, if I try to join as Scrum Master but the room already has one, I see an inline error naming the existing SM — so I understand why I can't take that role.
- **As a user**, I can click **Leave session** in the toolbar to log out and immediately free my name and role in the room.
- **As the SM**, I can click any participant's card (other than my own) to remove them from the session — a confirmation prompt is shown first, the card highlights red on hover as a visual cue, and the participant is immediately removed for all clients.
- **As a removed participant**, I am shown a "You have been removed from the session" message and returned to the login screen — my session is cleared so I cannot silently rejoin without going through registration again.
- **As a team**, when a participant closes their tab or loses connectivity their chip dims and shows "offline" — they stay in the room indefinitely so their vote is preserved and they can reconnect at any time without losing state.
- **As a team**, when the last participant goes offline the room is automatically destroyed after 30 seconds of being fully empty — so abandoned sessions don't linger on the server.

### Voting

- **As a participant**, I can click any card in the deck (`1 2 3 5 8 13 21 40 100 ? ☕`) to cast or change my vote — so estimation is a single click.
- **As a participant**, I can click my already-selected card a second time to undo my vote — my chip snaps back to `?` and the vote count drops, as if I never voted.
- **As a participant**, my selected card is visually highlighted (lifted with an accent border) — so I always know which value I submitted.
- **As a participant**, cards are disabled after the SM reveals — so I cannot change my vote after reveal.
- **As a participant**, my vote is restored from the server after a page refresh — so a network blip doesn't lose my selection.

### Session Control (Scrum Master)

- **As the SM**, I can click **Reveal** to show everyone's votes at the same time — so no anchoring bias occurs.
- **As any participant**, when the last eligible online voter casts their vote the cards are **automatically revealed** and the timer stops — so the team never has to wait for the SM to manually reveal when everyone is already done. (Eligible = online, non-SM participants. Rooms with zero eligible voters, e.g. SM-only, are excluded.)
- **As the SM**, I can click **New Round** to clear all votes and start estimating the next story.
- **As the SM**, I can enter a Jira issue URL in expanded mode and click **Load** to share the link with all participants — so the team can read the ticket while estimating.
- **As the SM**, I can clear the shared Jira link — so the link area resets between stories.

### Timer

- **As the SM**, I can start, pause, and reset a countdown timer directly from the toolbar — so I can time-box estimation without a separate tool.
- **As the SM**, I can choose the timer duration (30 s / 1 min / 1:30 / 2 min / 3 min / 5 min) from a dropdown in the toolbar.
- **As any participant**, I see the same real-time countdown and a full-width color-coded progress bar — blue → orange (≤ 30 s) → red pulsing (≤ 10 s) — so everyone knows how much time is left.
- **As a participant who hasn't voted**, I hear a short beep at 10 s remaining as a nudge.
- **As a participant who hasn't voted**, I receive a beep and a "Time's up — please cast your vote!" snackbar when the timer expires.
- **As any participant**, non-voters' chips pulse red when the timer expires — so the team can see who is holding things up.

### Team Awareness

- **As any participant**, I see all team members in a compact horizontal strip with live vote status: `?` (not voted), `✓` (voted, hidden), or the numeric value (after reveal).
- **As any participant**, I can see which team member is the Scrum Master via a ★ badge on their chip.
- **As any participant**, I can see the running vote tally (`N / M voted`) in the toolbar before reveal.
- **As any participant**, after reveal I see the average score (numeric votes only) both in the toolbar and as a chip in the team strip.
- **As a participant**, my own card is visually distinguished — purple border, glow, and bold name — so I can immediately spot myself in a busy team strip.
- **As any participant**, I can see next to the room name who created the session and how long ago — so the team has immediate context about the session without needing to ask.

### Miss Score (Deadline Tracker)

- **As any participant**, I can see a monochrome `×N` pill badge on each team member's chip showing how many timer deadlines they have missed this session — so the team has a clear, unobtrusive way to track responsiveness.
- **As the SM**, I am never given a miss badge or timeout alert — I control the timer and am not expected to vote.
- **As any participant**, hovering a miss badge shows a tooltip "Missed N deadline(s)".
- **As any participant**, miss counts survive new rounds and only reset on server restart.

### Profile Avatar

- **As a user**, I can optionally upload a profile photo at registration (camera icon button) — so my personality shows on the table.
- **As a participant**, my avatar always fills my card face (before reveal) — dimmed and greyscale when I haven't voted yet, full colour when I have — so teammates can tell at a glance who is ready.
- **As a participant**, my avatar appears as a small circle in the toolbar next to my name — so I can see at a glance that it is set.
- **As a participant**, my avatar is stored in `localStorage` and automatically re-used in future sessions — so I only need to set it once.
- **As any participant**, I see other teammates' avatars on their cards at all times before reveal — so the team strip is more personal and fun.

### Layout & PWA

#### Desktop / Laptop

- **As a user on desktop or laptop**, the app runs in a fixed **120 px compact strip** that sits above any other window — so it stays visible while the team is in a Zoom call or Jira.
- **As a user on desktop or laptop**, the compact strip stays **single-row** with **cards first** and **participants second** — so the layout remains dense and familiar on larger screens.
- **As a user on desktop or laptop**, when the participant strip overflows, I navigate it only with dedicated **‹ ›** buttons, with **no visible scrollbar** — so the interaction stays explicit and precise without extra chrome.

#### Phones / Tablets

- **As a user on a phone or tablet**, participant chips are navigated by **swipe only** and show **no visible scrollbar** — so touch layouts stay direct and uncluttered.
- **As a user on a narrow touch device (`< 600 px`)**, the compact area reflows into **two vertically centered rows** — participants first, cards second — so teammates stay visible while voting remains one swipe away.
- **As a user on a narrow touch device (`< 600 px`)**, the participant row stays **left-aligned** when all chips fit — so the row starts from a predictable anchor.
- **As a user on a touch device at `600 px` width or above**, the compact area stays **single-row** with **cards first** and **participants second** — so wider touch screens preserve density without reverting to desktop overflow controls.
- **As a user on a phone or tablet**, the toolbar stays a **single 36 px row**, and secondary actions move into one overflow menu — so the primary context stays visible without wrapping or horizontal toolbar scrolling.

#### Shared

- **As a user**, I can install the app as a PWA, and the desktop / laptop compact mode remains a fixed 120 px window — the expand/collapse toggle was removed for simplicity.
- **As a user**, I can install the app as a PWA from Chrome's address bar — so it opens as a standalone window without browser chrome.
- **As a participant**, my own chip is always rendered **first** in the participant strip — so I can find myself instantly regardless of room size.
- **As a user**, a monochrome dot in the toolbar shows my WebSocket connection status (grey = connected, red = reconnecting) — so I know if I'm live without a distracting green light at rest.
- **As a user**, when I lose internet I see a clear "Offline — reconnecting…" overlay rather than a frozen screen — so I know the app is trying to reconnect.
- **As a user**, when I'm offline the room meta line shows "· offline" in red — so I can tell at a glance the session is disconnected without needing to find the status dot.
- **As any participant**, when a teammate disconnects, their entire chip fades to 40% opacity — no text label, "offline" shown as a tooltip on hover — so the team knows they are temporarily away without cluttering the strip.

### Timer

- **As any participant**, after the countdown hits zero the timer briefly shows the elapsed overtime (`+1s` → `+10s`) in blinking red for 10 seconds — so latecomers can see how far over time we are. It stops automatically and clears on reset or new round.

### Visual Design

- **As a user**, the toolbar is quiet and low-contrast (`#f5f5f5` background, ghost icons) — so the UI stays out of the way during a meeting and doesn't compete with the content.
- **As a user**, secondary toolbar actions (Leave, Share, Help) are small ghost icons (28 px, appear on hover) grouped in a right cluster with consistent spacing — so the toolbar has clear visual hierarchy without clutter.
- **As a user**, voted chips show a small charcoal `✓` badge (bottom-left) on a neutral gray face — so the voted signal is clear without changing the face color and without ambiguity when offline.
- **As a user**, the timer is the only element that earns color (orange → red) — so urgent moments stand out against an otherwise monochrome UI.
- **As a user**, the room name is shown as plain text (no redundant icon) — so the toolbar reads cleanly left-to-right.
- **As a user**, the Scrum Master is not marked with a star badge — the "created by" line in the room meta already identifies who owns the session, avoiding duplication.
- **As a user**, participant names that exceed chip width are truncated with `…` — the full name is always readable by hovering the chip tooltip — so the strip stays compact without losing any information.
- **As a participant**, card numbers are muted at rest and bold when selected — so the chosen value is instantly visible without all cards competing for attention.
