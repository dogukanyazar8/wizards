---
type: "security-review"
date: "2026-07-31T05:10:37.309588+00:00"
question: "OWASP Top 10 security review: auth authorization validation crypto APIs configuration logging session upload"
contributor: "graphify"
outcome: "useful"
---

# Q: OWASP Top 10 security review: auth authorization validation crypto APIs configuration logging session upload

## Answer

4 confirmed findings: High refresh-token grace replay mints multiple successor refresh chains; Medium APK verification checks bytes but not package identity or pinned signer; Medium mobile auth rate limiting trusts public X-Forwarded-For and User-Agent; Medium TOTP and OAuth provider credentials are stored plaintext at rest. No confirmed Critical finding. pnpm production audit clean; cargo audit returned allowed warnings; full Semgrep Docker scan blocked by Windows bind-mount timeout while 10/10 rule fixtures passed.

## Outcome

- Signal: useful