# Authentication Security Notes

## Two-Factor Authentication

- TOTP is the phase 1 two-factor method for Whispr web accounts.
- Setup keeps `twoFactorEnabled` false until the first authenticator code is confirmed.
- Recovery codes are stored only as hashes and are consumed once.
- TOTP and recovery-code checks use an account-scoped attempt counter with exponential backoff.
- Disabling 2FA requires the current password plus a valid authenticator or recovery code.

## Phase 2

WebAuthn/passkey support should be added as a separate phase after TOTP. It should be offered as an additional authenticator option, not as a replacement for TOTP recovery behavior.
