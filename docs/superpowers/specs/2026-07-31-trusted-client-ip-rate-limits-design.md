# Trusted Client IP and Sensitive Rate Limits Design

## Goal

Remove spoofable proxy headers and `User-Agent` from security identities. Apply one
trusted client-IP policy plus independent account, email, user, token, recipient,
or installation limits to sensitive web auth, mobile auth, and update-manifest
flows.

## Constraints

- Work directly on `uat`.
- Preserve unrelated working-tree changes.
- Do not commit, push, deploy, or mutate Railway.
- Treat live Railway header validation separately from local tests.
- Never log raw proxy headers, email addresses, credentials, tokens, or user
  identifiers from security failures.

## Proxy Trust Boundary

Production traffic is assumed to reach the application through Railway public
HTTP networking. Railway documents `X-Real-IP` as the request header containing
the client's remote IP. Application code will therefore trust only one
`X-Real-IP` value at this boundary.

`X-Forwarded-For`, `Forwarded`, `CF-Connecting-IP`, and similar client-controlled
headers will not influence security identity. `CF-Connecting-IP` remains
untrusted because the repository and available deployment evidence do not prove
that the Railway origin is private or accepts traffic only from Cloudflare.

If Cloudflare becomes the required ingress later, this design must not silently
start trusting Cloudflare headers. Deployment must first lock the origin to
Cloudflare and introduce an explicit, tested Cloudflare trust policy.

Local tests prove application parsing and key construction. They do not prove
that the live Railway edge overwrites a client-supplied `X-Real-IP`; that check
remains `NOT RUN` without an authorized live observation mechanism.

## Central Client-IP Module

Create `apps/web/src/lib/security/client-ip.ts`.

### Interface

```ts
type HeaderSource = {
  get(name: string): string | null | undefined;
};

export function normalizeIpAddress(value: string | null | undefined): string | null;

export function getTrustedClientIp(headers: HeaderSource): string | null;

export function createClientRateLimitIdentity(input: {
  fallbackNamespace: string;
  fallbackValue: string;
  headers: HeaderSource;
}): string;

export function createSubjectRateLimitIdentity(namespace: string, value: string): string;
```

### Validation and Normalization

- Trim one `X-Real-IP` value.
- Reject absent, empty, comma-separated, multi-value, port-bearing, zone-scoped,
  or syntactically invalid input.
- Validate with Node's IP parser.
- Preserve canonical IPv4 decimal notation.
- Canonicalize IPv6 to lowercase compressed notation.
- Convert IPv4-mapped IPv6, including dotted and hexadecimal forms, to canonical
  IPv4.
- Return `null` for invalid input.

### Identity Privacy

Rate-limit identities use SHA-256 hashes with explicit namespaces. Redis keys
must not contain raw IP addresses, email addresses, tokens, installation IDs, or
user IDs.

`createClientRateLimitIdentity` uses canonical trusted IP when available. When
unavailable, it hashes the caller-provided secondary identity. Every sensitive
caller must provide a meaningful fallback; no global `unknown` bucket exists.

`User-Agent` is never accepted by either identity function.

## Rate-Limit Model

Sensitive unauthenticated flows use independent buckets:

1. Network bucket from trusted `X-Real-IP`.
2. Subject bucket from normalized account, email, user, credential/token
   fingerprint, recipient, or installation identity.

Changing IP does not reset the subject bucket. Changing account does not reset
the network bucket. Missing or invalid IP falls back deterministically to the
subject identity, avoiding one permanent bucket shared by all clients.

Existing Redis failure behavior remains fail-closed. Existing mobile login
failure tracking by normalized email and existing two-factor tracking by user ID
remain intact.

## Consumers

### Web Auth Server Actions

Update `apps/web/src/lib/auth/actions.ts`:

- `registerAction`: network bucket plus normalized email bucket. Preserve
  verification-email user and IP limits.
- `loginAction`: split the current composite `email + IP` key into independent
  network and normalized-email buckets. Preserve Turnstile, login proof, and
  credential/two-factor behavior.
- `forgotPasswordAction`: retain cooldown, email, and network limits; use trusted
  IP and hashed identities.
- `resendVerificationEmailAction`: retain cooldown, email, user, and network
  limits; use trusted IP and hashed identities.
