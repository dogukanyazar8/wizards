# Coverage Ratchet Policy

Whispr enforces a baseline unit and integration coverage gate through the
`@wizards/web` `test:coverage` script.

Current baseline gate:

- Lines: 20%
- Branches: 61%
- Functions: 44%

These numbers are intentionally close to the current repository baseline. They
exist to prevent regression first, then improve steadily.

## Ratchet Rule

- Raise coverage thresholds only after the CI gate has stayed green on `uat` for
  a full sprint.
- Prefer small increases of 2-3 percentage points per sprint.
- Raise thresholds in the same PR as tests that make the new threshold stable.
- Do not lower thresholds unless the PR includes an explicit rationale and a
  follow-up issue or roadmap item.
- Keep branch/function thresholds meaningful. A line-only increase is not enough
  when risk lives in conditionals or error paths.

## Review Checklist

- `pnpm --filter @wizards/web test:coverage` passes locally.
- The coverage summary in `apps/web/coverage/coverage-summary.json` is at or
  above the proposed threshold with margin.
- New security or permission-boundary code includes targeted tests before the
  threshold is raised.
- Large UI-only additions that lower global coverage include either component
  tests or a documented reason for deferring them.
