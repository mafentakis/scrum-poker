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
| Page refresh / network blip | WS closes but participant **stays** in room — reconnects on reload |
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
- At **10 s** remaining: short warning beep (client-side Web Audio API) — **only for participants who have not yet voted**.
- At **0 s**: alert beep + snackbar "Time's up — please cast your vote!" — **only shown to participants who have not yet voted**.
- Non-voted participant cards receive a **pulsing red border** (visible to all participants for team awareness).

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

## Jira Integration

- SM enters a Jira issue URL in a compact input bar (visible in expanded mode); it is broadcast to **all participants** in the room via WebSocket.
- Issue is shown as a **plain link** (opens in a new tab) — no iframe embedding.
  - Iframe approach was abandoned: Atlassian Cloud sends `X-Frame-Options: DENY`, causing a blank frame.
- SM can clear the URL (removes the link for all participants).

---

## Layout & Sizing

### Compact mode (default)
```
┌───────────────────────────────────────────────────────────────┐
│  Progress bar  (4 px)                                         │
├───────────────────────────────────────────────────────────────┤
│  Toolbar (36 px)  —  Logo | Room | Timer controls | User | ⤢  │
├───────────────────────────────────────────────────────────────┤
│  Cards + Team strip  (80 px)                                  │
└───────────────────────────────────────────────────────────────┘
Total height: 120 px  (fixed, resize-locked in standalone PWA)
```

### Expanded mode (⤢ button in toolbar)
```
┌───────────────────────────────────────────────────────────────┐
│  Progress bar  (4 px)                                         │
├───────────────────────────────────────────────────────────────┤
│  Toolbar (36 px)                                              │
├───────────────────────────────────────────────────────────────┤
│  Cards + Team strip  (80 px)                                  │
├───────────────────────────────────────────────────────────────┤
│  Jira URL input — SM only  (44 px)                            │
├───────────────────────────────────────────────────────────────┤
│  Jira issue link                                              │
└───────────────────────────────────────────────────────────────┘
Total height: 100 vh
```

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
| S → C | `state` | full `RoomState` snapshot |
| S → C | `timerEnd` | full `RoomState` snapshot |

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
