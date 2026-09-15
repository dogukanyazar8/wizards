# Mobile OTA signing trust roots

Only public X.509 certificates belong in this directory. Private keys must stay
outside the repository and enter CI through environment-scoped secrets.

## UAT 2026-01

- Key id: `whispr-mobile-ota-uat-2026-01`
- Certificate: `uat/certificate.pem`
- Subject: `CN=Whispr Mobile OTA UAT 2026-01`
- Validity: 2026-07-30 through 2027-07-30
- SHA-256 fingerprint:
  `A8:36:EB:B9:76:09:0F:8D:BE:EB:E9:82:C9:5B:6B:CB:CB:1A:FF:D1:79:5E:BE:72:65:43:95:B5:AE:9F:A4:3A`
- Local private-key location:
  `%USERPROFILE%\.secrets\whispr-mobile-ota\uat\private-key.pem`
- GitHub `mobile-uat` environment secret: `WHISPR_MOBILE_OTA_PRIVATE_KEY`

Production OTA must receive separate key pairs, certificates, and
environment-scoped secrets before OTA is enabled for those profiles. Never copy
the UAT certificate into another profile as a fallback.

Android APK signing is unrelated to this certificate. Internal APK builds must
continue using the existing EAS Android application-signing credential; do not
generate a replacement keystore.

The first UAT APK containing `expo-intent-launcher` and
`REQUEST_INSTALL_PACKAGES` still requires manual installation. Later internal
APK updates can use the in-app installer.
