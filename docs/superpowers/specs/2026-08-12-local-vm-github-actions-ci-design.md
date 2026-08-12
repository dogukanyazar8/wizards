# Local VM GitHub Actions CI/CD Design

## Goal

Run repository CI and supported release work on the user's own virtual machines without consuming
CircleCI credits. GitHub Actions remains the control plane; self-hosted Linux VMs provide compute.

## Current evidence

- GitHub repository has two registered runners:
  - `wizards-ci-fast`: labels `self-hosted`, `Linux`, `X64`, `ci-fast`.
  - `wizards-linux-local`: labels `self-hosted`, `Linux`, `X64`, `wizards-ci`, `playwright`,
    `mobile-release`.
- Both runners were `offline` during design inspection on 2026-08-12.
- UAT CI run `31575315660` was queued because no matching runner was online.
- Existing GitHub workflows already route automatic work only to these labels.
- CircleCI is still configured under `.circleci/`, but a zero-credit account cannot start even
  self-hosted runner work because CircleCI requires a positive credit balance.
- Hyper-V is available, but the current shell cannot enumerate or start VMs without elevated
  Hyper-V authorization.
- The working tree contains unrelated mobile and Graphify work. CI/CD implementation must stage
  only its own files.

## Chosen architecture

GitHub Actions becomes the only repository CI/CD orchestrator.

- `wizards-ci-fast` handles short, low-resource checks: actionlint, toolchain contracts,
  TypeScript shadow checks, and Linux desktop operations.
- `wizards-linux-local` handles Docker-dependent and resource-heavy work: main verification,
  Semgrep, Playwright E2E, accessibility, visual checks, device evidence, and mobile release.
- Existing label-based routing remains. No Kubernetes, autoscaling controller, remote cache, or
  third runner is introduced.
- CircleCI repository configuration and its contract tests are retired. The CircleCI project is
  disabled in CircleCI so pushes no longer create blocked pipelines.
- Mobile UAT OTA/APK publication remains manual and protected in GitHub Actions. No automatic
  production release is added.
- Railway deployment integration is not silently changed. GitHub CI success, Railway deployment,
  database migration, mobile artifact publication, and device acceptance remain separate evidence.

## Trust and security boundaries

- Persistent self-hosted VMs never execute `pull_request` code. Existing
  `github.event_name != 'pull_request'` guards remain fail-closed.
- Repository and workflow permissions stay least-privilege. Secrets remain in GitHub environments
  or runner-local secret stores; no token is written to source, logs, commands, or chat.
- `wizards-linux-local` has Docker access, which is root-equivalent. Only trusted `uat`, `main`,
  schedule, tag, and explicit manual-dispatch work may reach it.
- Mobile publishing keeps `uat`, `mobile-uat`, protected environment, immutable artifact key,
  checksum, and post-upload verification guards.
- A runner must operate as a dedicated service account. Runner work directories must not contain
  developer credentials or mounted host-home directories.
- VM administration stays outside workflow jobs. Workflows cannot start, stop, reconfigure, or
  elevate their own host.

## Runner lifecycle

Both VMs use automatic host-start behavior where available and run GitHub Actions runners as
systemd services.

Required operational checks:

1. Hyper-V starts both Ubuntu VMs.
2. Each VM has outbound HTTPS access on port 443.
3. Runner service is enabled and active.
4. GitHub reports the expected runner name and labels as `online`.
5. Docker, Node `24.18.0`, pnpm `11.20.0`, and required Android/Playwright tooling pass the existing
   preflight contracts.

Failure behavior:

- Offline matching runner: job remains queued; no hosted fallback consumes money.
- Toolchain drift: preflight fails before tests or release mutation.
- Heavy-runner outage: fast checks may finish, but aggregate CI remains non-green.
- Release-runner outage: publication remains queued or fails before any remote artifact mutation.

## Workflow model

### Automatic CI

- Trigger: trusted pushes to `uat` and `main`, existing schedules, and approved tags.
- Fast VM: actionlint, toolchain/type compatibility, desktop Linux checks.
- Heavy VM: verify, Semgrep, build, E2E smoke, cross-browser, accessibility, visual evidence.
- Concurrency cancellation remains enabled for superseded non-tag runs.
- A single aggregate required check should eventually represent all mandatory same-SHA jobs. The
  repository workflow contract must test its `if: always()` and dependency list before enabling a
  GitHub ruleset requirement.

### Pull requests

PR events remain non-executing on persistent VMs. They may show skipped status until an isolated
ephemeral runner is explicitly designed later. This project does not add that complexity now.

### Mobile release

`mobile-release.yml` remains manual. `wizards-linux-local` retains the `mobile-release` label and
executes preflight, contract, OTA, and APK jobs only under existing UAT/environment guards.

### Device evidence

Nightly/manual device evidence stays on `wizards-linux-local`. Artifact upload remains bounded and
does not imply release acceptance by itself.

## Repository changes

- Remove `.circleci/config.yml` and `.circleci/main.yml`.
- Replace `scripts/quality/circleci-config-contract.test.mjs` with a GitHub-only CI contract or fold
  its still-relevant golden-image/toolchain assertions into existing GitHub workflow contracts.
- Update `docker/ci/README.md` and `docker/ci/IMAGE` comments so the image is documented as local
  runner tooling, not a CircleCI executor contract.
- Update toolchain tests that currently require CircleCI files.
- Keep `.github/workflows/ci.yml`, `mobile-release.yml`, and
  `mobile-redesign-device-gate-nightly.yml` label routing and security guards.
- Add a small Windows-side runner health script only if it can discover VM names without secrets
  and fails read-only when Hyper-V authorization is unavailable. It must not embed registration
  tokens or SSH keys.

## External changes

Repository deletion alone does not disconnect the CircleCI GitHub App. After repository checks
pass:

1. Disable or stop building `dogukanyazar8/wizards` in CircleCI.
2. Do not delete the CircleCI organization, contexts, or credentials during the fast migration;
   retaining them makes rollback possible.
3. Start both VMs from an elevated Hyper-V session.
4. Enable and start both GitHub runner services inside their VMs.
5. Verify GitHub runner status and rerun queued UAT CI.

No secret value is requested or printed.

## Verification

- Test-first updates for workflow/toolchain contracts.
- `pnpm.cmd actionlint`.
- `pnpm.cmd test:toolchain`.
- Focused CI contract tests.
- `git diff --check` and staged Fast gate.
- GitHub runner API shows both expected names online with exact labels.
- A manual no-publish mobile preflight succeeds on the heavy VM.
- A UAT push or rerun reaches a green same-SHA GitHub CI result.
- CircleCI creates no new pipeline after disablement.

Local source checks do not prove VM health, remote GitHub CI, Railway deployment, release
publication, or device acceptance.

## Rollback

- Restore `.circleci/` and its contract test from the migration commit.
- Re-enable the CircleCI project.
- GitHub workflows remain usable throughout rollback; no force-push or credential rotation is
  required.
- VM runner services can be stopped independently without changing repository history.

## Acceptance criteria

- No active workflow references GitHub-hosted or CircleCI compute.
- All automatic supported jobs route only to the two registered local Linux runner labels.
- Persistent runners do not execute pull-request code.
- CircleCI no longer starts pipelines for repository changes.
- Both local runners are online and accept their matching jobs.
- Same-SHA GitHub CI is green on `uat`.
- Mobile release remains manual, guarded, and no-publish preflight passes.
- Unrelated dirty mobile/Graphify work remains byte-for-byte unstaged by this migration.
