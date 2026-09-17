# GitHub-hosted CI/CD

All active workflows use GitHub-hosted runners. No local runner, persistent pnpm store, preinstalled custom Android SDK, or local Windows release machine is required.

| Workflow                    | Runner                         | Trigger / effect                                                                         |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| CI                          | `ubuntu-24.04`                 | PR, push, schedule and manual quality checks                                             |
| Desktop Native Build        | `windows-2025`                 | Desktop-related PR/push changes and manual unsigned Windows build                        |
| Desktop Release             | `windows-2025`, `ubuntu-24.04` | Manual Windows signing, updater validation and optional R2/GitHub Release publication    |
| Mobile Release              | `ubuntu-24.04`                 | Existing protected, manual UAT OTA/APK flow; local EAS build runs inside Actions         |
| Mobile device evidence gate | `ubuntu-24.04`                 | Existing scheduled/manual evidence checks; does not manufacture physical-device evidence |

macOS builds/releases are disabled. Actions never automatically deploys Railway. Desktop stable releases retain their manual guards; they do not deploy the web application.

## Railway deployment remains unchanged

Railway keeps its existing GitHub integration and automatic deployment settings. GitHub Actions does not upload sources, invoke Railway deployment APIs, or require `RAILWAY_TOKEN`. Do not disconnect service sources or change production/UAT triggers as part of this migration.

The existing `railway.toml` and `railway.outbox-worker.toml`, web pre-deploy migration commands, service environment variables, healthchecks and deployment order remain Railway-managed. GitHub-hosted CI completion is not proof of Railway deployment success. Inspect Railway deployment status separately. Waiting for CI before deployment depends on the existing Railway integration settings; this change adds no new Actions gate to Railway.

## Windows release configuration

Use protected `desktop-uat` and `desktop-stable` environments. Permit `uat` only for `desktop-uat`, `main` for stable; keep approval requirements for production publication. Dispatch UAT from `uat`, stable from `main`. Both rings can currently start regardless of CI status, including pending or failed runs; operators must review CI evidence separately before production publication. Release-contract, signing, updater and publication checks still apply to both rings.

Secrets (environment or existing repository secrets):

- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: updater signing.
- `WINDOWS_CERTIFICATE_PFX_BASE64`, `WINDOWS_CERTIFICATE_PASSWORD`: required only with `windows_signing=true` for optional Windows Authenticode signing.
- `CLOUDFLARE_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: optional R2 publishing.
- `WHISPR_DESKTOP_SENTRY_DSN`: optional telemetry; the existing variable is accepted as fallback.

Variables: `WHISPR_DESKTOP_UPDATER_PUBLIC_KEY`; `WHISPR_DESKTOP_WINDOWS_SIGNING_CERT_KIND` (`OV` or `EV` required only when stable Authenticode signing is requested). UAT may use a self-signed certificate when Windows signing is requested. `GITHUB_TOKEN` is supplied automatically; only the publish job grants `contents: write`.

`windows_signing=false` is the default for both rings and allows Windows installers without an Authenticode certificate; users may see an unknown-publisher or SmartScreen warning. `enable_updater=true` still requires Ed25519 updater signatures and HTTPS manifests. `publish_r2=true` requires updater support; `publish_github_release=true` also requires R2 publication. With both publication switches off, build evidence remains downloadable from the Actions run without updating the public feed.

Installer and signature uploads are conditional writes: an existing release path cannot be overwritten. Immutable release manifests are retained beside them before `latest.json` is advanced. Do not rerun a partially published build to replace signed artifacts. Use a fresh dispatch/tag for UAT; stable requires a new native version. If only GitHub Release creation failed after R2 succeeded, reconcile the release using the already-published artifacts after review. Retain the previous signed manifest for rollback. See [desktop release guide](../../apps/desktop/RELEASE.md) for updater and manual Windows acceptance checks.

## Hosted Android setup

The existing pinned JDK, SDK, NDK, CMake and EAS versions are provisioned on fresh VMs. `prepare-hosted-android.sh` reclaims unused preinstalled toolchains only when `RUNNER_ENVIRONMENT=github-hosted` and checks for 20 GiB free before provisioning. It refuses to run on developer/self-hosted machines. Mobile secrets and EAS-managed credentials retain the existing `mobile-uat` configuration; a hosted runner does not replace missing credentials or device acceptance.

## Validation and operational evidence

From the repository root:

```powershell
pnpm.cmd actionlint
pnpm.cmd test:toolchain
pnpm.cmd --filter @wizards/desktop test
node --test apps/mobile/scripts/mobile-release-workflow.test.mjs
```

Local contracts prove workflow structure and release guards. They do not prove GitHub runner capacity, a signed Windows installer, a healthy Railway rollout or real-device behavior. Keep actual Actions URLs, deployment IDs, signed artifact hashes and manual acceptance separately.

References: [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners), [Railway CLI deployment behavior](https://docs.railway.com/cli/deploying), [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), [R2 conditional operations](https://developers.cloudflare.com/r2/api/s3/api/).
