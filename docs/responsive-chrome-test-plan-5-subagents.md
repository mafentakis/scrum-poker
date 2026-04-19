# Responsive Chrome Test Plan With 5 Parallel Subagents

## Goal

Validate the responsive behavior implemented for the compact toolbar UI in Chrome using 5 parallel subagents, each with an isolated browser session and a clear ownership area.

## Preconditions

- Run from the repo root.
- Install dependencies if needed with `npm install`.
- Start the app with:

```bash
npm run dev
```

- Wait for:
  - Angular UI at `http://localhost:4200`
  - Node/WebSocket backend at `http://localhost:3000`
- Run all browser checks against `http://localhost:4200`.

## Chrome Setup

- Use Chrome only.
- Give each subagent its own isolated session.
- Preferred setup:
  - one Chrome profile per subagent, or
  - one isolated Chrome context/window per subagent
- Do not share one normal browsing context across subagents because the app uses `localStorage` for identity and room persistence.
- Use one shared room name for all 5 subagents.
- Use these identities:
  - `SM-1` as Scrum Master
  - `P-1`
  - `P-2`
  - `P-3`
  - `P-4`

## Global Evidence Rules

- Capture one screenshot after all 5 users join the same room.
- Capture one screenshot per agent for its primary viewport/state.
- For every failure, record:
  - agent name
  - viewport or device mode
  - room name
  - participant count
  - exact action sequence
  - expected result
  - actual result
  - screenshot
  - Chrome console and Network/WebSocket evidence if relevant

## Agent Split

### Agent 1: Desktop/Laptop

**Owner:** `SM-1`

**Chrome mode**
- Regular Chrome window or DevTools `Responsive` mode
- Desktop user agent
- Touch disabled

**Viewport checks**
- `1280 x 800`
- `1024 x 768`

**Steps**
1. Join the shared room as Scrum Master.
2. Ensure enough participants join so the participant strip can overflow.
3. Validate desktop layout at both viewports.

**Expected results**
- Compact shell stays `120 px` tall.
- Layout stays single-row.
- Order is cards first, participants second.
- Participant nav buttons `‹ ›` appear only when overflow exists.
- No visible participant scrollbar.
- Toolbar keeps direct `Leave`, `Share`, and `Help` buttons.
- No touch overflow menu.
- SM controls remain visible and usable:
  - timer widget
  - start/pause
  - reset when applicable
  - duration chips
  - `Reveal` or `New round`

### Agent 2: Touchscreen Laptop vs Tablet

**Owner:** `P-1`

**Chrome mode**
- DevTools Device Toolbar

**Scenario A: Touchscreen laptop**
- `1024 x 768`
- Desktop emulation
- Desktop user agent
- Touch may be enabled, but do not use a tablet preset

**Expected results**
- App stays in desktop mode.
- Compact shell stays `120 px`.
- Layout stays single-row.
- Order is cards first, participants second.
- Desktop `‹ ›` participant nav buttons are used on overflow.
- Toolbar keeps direct action buttons, not overflow menu.

**Scenario B: Portrait tablet**
- `768 x 1024`
- Tablet/mobile emulation with touch enabled

**Expected results**
- App switches to touch mode.
- Layout stays single-row because width is `>= 600 px`.
- Order is cards first, participants second.
- Participant navigation is swipe-only.
- No visible `‹ ›` participant nav buttons.
- Overflow menu is present for `Leave`, `Share`, `Help`.
- No visible participant scrollbar.

### Agent 3: Phone Portrait and Landscape

**Owner:** `P-2`

**Chrome mode**
- DevTools Device Toolbar
- Mobile emulation with touch enabled

**Viewport checks**
- Portrait: `430 x 932`
- Landscape: `932 x 430`

**Steps**
1. Join the shared room as a participant.
2. Test portrait first, then rotate to landscape.
3. Recheck after the room has enough participants to overflow.

**Expected results at `430 x 932`**
- App is in touch mode.
- Compact area becomes two rows.
- Participants row is first.
- Cards row is second.
- Shell may be taller than `120 px`.
- Participant strip is swipe-only.
- Card row is swipeable if needed.
- No visible participant scrollbar.
- No visible card-row scrollbar.
- No `‹ ›` buttons.
- Toolbar stays one row.
- Secondary actions move into overflow menu.

