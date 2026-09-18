# Unified release center

`/admin/releases` manages desktop/mobile history, notes, package evidence and withdrawal. `/admin/downloads` redirects here. Verified CI packages link to their release; their URL/hash/version cannot be edited independently. Existing manual/store download entries remain editable until replaced by a verified publication.

## Publication contract

The identity is `(product, channel, version)`. Existing releases migrate as MOBILE; desktop versions may now overlap mobile versions. Each publication stores its immutable packages, source commit, GitHub run and digest. The current download catalog and Android update artifacts are projections written in the **same PostgreSQL transaction** as release notes and publication. No cross-system transaction with R2 is claimed: upload comes first; only verified uploads may be registered. Unreferenced immutable uploads are harmless if finalization fails.

The final GitHub job streams the public R2 object and verifies SHA-256 and byte count. Desktop signature sidecar must also match the signed manifest; Android certificate verification remains in the APK build job. PostgreSQL serializes publication by product/channel. Versions must strictly increase, including after withdrawal. Android versionCode must also increase. A stale notes baseline fails rather than omitting intervening changes. Identical retries return the existing release and preserve administrator edits; changed package/source identity returns 409. A withdrawn/superseded version cannot be reactivated by retry.

Notes use relevant commits since the last registered source commit for the same product/channel. Associated merged PR titles and labels take precedence over commit subjects. `feat`/`enhancement`, `fix`/`bug`, and `perf`/`refactor` map to NEW, FIXED and IMPROVED. `security`, `internal`, `dependencies`, `release-note:skip`, and `skip-changelog` exclude entries. Add an exclusion label before releasing sensitive/internal changes. The initial publication uses only the latest relevant commit because no earlier published boundary is known. More than 200 relevant commits fails explicitly. Notes remain editable in the release editor.

Desktop in-app updater and desktop/web notes use DESKTOP. Mobile history and update decisions use MOBILE. Published history excludes withdrawn entries; superseded entries remain in history. Withdrawal removes active downloads and update offers, disables the release's OTA bundles, and retains the evidence/history in admin. It does not downgrade installed applications. Publish a higher native version for a corrective release.

## One-time rollout order

1. Back up the target database. Apply `20260918120000_release_center` through the normal Prisma migration deployment, then deploy the web application. Migration SQL is additive except for replacing global version uniqueness with product/channel/version uniqueness. Deploy migration and application in a coordinated window: the previous generated Prisma client still assumes globally unique versions. Do not run an old seed against the new schema.
2. Configure these web environment variables separately in UAT and PROD:

   | Variable                              | UAT                                                         | PROD                                         |
   | ------------------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
   | `WHISPR_RELEASE_CHANNEL`              | `UAT` (also `uat`/`beta`)                                   | `STABLE` (also `stable`/`prod`/`production`) |
   | `WHISPR_RELEASE_GITHUB_REPOSITORY`    | Exact `owner/repository`                                    | Same expected repository                     |
   | `WHISPR_RELEASE_GITHUB_REPOSITORY_ID` | GitHub numeric repository ID                                | Same ID                                      |
   | `WHISPR_RELEASE_GITHUB_OWNER_ID`      | GitHub numeric owner ID                                     | Same ID                                      |
   | `WHISPR_RELEASE_OIDC_AUDIENCE`        | `https://wizardsweb-uat.up.railway.app/release-publication` | `https://whispr.team/release-publication`    |

   The publication endpoint accepts only short-lived GitHub OIDC JWTs: signature, issuer, audience, expiry, repository/owner IDs, workflow path, branch, protected environment, event, source SHA and run ID are checked. No admin-session or long-lived-token fallback exists on this endpoint. The existing OTA publisher credential remains solely for the existing signed OTA flow.

3. Configure Cloudflare redirects for **exactly** these two legacy feed paths (307, preserve no query string), with cache bypass. Purge cached old feeds/404s once:

   - `https://updates.whispr.team/desktop/uat/latest.json` to `https://wizardsweb-uat.up.railway.app/api/v1/releases/desktop/uat/latest.json`
   - `https://updates.whispr.team/desktop/stable/latest.json` to `https://whispr.team/api/v1/releases/desktop/stable/latest.json`

   Immutable `/desktop/{ring}/releases/...` objects stay on R2. The API returns no-store and 204 before its first publication. That temporarily means no update offer; installed clients continue working. New installers use the API endpoint directly. The publisher refuses to finalize unless the legacy redirect and canonical feed marker are present, ensuring old installations obey withdrawal too. Do not restore static mutable `latest.json` uploads after this cutover.

4. Keep protected GitHub environments `desktop-uat`, `desktop-stable`, `mobile-uat`, their branch restrictions/review requirements and existing signing/R2 secrets. Only `finalize-release` gets `id-token: write`; it also needs `contents: read` and `pull-requests: read`. R2 credentials remain independently scoped to the release bucket. GitHub OIDC is for the Whispr publication API, not an assumed R2 federation feature.
5. Deliver workflow changes to the appropriate branches. Dispatch Desktop Release with `publish_r2=true`, or Mobile Release with `kind=apk`, `environment=uat` and a new version. APK no longer needs `release_id`. Build/sign/upload succeeds first; `finalize-release` then publishes packages and notes automatically. Build-only/preflight runs never change the catalog.
6. Verify the release editor, public download catalog, desktop feed and Android update decision. Run native smoke tests on a signed desktop installer and an internal Android build before Stable promotion.

No migration, environment change, Cloudflare redirect, GitHub dispatch, push or deployment is performed by the local implementation task.

## Failure and recovery

- If **finalize-release** fails, use GitHub **Re-run failed jobs** on the original run. Upstream build/upload artifacts are reused; no new binary build is needed. Desktop build evidence and Android publication metadata are retained for 30 days. A full rerun may encounter immutable R2 object conflicts; prefer the failed-job retry.
- If the version was superseded or withdrawn, publish a newer version. Do not change an existing version's bytes or manually reactivate its downloads.
- An identity conflict requires inspecting the original SHA/artifacts. It is not fixed by blind retries or overwriting R2 keys.
- If artifact retention has expired, retain/recover the exact original verified evidence before attempting recovery; rebuilding a different binary under an existing immutable key is forbidden.
- Admin corrections to notes are retained on publication retries. An administrator can prepare draft notes in advance; a nonempty authored draft list takes precedence over generated notes.

## Existing distribution boundaries

Android internal APK publication remains UAT-only. Production Android/iOS store delivery is not enabled or falsely marked complete by uploading a file to R2. Existing store links remain manageable in the center. OTA keeps its existing signed manifest, matching runtime fingerprint, rollout and UAT trust root. Its `release_id` points to a published MOBILE release (available after APK publication); it cannot attach to a withdrawn/desktop release. Web deployments do not require rebuilding native clients unless their native package/runtime changes.

## Local verification

The new migration was applied to a disposable PostgreSQL 18.6 database created from the previous schema; Prisma reported no difference from the final schema. Transaction integration tests cover duplicate concurrent calls, rollback on projection failure, version/baseline ordering, independent product identities, note preservation, and withdrawal. Browser component tests exercise product/channel filters, linked packages, evidence, withdrawal and unchanged publication timestamps. Workflow/script tests, actionlint, TypeScript and targeted lint are run separately; these are not evidence of a live GitHub/Cloudflare/native rollout.
