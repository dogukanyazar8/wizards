# Release channels

Whispr publishes two channels:

| User label       | Environment | Database | Desktop feed | Mobile build / OTA channel |
| ---------------- | ----------- | -------- | ------------ | -------------------------- |
| Stable / Kararlı | PROD        | STABLE   | stable       | production                 |
| Beta             | UAT         | UAT      | uat          | uat                        |

`dev` and `development` are local development profiles, not publishing channels.
A saved legacy `uat` preference is read as `beta`. Channel preferences never change
an installed binary's API origin, signing identity, or OTA trust root. PROD and UAT
have separate data. Changing a preference does not move accounts or conversations.

## Publication

Desktop: validate Beta on `uat`, then publish Stable from `main` with explicit
confirmation, production signing, successful CI, UAT QA evidence, a rollback manifest,
and an assigned support owner. Keep update, crash, installation, and support monitoring.
Protected environments are `desktop-uat` and `desktop-stable`.

Mobile: `uat` is the internal Beta build; `production` is store distribution. Internal
APK installation is available only on Android UAT. The current OTA signing profile is
UAT only; production OTA remains disabled until a separate trust root is configured
and its publishing support is approved. Do not reuse UAT signing material in PROD.

## Database rollout

Migration `20260915120000_release_channels_stable_uat` removes the retired third enum
value. It moves legacy user preferences to UAT, but refuses to relabel any existing
release, download, APK, or signed OTA publication. If such rows exist, publication
must pause for operator review. The migration is transactional and takes table locks;
apply it in a controlled deployment window before enabling the updated application.
Never edit previously applied migration history.

No retired-channel binaries were distributed. No legacy feed redirect is required.
Old design references, dated plans, migration history, and third-party dependency
versions are historical inputs; this document defines the current channel contract.
External environments/secrets, if provisioned previously, need a separate operator
inventory. Repository changes do not remove remote resources or publish releases.
