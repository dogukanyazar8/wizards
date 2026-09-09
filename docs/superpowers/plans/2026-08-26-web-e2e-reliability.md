# Web E2E Reliability Remediation Plan

**Goal:** Resolve the 109 reported local Chromium E2E failures by separating real product defects, stale assertions, deterministic test bugs, and failures cascading from the managed development server.

**Architecture:** Keep product behavior authoritative. Run the default managed E2E server from an immutable production build so a long suite cannot invalidate Turbopack chunk URLs mid-run; preserve an explicit local development-server opt-in for narrow authoring loops. Fix two genuine accessibility defects at their component boundaries. Update only assertions whose current expectation conflicts with source contracts or reference artifacts, and replace immediate reads of effect-owned UI state with bounded eventual assertions.

**Constraints:** Do not run workflows, CI, deploys, commits, pushes, or remote services. Preserve all unrelated dirty-worktree changes. Do not update visual baselines on Windows; inspect visual diffs and report any platform-gated baseline work separately.

---

## Task 1: Make the managed local E2E server immutable

**Files:**

- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/src/lib/e2e/playwright-config.test.ts`

1. Change the config contract test first: plain local Playwright must use the production build, while an explicit local opt-in must retain the development server.
2. Run the focused config test and observe it fail against the old local-development default.
3. Add one `useDevelopmentWebServer` decision in `playwright.config.ts`.
4. For the default and CI paths, set both production-build E2E gates, `NODE_ENV=production`, `pnpm run e2e:web-server`, and no existing-server reuse.
5. Keep `E2E_USE_DEV_SERVER=1` as a local-only opt-in using `pnpm dev`, development mode, and reuse.
6. Run the focused config contract again.

## Task 2: Repair genuine accessibility defects

**Files:**

- Modify: `apps/web/src/components/ui/avatar.tsx`
- Modify: `apps/web/src/components/ui/avatar.test.tsx`
- Modify: `apps/web/src/components/chat/message-list.tsx`
- Verify: `apps/web/e2e/specs/a11y/a11y.spec.ts`
- Verify: `apps/web/e2e/specs/a11y/messages-a11y.spec.ts`

1. Add an Avatar render test proving an empty `alt` never produces `role="img" aria-label=""`.
2. Observe the focused unit failure.
3. Give the Avatar wrapper one non-empty accessible name from trimmed `alt`/fallback, or remove it from the accessibility tree when neither exists. Keep a nested native image decorative so only one image semantic is exposed.
4. Add `tabIndex={0}` to the message list's scrollable `role="log"` boundary.
5. Run the Avatar/unit checks, then the two exact Axe E2E checks.

## Task 3: Correct stale or invalid E2E contracts

**Files:**

- Modify: `apps/web/e2e/specs/attachments/attachments.spec.ts`
- Modify: `apps/web/e2e/specs/design/downloads-report-parity.spec.ts`
- Modify: `apps/web/e2e/specs/design/home-side-screens.spec.ts`
- Modify: `apps/web/e2e/specs/design/home-command-palette.spec.ts`
- Modify: `apps/web/e2e/specs/design/messages-parity.spec.ts`
- Modify: `apps/web/e2e/specs/design/splash-parity.spec.ts`
- Modify: `apps/web/e2e/helpers/mobile-quality.ts`
- Modify: `apps/web/e2e/specs/settings/settings-window.spec.ts`
- Modify: `apps/web/e2e/specs/voice/voice.spec.ts`

1. Assert permission-disabled attachment/GIF actions are absent, while the hidden file input remains disabled; do not restore forbidden controls.
2. Set and restore Turkish locale explicitly in Turkish reference specs so execution order cannot determine copy.
3. Use the canonical `/messages/friends` route and wait for Home hydration before keyboard commands.
4. Extend the existing closed tap-target exception list with the three composer controls whose 34/36 px sizes come directly from `SERVER_METRICS.composer`.
5. In splash parity, scope copy assertions to the visible steps, validate the reference's structural left-panel/right-column placement rather than unrelated Y coordinates, and lengthen the intercepted startup window so assertions—not dev compilation—own the deadline.
6. Remove the invalid Playwright cookie `path` when `url` is supplied.
7. Accept the settings row's stronger inert gate as a valid no-mutation lock, while continuing to require disabled descendants when no gate exists.
8. Target `server-voice-tile-name` instead of the removed paragraph element.
9. Run each formerly red focused test immediately after its change.

## Task 4: Stabilize eventual parity reads and artifacts

**Files:**

- Modify: `apps/web/e2e/helpers/design-parity.ts`
- Modify: `apps/web/e2e/specs/design/messages-parity.spec.ts`
- Modify: `apps/web/e2e/specs/design/server-parity.spec.ts`
- Modify: `apps/web/e2e/specs/discover/discover.spec.ts`

1. Add a bounded `expect.poll` helper for the root font size applied by the client scale effect.
2. Replace immediate root-font reads in the reported Messages and Server matrices; keep exact expected sizes and use the observed value for downstream geometry.
3. Write Discover evidence through `testInfo.outputPath(...)` to avoid shared Windows file handles and future worker collisions.
4. Re-run representative base/FHD/QHD cases, member-panel behavior, and the affected Discover evidence test.

## Task 5: Re-run behavior clusters on the stable server

**Files:**

- Verify: `apps/web/e2e/specs/mentions/mentions.spec.ts`
- Verify: `apps/web/e2e/specs/message-interactions/message-interactions.spec.ts`
- Verify: `apps/web/e2e/specs/realtime/realtime.spec.ts`
- Verify: `apps/web/e2e/specs/settings/notification-panel.spec.ts`
- Verify: `apps/web/e2e/specs/settings/settings-window.spec.ts`
- Verify: `apps/web/e2e/specs/smoke/server.spec.ts`
- Verify: `apps/web/e2e/specs/voice/voice.spec.ts`

1. Run the exact originally failed tests before changing product behavior.
2. If a failure remains without chunk/network cascade evidence, trace it to source/API state and add the smallest regression fix.
3. Confirm voice cleanup after every test; do not mask a 409 with retries or error-message widening.

## Task 6: Final local verification and evidence boundaries

**Files:**

- Verify: all changed unit/E2E files
- Verify: `apps/web/e2e/specs/visual/visual.spec.ts`

1. Run focused Node tests, web typecheck, and formatting/lint checks for changed files.
2. Run the four visual tests without updating snapshots. Inspect expected/actual/diff artifacts; update no baseline from Windows.
3. Run the complete local Chromium E2E command once on the stable production server.
4. Run `graphify update .` after source/test changes.
5. Report exact PASS/FAIL/SKIPPED/ENV BLOCKED counts. Distinguish any visual-baseline platform gate from functional E2E status.
