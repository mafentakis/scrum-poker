# Responsive Bug Report Retest

## Status

Resolved.

The desktop compact-layout regression is fixed. Desktop no longer falls into the stacked phone layout, and the responsive checks in the Chrome test plan now pass for desktop, touch laptop, tablet, phone portrait, and phone landscape.

## Fix Applied

- File: [app.component.scss](/C:/Users/Manolis/work/scrum-pocker/src/app/app.component.scss)
- Change: corrected the phone-only media query from `@media not all and (max-width: 480px)` to `@media (max-width: 480px)`

That inverted query was activating the narrow stacked compact shell outside the intended phone breakpoint.

## Environment

- App URL: `http://localhost:4200`
- Backend URL: `http://localhost:3000`
- Browser engine: local Chrome executable driven through Playwright
- Primary room used: `rt-419-fix1`
- Execution date: `2026-04-19`
- Retest harness: [responsive-retest.js](/C:/Users/Manolis/work/scrum-pocker/docs/responsive-retest.js)

## Retest Results

### 1. Desktop/Laptop passed

**1280 x 800**
- `shellHeight = 120`
- `compactHeight = 80`
- `compactFlex = row`
- first row = cards
- overflow menu absent
- direct `Leave`, `Share`, `Help` actions present

**1024 x 768 with forced participant overflow**
- `shellHeight = 120`
- `compactHeight = 80`
- `compactFlex = row`
- first row = cards
- desktop participant nav buttons visible: `2`
- overflow menu absent

### 2. Touchscreen laptop passed

**1024 x 768 desktop UA with touch enabled**
- stayed in desktop layout
- `shellHeight = 120`
- `compactFlex = row`
- first row = cards
- direct toolbar actions remained visible
- overflow menu absent

### 3. Tablet portrait passed

**768 x 1024 touch mode**
- `shellHeight = 120`
- `compactHeight = 80`
- `compactFlex = row`
- first row = cards
- desktop nav buttons hidden: `0`
- overflow menu present
- overflow menu items:
  - `Leave`
  - `Share`
  - `Help`

### 4. Phone portrait and landscape passed

**Portrait `430 x 932`**
- `shellHeight = 204`
- `compactHeight = 168`
- `compactFlex = column`
- first row = participants
- desktop nav buttons hidden: `0`
- overflow menu present

**Landscape `932 x 430`**
- `shellHeight = 120`
- `compactHeight = 80`
- `compactFlex = row`
- first row = cards
- desktop nav buttons hidden: `0`
- overflow menu present

### 5. My-chip-first persistence passed

**Participant `P-4`**
- chip order started with `P-4` before refresh
- chip order still started with `P-4` after refresh

### 6. Duplicate Scrum Master error passed

- inline error rendered as:
  - `SM-1 is already the Scrum Master in this room.`

## Notes

- The retest followed the ownership split from [responsive-chrome-test-plan-5-subagents.md](/C:/Users/Manolis/work/scrum-pocker/docs/responsive-chrome-test-plan-5-subagents.md) with isolated browser sessions for `SM-1`, `P-1`, `P-2`, `P-3`, and `P-4`.
- Additional temporary participants `P-5` through `P-18` were added only to force a real desktop overflow condition and verify desktop nav-button behavior.
- Chrome DevTools MCP startup was still unreliable in this environment, so the browser verification was executed against the local Chrome binary through Playwright instead.

## Not Revalidated In This Pass

- Offline/reconnect visual state
- Jira/timer/reveal interaction flow beyond the layout-adjacent checks above