- `resetPasswordAction`: add network and reset-token-fingerprint limits before
  token consumption.
- Pass canonical IP to Turnstile only when available. Do not send `"unknown"`.

Web limits preserve current subject limits:

- Login: 30 attempts per network per 15 minutes; 5 per email per 15 minutes.
- Registration: 10 per network per hour; 5 per email per hour.
- Password-reset request: 10 per network per hour; 5 per email per hour; existing
  one-minute combined cooldown retained.
- Verification resend: 5 per network per hour; 5 per email per hour; existing
  one-minute combined cooldown retained.
- Reset-token consume: 10 per network per hour; 5 per token fingerprint per hour.

### Mobile Auth

Update `apps/web/src/app/api/v1/mobile/auth/rate-limit.ts` and all callers:

- Build network identities only through the central module.
- Remove first-hop `X-Forwarded-For` parsing.
- Remove `User-Agent` from keys.
- Apply the existing action configuration independently to network and subject
  identities.
- Use normalized email for password login, registration, forgot-password, and
  verification-email.
- Use a Google credential fingerprint for Google sign-in replay protection.
- Use handoff-token fingerprint for exchange.
- Use refresh-token fingerprint for refresh and revoke.
- Preserve existing email login-attempt limits and user-based two-factor limits.

Route parsing may occur before the combined limiter so a deterministic subject
fallback exists. Existing 1 MiB JSON and schema validation boundaries remain.

### OTA Update Manifest

Update
`apps/web/src/app/api/v1/app/updates/manifest/route-logic.ts`:

- Remove `CF-Connecting-IP`, `X-Forwarded-For`, and `User-Agent` from rate
  identity.
- Apply independent network and installation/recipient buckets.
- Prefer validated Expo installation ID as subject; then current update ID; then
  a bounded tuple of channel, platform, and runtime version.
- Use the same subject as the deterministic network fallback when trusted IP is
  absent.
- Preserve signed manifest, `204`, cache, and safe-error behavior.

### Analytics

Update `apps/web/src/lib/analytics/client-info.ts` to use
`getTrustedClientIp` for `ipHash`. `User-Agent` may remain for non-security
browser, OS, device, and client attribution. It must not become a rate-limit or
authorization identity.

## Error and Logging Behavior

- Invalid or missing `X-Real-IP` is not logged with its raw value.
- Rate-limit failures expose existing safe `429` responses.
- Redis failures expose existing safe unavailable responses.
- Logs include action names and sanitized error context only.
- No raw header stack, email, token, installation ID, or user ID is added.

## Tests

Write failing tests before implementation.

### Central IP Tests

- Valid IPv4.
- Valid canonical and expanded IPv6.
- Dotted and hexadecimal IPv4-mapped IPv6 normalize to IPv4.
- Empty, whitespace-only, invalid, port-bearing, comma-separated, and multiple
  header values return `null`.
- Spoofed `X-Forwarded-For` does not alter identity.
- `CF-Connecting-IP` does not alter identity.
- Different `User-Agent` values produce the same security identity.
- Missing or invalid trusted IP uses deterministic subject fallback.

### Layering Tests

- Same IP with different accounts shares the network bucket but uses different
  account buckets.
- Different IPs attacking the same account, recipient, or installation use
  different network buckets but the same subject bucket.
- Redis keys contain no raw IP, email, token, user, or installation values.

### Flow Regression Tests

- Successful web registration, login, forgot-password, reset-password, and
  verification resend remain functional.
- Successful mobile password login, registration, Google sign-in,
  forgot-password, verification-email, exchange, refresh, and revoke remain
  functional.
- Successful OTA signed-manifest and `204` flows remain functional.
- Existing account/email/user/two-factor limits remain active.

## Verification

- Focused client-IP and rate-limit unit tests.
- Relevant web auth, mobile auth, password reset, verification, and OTA route
  tests.
- Web typecheck.
- Web lint.
- `git diff --check`.
- `graphify update .`.
- Final Git status/diff review proving unrelated WIP preservation.

Report each verification as `PASS`, `FAIL`, `NOT RUN`, or `ENV BLOCKED`.
Railway live header observation remains separate and must be reported `NOT RUN`
unless explicit authority and a safe observation path become available.
