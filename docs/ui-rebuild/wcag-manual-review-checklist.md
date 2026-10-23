# WCAG 2.2 AA — Manual Review Checklist (human gate for ACCEPTED)

> **Purpose:** the automated axe layer (`scripts/axe-a11y.mjs`, CI browser-smoke
> job) covers machine-detectable violations only. This checklist is the manual
> layer required before any route may be marked `ACCEPTED`. It must be executed
> by a human reviewer against a reproducible environment (local production
> build or, once unblocked, the Preview URL at an exact SHA).
>
> **Status of automation:** axe — 0 critical/serious violations on 7 routes
> at SHA `409d0a9` (local run; CI artifact per SHA).
>
> **Nothing in this document has been executed yet.** Every box is unchecked
> on purpose — completing it requires the human reviewer.

## How to run

1. `npm run build && node src/server.js` (production build, local) or the
   Preview URL (BLOCKED_OWNER until Vercel access is restored).
2. For each route below, perform the keyboard-only pass, then the
   screen-reader pass (VoiceOver on macOS: Cmd+F5; NVDA on Windows).
3. Record the exact SHA, browser, OS, AT version, and any failure with a
   reproduction note. Failures block `ACCEPTED` for that route.

## Routes in scope

`/`, `/dashboard`, `/settings`, `/knowledge`, `/payments`, `/onboarding`,
`/products`, plus the sign-in modal and the not-found route.

## 1. Keyboard-only pass (per route)

- [ ] All interactive elements reachable via Tab/Shift+Tab in a logical order.
- [ ] Focus indicator visible on every focused element (Carbon default or
      custom equivalent, contrast ≥ 3:1 against adjacent colors).
- [ ] No keyboard traps — modals (sign-in, onboarding tearsheet) can be
      closed with Esc and return focus to the trigger.
- [ ] Tab panels switch with arrow keys per Carbon Tabs behavior; focus does
      not jump unexpectedly.
- [ ] DataTable sorting/pagination controls operable by keyboard.
- [ ] Header navigation (workspace switcher, user menu) fully keyboard
      operable.
- [ ] Skip-to-content link (or equivalent landmark structure) works.

## 2. Screen-reader pass (per route)

- [ ] Page title/heading hierarchy announced correctly (single h1, logical
      h2/h3 nesting).
- [ ] Loading states announce via `role="status"`/`aria-live` (protected
      gate loading, catalog loading).
- [ ] Honest state messages (empty/error/forbidden/unprovisioned) are
      announced — not just visually shown.
- [ ] Form fields (sign-in email/password, onboarding inputs, settings
      editors) have programmatic labels; errors are associated
      (`aria-describedby`/`aria-invalid`).
- [ ] Icon-only buttons have accessible names.
- [ ] Charts (dashboard) have text alternatives or an accessible data table
      equivalent.
- [ ] Dynamic content updates (tenant switch, settings apply, search
      results) are announced.

## 3. Visual/contrast pass (per route, white + g100 themes)

- [ ] Text contrast ≥ 4.5:1 (≥ 3:1 for large text) in both themes.
- [ ] Non-text UI contrast ≥ 3:1 for controls and indicators.
- [ ] Content usable at 200% zoom and at 320px width (reflow, no horizontal
      scroll except data tables with appropriate containers).
- [ ] No information conveyed by color alone (tags, statuses, chart series
      have labels/patterns).

## 4. Motion/interaction pass

- [ ] Animations respect `prefers-reduced-motion`.
- [ ] No content flashing more than 3 times per second.
- [ ] Touch targets ≥ 24×24 CSS px (WCAG 2.2 AA).

## 5. Evidence to attach

- [ ] Screen recording or timestamped notes per route/theme.
- [ ] AT + browser + OS versions; exact SHA and environment URL.
- [ ] List of failures with severity and owner; link to fix PRs.
- [ ] Reviewer name and date — this is a **human review record**, required
      by branch protection semantics for ACCEPTED status.

## Current blockers to execution

| Blocker                   | State                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- |
| Human reviewer assignment | `HUMAN_REVIEW_REQUIRED`                                                                                 |
| Preview environment       | `BLOCKED_OWNER` (local production build may be used instead — record it as LOCAL evidence, not Preview) |