**Expected results at `932 x 430`**
- App remains in touch mode.
- Layout returns to a single row.
- Order is cards first, participants second.
- Participant navigation stays swipe-only.
- No visible `‹ ›` buttons.
- No visible participant or card scrollbar.
- Toolbar still stays one row with overflow menu.

**Tappability checks**
- Cards can still be tapped reliably.
- Participant chips remain usable.
- Overflow trigger and menu items remain usable after rotation.

### Agent 4: Interaction and Menu Parity

**Owner:** `P-3`

**Focus**
- Interaction correctness across layout modes
- Overflow/menu parity with desktop actions

**Steps**
1. Join the shared room as a participant.
2. Work with Agent 1 and Agent 3 so both desktop and touch layouts are active in parallel.
3. Exercise join/leave and overflow menu behavior.

**Checks**
- On desktop, `‹ ›` appears only when participant overflow exists.
- On touch, `‹ ›` never appears even when overflow exists.
- Overflow state updates immediately after participants join or leave.
- Touch overflow menu contains:
  - `Leave`
  - `Share`
  - `Help`
- Each overflow menu action behaves the same as the corresponding desktop toolbar action.
- Menu closes cleanly after use.
- No later interactions are blocked by the menu.

### Agent 5: Persistence and Regression States

**Owner:** `P-4`

**Focus**
- State continuity
- Registration flow
- Jira/timer/reveal/offline regressions

**Steps**
1. Join the shared room as a participant.
2. Refresh and reconnect while other agents remain connected.
3. Observe state recovery and cross-client behavior.

**Checks**
- Your own participant chip stays first after initial join.
- Your own chip stays first after page refresh.
- Your own chip stays first after reconnect/offline recovery.
- Stored room/name/role/avatar remain prefilled after refresh.
- Registration bar works on logged-out state:
  - room input
  - name input
  - avatar picker
  - SM checkbox
  - Join button disabled until room and name are set
  - Enter submits
- Duplicate-name and duplicate-SM errors render inline without breaking the form.
- Jira link load/clear works for SM and displays correctly for participants.
- Timer states remain correct across start, pause, resume, reset, timeout.
- Reveal switches correctly to `New round`.
- Offline UI appears correctly on disconnect.
- Reconnect clears offline UI without duplicating participants.

## Cross-Agent Synchronization Checks

- All 5 subagents see the same participant list in the same room.
- Join/leave updates propagate to all sessions.
- Vote state and reveal state propagate to all sessions.
- Toolbar role differences remain correct across SM and non-SM clients.
- Overflow behavior differs by device class, not just by viewport width.

## Pass/Fail Matrix

| Area | Agent | Pass/Fail | Evidence | Notes |
|---|---|---|---|---|
| App launch and room setup | All |  |  |  |
| 5 isolated Chrome sessions | All |  |  |  |
| Desktop layout and nav behavior | Agent 1 |  |  |  |
| Touchscreen laptop stays desktop | Agent 2 |  |  |  |
| Tablet switches to touch mode | Agent 2 |  |  |  |
| Phone portrait stacked layout | Agent 3 |  |  |  |
| Phone landscape single-row layout | Agent 3 |  |  |  |
| Overflow/menu parity | Agent 4 |  |  |  |
| Persistence and reconnect ordering | Agent 5 |  |  |  |
| Jira/timer/reveal/offline regression | Agent 5 |  |  |  |

## Severity Rubric

- `P0`: core flow blocked, wrong role behavior, broken room recovery, duplicate participant creation, wrong user kicked, or state corruption
- `P1`: wrong layout mode, broken participant ordering, stale overflow/nav state, broken overflow menu action, reconnect regression with workaround only
- `P2`: visual defect, minor layout drift, tooltip/label issue, transient rendering lag, or cosmetic scrollbar/spacing issue

## Execution Order

1. Start `npm run dev`.
2. Launch 5 isolated Chrome sessions.
3. Join all 5 users into one room.
4. Run Agent 1, 2, and 3 viewport/device checks in parallel.
5. Run Agent 4 interaction checks while overflow conditions are active.
6. Run Agent 5 refresh/reconnect/regression checks while the room is still populated.
7. Consolidate findings into the pass/fail matrix.
