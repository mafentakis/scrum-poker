# Scrum Poker — Project Context

## What it is
Real-time Scrum Planning Poker web app. Players join a room, vote on story points with Fibonacci cards, and the Scrum Master controls reveal/reset.

## Stack
- **Frontend**: Angular 17 standalone components, Angular Material, SCSS
- **Backend**: Node.js WebSocket server (`server.js` or similar) — serves static files and handles WS rooms
- **No database** — state is in-memory per room

## Layout philosophy
The app is designed as a **compact PWA** that sits at the top of the screen like a toolbar widget:
- **Compact mode** (default): `height: 120px` — toolbar + cards/team strip only
- **Expanded mode**: `height: 100vh` — adds Jira input bar + link area
- Toggle button (`open_in_full` / `close_fullscreen`) in the toolbar
- `window.resizeTo()` locks the window to 120px in compact mode (works in standalone PWA)

## PWA
- `src/manifest.webmanifest` with `display: standalone`, `theme_color: #5c35b5`
- Icons at `src/assets/icon-192.svg` and `icon-512.svg`
- Installable via Chrome's address bar install button

## Key design decisions
- **No iframe for Jira** — Atlassian Cloud blocks embedding via `X-Frame-Options`. Jira URL is shared as a plain clickable link that opens in a new tab
- **No DomSanitizer bypass** — previously used `bypassSecurityTrustResourceUrl`; removed entirely
- **Login is a compact bar** — same 120px height as the app shell (toolbar row + inputs row), no full-page card

## Color palette
- Primary purple: `#5c35b5` / `#4527a0`
- Toolbar/header: `#616161`
- Warning: `#ef6c00`, Danger: `#c62828`
