---
type: "query"
date: "2026-07-30T16:04:33.195221+00:00"
question: "Sentry GET /admin/releases ApiError Unauthorized nedir?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["requireAdminUser()", "requireAdminModule()", "AdminReleasesPage()", "AdminLayout", "Sentry"]
---

# Q: Sentry GET /admin/releases ApiError Unauthorized nedir?

## Answer

Expanded from original query via vocab: admin, releases, unauthorized, auth, authorization, session, route, handler, sentry, user, access, api. UAT release b20d73ea rejected a GET /admin/releases request because auth() returned no session user id. requireAdminUser throws ApiError Unauthorized 401; requireAdminModule intentionally catches only 403 and rethrows 401. Admin layout runs login redirect and admin capability checks concurrently, while the page also runs capability and release query concurrently, so the 401 can win and become an unhandled Next request error. onRequestError forwards it directly to Sentry without filtering expected auth errors. Access control worked; likely expired or missing session. User-facing redirect and observability classification are faulty; no evidence of breach or database failure.

## Outcome

- Signal: useful

## Source Nodes

- requireAdminUser()
- requireAdminModule()
- AdminReleasesPage()
- AdminLayout
- Sentry