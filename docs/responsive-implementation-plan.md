# Responsive Requirements Check And Implementation Plan

## Goal

Bring the UI into alignment with the canonical responsive requirements in `REQUIREMENTS.md` and verify the result with explicit breakpoint and device-mode checks.

## Canonical Responsive Rules

- Desktop and laptops, including touchscreen laptops, use desktop mode.
- Desktop mode stays `120 px` tall, uses a single row, shows cards first and participants second.
- Desktop participant overflow uses `‹ ›` buttons only, with no visible scrollbar.
- Phones and tablets use touch mode.
- Touch mode uses swipe-only participant navigation with no visible scrollbar.
- Touch layouts below `600 px` width use two rows: participants first, cards second.
- Touch layouts at or above `600 px` width stay single-row, including portrait tablets.
- Narrow touch layouts may grow taller than `120 px`.
- Phones and tablets keep a single `36 px` toolbar row; secondary actions move into one overflow menu.
- My own participant chip stays first across all modes.

## Current Code Gaps To Check

### Layout mode detection

- `app.component.ts` still derives compact height from `window.innerWidth < 480`.
- The code does not yet express the product distinction between desktop/laptop mode and phone/tablet touch mode.

### Breakpoints and height model

- `app.component.scss` currently uses one `@media (max-width: 480px)` branch.
- The canonical stacked breakpoint is `< 600 px`, not `< 480 px`.
- The current compact height logic is still coupled to the old phone rule.

### Participant strip behavior

- Desktop chip navigation currently depends only on overflow, not on device class.
- Touch behavior hides the nav buttons inside the mobile media query, but the rule is too narrow and not tablet-aware.
- Touch scrollbars are still styled rather than fully hidden.

### Card row behavior

- Narrow touch layouts stack the cards row, but the card row still exposes a visible scrollbar.
- The card row should follow the same swipe-first, no-visible-scrollbar rule for touch layouts.

### Toolbar behavior

- The toolbar currently renders `Leave`, `Share`, and `Help` as always-visible icon buttons.
- There is no overflow menu for phones/tablets.
- The current mobile treatment hides timer controls, but the responsive spec now requires a clearer primary-vs-secondary toolbar split.

## Work Plan

### 1. Responsive audit

- Map current behavior in `src/app/app.component.ts`, `src/app/app.component.html`, and `src/app/app.component.scss` against the canonical rules.
- Record mismatches by area: layout mode, breakpoint, shell height, participant strip, card row, toolbar.
- Confirm whether any existing behavior should be preserved as a deliberate implementation choice rather than treated as drift.

### 2. Introduce explicit layout modes

- Add a small layout-mode model in `app.component.ts`.
- Distinguish desktop/laptop mode from phone/tablet touch mode.
- Keep touchscreen laptops in desktop mode.
- Use this mode to drive nav buttons, overflow menu visibility, and shell height decisions.

### 3. Replace the old mobile breakpoint model

- Replace the current `480 px` responsive branch with the canonical `< 600 px` / `>= 600 px` split for touch layouts.
- Keep desktop mode independent from that width threshold.
- Remove or rewrite any comments that still describe the old phone-only scaling model.

### 4. Rework compact shell and strip layout

- Keep desktop/laptop compact mode at `120 px`.
- Allow narrow touch layouts to grow taller as needed.
- Ensure `< 600 px` touch layouts stack as:
  - participants row first
  - cards row second
- Ensure `>= 600 px` touch layouts stay single-row with cards first and participants second.

### 5. Fix participant navigation behavior

- Show `‹ ›` buttons only in desktop/laptop mode and only when participant overflow exists.
- Hide participant scrollbars in both desktop and touch modes.
- Keep touch participant scrolling direct and swipe-driven.
- Preserve “my chip first” ordering after any layout refactor.

### 6. Align the card row with touch behavior

- Keep the card row horizontally scrollable on narrow touch layouts.
- Hide visible card-row scrollbars on touch layouts.
- Check that card sizes and spacing remain tappable after the breakpoint update.

### 7. Add a mobile/tablet toolbar overflow

- Keep one `36 px` toolbar row on phones/tablets.
- Preserve primary context in the main row:
  - room
  - timer/status
  - user identity
  - connection state
- Move secondary actions into one overflow entry for touch mode:
  - Leave
  - Share
  - Help
- Verify the toolbar does not wrap or become horizontally scrollable.

### 8. Clean up responsive CSS and template branching

- Remove obsolete `max-width: 480px` assumptions.
- Consolidate responsive rules so device-mode logic is not split across unrelated selectors.
- Keep the template readable by grouping touch-only and desktop-only controls behind clear conditions.

## Verification Plan

### Manual viewport checks

- `1280 x 800` desktop/laptop:
  - `120 px` compact shell
  - single row
  - participant nav buttons appear only on overflow
  - no visible participant scrollbar
- `1024 x 768` touchscreen laptop:
  - desktop behavior, not touch behavior
- `768 x 1024` portrait tablet:
  - touch behavior
  - single-row layout
  - swipe-only participant navigation
  - overflow menu present
- `430 x 932` phone portrait:
  - touch behavior
  - two rows
  - taller-than-`120 px` shell allowed
  - no visible participant or card scrollbar
  - overflow menu present
- `932 x 430` phone landscape:
  - touch behavior
  - single-row layout
  - swipe-only participant navigation

### Interaction checks

- Participant strip overflow updates correctly after join/leave events.
- Nav buttons stay hidden on touch devices even when overflow exists.
- “My chip first” still holds after reconnects and state refreshes.
- Overflow menu actions trigger the same behavior as the current toolbar buttons.
- No toolbar wrapping occurs at narrow widths.

### Regression checks

- Registration bar still works on narrow widths.
- SM controls remain usable on desktop/laptop.
- Timer, reveal, and Jira areas still behave correctly in compact and expanded states.
- Offline state and room meta remain legible after toolbar changes.

## Suggested Implementation Order

1. Add layout-mode detection and helper flags in `app.component.ts`.
2. Update template branching for toolbar actions and participant navigation.
3. Replace the old responsive SCSS with the canonical breakpoint and mode rules.
4. Run the manual viewport and interaction checks above.
5. Capture before/after screenshots for the main device classes if the UI needs review.

## Out Of Scope

- Visual redesign beyond what is required to satisfy the responsive rules.
- Reworking the Jira expanded area unless the responsive changes expose a concrete defect there.
- Broad component refactoring unless the current single-component structure becomes a real blocker.
