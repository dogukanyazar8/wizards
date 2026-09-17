---
type: "query"
date: "2026-09-17T11:12:19.728228+00:00"
question: "Railway prod ortamında worker ve clamav değişkenleri nasıl olmalı, eksiksiz bir şekilde paylaşır mısın"
contributor: "graphify"
outcome: "useful"
source_nodes: ["worker.ts", "ClamAvScanOptions", "outbox/service.ts", "pool-options.ts", "Sentry"]
---

# Q: Railway prod ortamında worker ve clamav değişkenleri nasıl olmalı, eksiksiz bir şekilde paylaşır mısın

## Answer

Expanded from original query via graph vocab: outbox worker clamav attachment scan uploadthing railway database redis permission performance sentry pool interval batch. Source verification: worker requires production DATABASE_URL and REDIS_URL; attachment jobs require production UploadThing token and private ClamAV host/port; recommended operational values are batch 25, interval 5000ms, shutdown 10000ms, scan socket timeout 30000ms, fetch timeout 120000ms, max bytes 33554432, DB pool max 2. ClamAV service needs no custom application variables; Railway variables are automatic. Production live check found worker FAILED with one replica, missing DATABASE_URL, UAT Redis/Sentry values, no config file/start command; keep replicas zero until main merge and correct variables. Production ClamAV is running but lacks its /var/lib/clamav volume.

## Outcome

- Signal: useful

## Source Nodes

- worker.ts
- ClamAvScanOptions
- outbox/service.ts
- pool-options.ts
- Sentry