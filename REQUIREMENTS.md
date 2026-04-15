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
- Rooms are kept **in-memory** on the server; a background sweep **deletes rooms that have been idle for more than 1 month**.
- Server status endpoint `GET /` returns a JSON summary of active rooms (name, participant count, last activity).

### Participant lifecycle

| Event | Behaviour |
|---|---|
| Join (WS `join` message) | Added to room if not present; reconnected if name already exists |
| Page refresh / network blip | WS closes; participant **stays** for a 30 s grace period — reconnects on reload, timer cancelled |
| No reconnect within 30 s | Participant **automatically removed** from room and team strip updated |
| Logout (WS `leave` message) | Participant **removed** from room immediately |
| Server restart | All rooms and participants lost (in-memory only) |

---

## Card Deck

- **Fibonacci sequence**: `1, 2, 3, 5, 8, 13, 21, ?, ☕`
- Cards are displayed as a compact single horizontal row, always visible.
- Clicking a card casts/changes the vote.
- Selected card is highlighted (lifted, accent border).
- Cards are disabled after the SM reveals.
- Corner indices (playing-card style) on each card.

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
- Each participant card shows:
  - **Not voted**: `?` (light background)
  - **Voted, not revealed**: `✓` (dark purple fill — value hidden)
  - **Revealed, voted**: numeric value
  - **Revealed, not voted**: `?` with red alert highlight
- ★ star indicates SM role.
- Vote count pill: `3 / 5 voted`.
- After reveal: **Average** score circle (numeric votes only).

---

## Miss Score (Deadline Tracker)

- When the countdown timer reaches 0, any **non-SM participant** who has **not yet voted** has their miss count incremented by 1. The Scrum Master is never penalised.
- The miss count persists for the **entire session** (survives new rounds; resets only on server restart).
- **Visible to all participants** — everyone in the room sees the badges.
- Each participant chip shows a small playful badge below their name when they have ≥ 1 miss:

| Count | Badge | Meaning |
|---|---|---|
| 1 | ⏰ | Late once |
| 2 | 🐢 | Slow |
| 3–4 | 😴 | Checked out |
| 5+ | 💀 | Hopeless |

- Hovering the badge shows a tooltip: "Missed N deadline(s)".

---

## Jira Integration

- SM enters a Jira issue URL in a compact input bar (visible in expanded mode); it is broadcast to **all participants** in the room via WebSocket.
- Issue is shown as a **plain link** (opens in a new tab) — no iframe embedding.
  - Iframe approach was abandoned: Atlassian Cloud sends `X-Frame-Options: DENY`, causing a blank frame.
- SM can clear the URL (removes the link for all participants).

---

## Layout & Sizing

### Layout (single fixed mode)
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

> Note: expand/collapse mode was removed. The Jira URL input and link are always visible below the strip when the window is taller.

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
- **Room cleanup**: Hourly sweep deletes rooms idle > 1 month.
- **Status API**: `GET /` returns active room summary (JSON).

### WebSocket message types

| Direction | Type | Payload |
|---|---|---|
| C → S | `join` | `room, name, isSM` |
| C → S | `vote` | `room, value` |
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
- **Connection indicator**: Coloured dot in toolbar (green = connected, red = reconnecting).
- **Reconnection**: Auto-reconnects every 2 s after WS close; sends `join` on reconnect.
- **Browser support**: Modern browsers (Chrome, Firefox, Edge, Safari).
- **Dev startup**: `npm run dev` starts Angular (port 4200) and Node.js (port 3000) concurrently.

---

## Open / Deferred

- Persistent storage (database) — rooms survive server restarts.
- Password-protected rooms.
- Story title / issue summary editable field.
- Voting history / round log.
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
- **As a team**, when a participant closes their tab or loses connectivity and doesn't reconnect within 30 seconds, they are automatically removed from the room — so the team strip doesn't accumulate ghost participants from people who left without logging out.

### Voting

- **As a participant**, I can click any card in the Fibonacci row (`1 2 3 5 8 13 21 ? ☕`) to cast or change my vote — so estimation is a single click.
- **As a participant**, my selected card is visually highlighted (lifted with an accent border) — so I always know which value I submitted.
- **As a participant**, cards are disabled after the SM reveals — so I cannot change my vote after reveal.
- **As a participant**, my vote is restored from the server after a page refresh — so a network blip doesn't lose my selection.

### Session Control (Scrum Master)

- **As the SM**, I can click **Reveal** to show everyone's votes at the same time — so no anchoring bias occurs.
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

### Miss Score (Deadline Tracker)

- **As any participant**, I can see a playful emoji badge on each team member's chip showing how many timer deadlines they have missed this session — ⏰ (1), 🐢 (2), 😴 (3–4), 💀 (5+) — so the team has a lighthearted way to track responsiveness.
- **As any participant**, hovering a miss badge shows a tooltip "Missed N deadline(s)".
- **As any participant**, miss counts survive new rounds and only reset on server restart.

### Layout & PWA

- **As a user**, the app runs in a fixed **120 px compact strip** that sits above any other window — so it stays visible while the team is in a Zoom call or Jira.
- **As a user**, I can install the app as a PWA and it runs in a fixed 120 px window — the expand/collapse toggle was removed for simplicity.
- **As a user**, I can install the app as a PWA from Chrome's address bar — so it opens as a standalone window without browser chrome.
- **As a user**, a coloured dot in the toolbar shows my WebSocket connection status (green = connected, red = reconnecting) — so I know if I'm live with the room.
