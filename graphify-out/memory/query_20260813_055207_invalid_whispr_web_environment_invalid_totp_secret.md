---
type: "query"
date: "2026-08-13T05:52:07.977275+00:00"
question: "Invalid Whispr web environment invalid TOTP_SECRET_ENCRYPTION_KEYS"
contributor: "graphify"
outcome: "useful"
source_nodes: ["env.ts", "parseTotpSecretKeyring()", "totp-secret-encryption.ts"]
---

# Q: Invalid Whispr web environment invalid TOTP_SECRET_ENCRYPTION_KEYS

## Answer

Root cause confirmed without exposing secret: apps/web/.env has both TOTP variables but TOTP_SECRET_ENCRYPTION_KEYS still contains the tracked example placeholder. parseTotpSecretKeyring rejects it because each JSON keyring value must be canonical base64url decoding to exactly 32 bytes and active version must exist in the map. For a fresh local database, generate a new random 32-byte local key and replace only the placeholder. For existing encrypted TOTP rows, restore the original key; replacing it makes ciphertext undecryptable.

## Outcome

- Signal: useful

## Source Nodes

- env.ts
- parseTotpSecretKeyring()
- totp-secret-encryption.ts