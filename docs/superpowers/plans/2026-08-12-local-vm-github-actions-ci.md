# Local VM GitHub Actions CI Implementation Plan

> **For Codex:** Apply tasks sequentially in this session. Preserve unrelated worktree changes and stage only listed CI/CD files.

**Goal:** Replace credit-blocked CircleCI execution with GitHub Actions jobs that run exclusively on the repository's local Linux VM runners.

**Architecture:** GitHub Actions remains the sole orchestrator. Existing `wizards-ci`, `ci-fast`, and `mobile-release` labels route work to `wizards-linux-local` and `wizards-ci-fast`; pull-request code stays off persistent self-hosted runners. CircleCI repository configuration is removed, while the existing CI image is documented as an optional local runner toolbox.

**Tech Stack:** GitHub Actions YAML, Node.js contract tests, PowerShell, Hyper-V/Linux systemd, pnpm.

---

### Task 1: Add a local-runner CI contract

**Files:**

- Create: `scripts/quality/github-local-vm-ci-contract.test.mjs`
- Remove: `scripts/quality/circleci-config-contract.test.mjs`

- [ ] Add assertions that CircleCI execution files are absent.
- [ ] Assert every active GitHub Actions `runs-on` target is one of the approved local runner label sets.
- [ ] Assert workflows that accept pull requests exclude PR jobs from persistent self-hosted runners.
- [ ] Run `node --test scripts/quality/github-local-vm-ci-contract.test.mjs`; observe RED while CircleCI files remain.

### Task 2: Remove CircleCI execution and update runner documentation

**Files:**

- Remove: `.circleci/config.yml`
- Remove: `.circleci/main.yml`
- Modify: `docker/ci/Dockerfile`
- Modify: `docker/ci/IMAGE`
- Modify: `docker/ci/README.md`
- Modify: `docs/prompts/cicd-circleci-2026-08/README.md`
- Create: `docs/operations/local-vm-github-actions.md`

- [ ] Delete active CircleCI configuration and its obsolete contract test.
- [ ] Reframe the CI container as an optional, reproducible local-runner toolbox without claiming GitHub Actions consumes it.
- [ ] Document runner labels, safe startup/health checks, service discovery, and the CircleCI project-disable boundary without secrets.
- [ ] Mark historical CircleCI prompts as superseded rather than rewriting historical evidence.
- [ ] Run the focused contract and `pnpm.cmd test:toolchain`; expect PASS.

### Task 3: Verify host/runner state and repository quality

**Files:**

- Modify generated graph under: `graphify-out/`

- [ ] Query GitHub runner status and the latest UAT workflow using read-only APIs.
- [ ] Query local VM state read-only; if host authorization blocks Hyper-V, report `ENV BLOCKED` and provide the exact elevated commands from the runbook.
- [ ] Run `graphify update .` using the configured interpreter.
- [ ] Run the narrow CI contract, toolchain suite, formatting check for changed files, and repository fast gate appropriate to the change.
- [ ] Review `git diff --check`, changed-file diff, and staged scope.

### Task 4: Deliver the narrow migration

**Files:**

- Stage only the files listed in Tasks 1-2 and deliberate graph outputs if required by repository hooks.

- [ ] Disable the CircleCI project through an authenticated UI/API only if the current project identity can be verified immediately before mutation.
- [ ] Commit only the CI/CD migration; do not stage unrelated application WIP.
- [ ] Push `uat` only after local verification and scope review succeed.
- [ ] Start the exact local CI VMs and runner services only after their identities can be verified; otherwise leave exact `ENV BLOCKED` instructions.
- [ ] Follow the same-SHA GitHub Actions run until green, fixing only evidenced failures and repeating verification as needed.
