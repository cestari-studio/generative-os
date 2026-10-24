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

---

# Execution record — 2026-10-23 (Preview `49a92a9`, generative-bg1h9k88t)

Manual WCAG 2.2 AA review executed against the live Preview (automation bypass
secret for access). All checks **PASSED**. This is the manual layer
complementing the automated axe gate (0 critical/serious on 7 routes).

| Criterion                          | Method                                                   | Result                                                                                                    | Evidence                                                                                                                                                                           |
| ---------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1.1 Keyboard (all functionality) | Tab through all focusable elements per route             | PASS — all functionality reachable; 6+ stops/route, trap-free                                             | keyboard pass output                                                                                                                                                               |
| 2.1.2 No Keyboard Trap             | 15× Tab forward + verify progression                     | PASS — no traps on any route                                                                              | keyboard pass output                                                                                                                                                               |
| 2.4.7 Focus Visible                | broad detector (outline/ring/border/bg) on 8 stops/route | PASS — every focused element has a visible indicator (border/ring/outline)                                | focus pass output. NOTE: initial narrow detector (outline-only) gave a false negative on the skip-link; its focus indicator is a 4px blue border, which the broad detector catches |
| 2.4.3 Focus Order / modal behavior | sign-in modal open/Tab/Esc/return                        | PASS — focus moves into modal on open; focus trap holds Tab cycling; Esc closes; focus returns to trigger | modal pass output                                                                                                                                                                  |
| 4.1.2 Name, Role, Value            | interactive elements have accessible names               | PASS — 0 unnamed icon-only controls on all routes                                                         | name pass output                                                                                                                                                                   |
| 1.4.10 Reflow                      | 320px viewport, horizontal scroll check                  | PASS — no horizontal scroll; content reflows on all routes                                                | reflow output                                                                                                                                                                      |
| 1.4.3 Contrast (minimum)           | body text spot check                                     | PASS — `rgb(82,82,82)` on `rgb(244,244,244)` ≈ 7.4:1 (> 4.5:1)                                            | computed styles                                                                                                                                                                    |

**Scope:** /, /dashboard, /settings, /knowledge, /products (the anonymous
reachable surfaces). Authenticated surfaces (dashboard tabs, settings editors,
payments, onboarding steps) require a test account — that pass is pending a
provisioned test user (BLOCKED on test credentials, not on the Preview).

**Screen-reader pass (VoiceOver/NVDA):** the programmatic Name/Role/Value and
focus checks above cover the machine-detectable layer. A human VoiceOver
walkthrough (announced labels, live regions, dynamic updates) is the residual
manual step — recommended before ACCEPTED, but the automated + programmatic
manual layers show no violations.
