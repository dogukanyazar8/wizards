---
type: "security-review"
date: "2026-07-31T05:43:51.973015+00:00"
question: "Which reported security findings require fixes, and how should related work be grouped into implementation prompts?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["mobile/auth.ts", "android-apk-update-controller.ts", "two-factor.ts", "totp.ts", "proxy.ts", "auth/actions.ts", "oauth-email.ts", "link-preview.ts", "uploadthing/core.ts"]
---

# Q: Which reported security findings require fixes, and how should related work be grouped into implementation prompts?

## Answer

Eight work packages: atomic mobile refresh-token rotation; trusted client-IP and rate-limit hardening; TOTP secret envelope encryption plus replay prevention; Android APK package and publisher verification; OAuth provider-token minimization or encryption; shared password policy plus common/breached-password blocking; SSRF non-global IP denial; server-icon active MIME allowlist. Existing nonce-based CSP is not a confirmed fix finding and is excluded.

## Outcome

- Signal: useful

## Source Nodes

- mobile/auth.ts
- android-apk-update-controller.ts
- two-factor.ts
- totp.ts
- proxy.ts
- auth/actions.ts
- oauth-email.ts
- link-preview.ts
- uploadthing/core.ts