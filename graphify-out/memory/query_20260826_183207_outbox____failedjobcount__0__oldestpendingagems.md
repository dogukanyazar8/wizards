---
type: "query"
date: "2026-08-26T18:32:07.141767+00:00"
question: "[outbox] { failedJobCount: 0, oldestPendingAgeMs: 0, processedJobs: 0, type: 'outbox_drain' } sürekli bu mesaj basılıyor, nedendir"
contributor: "graphify"
outcome: "useful"
source_nodes: ["startOutboxWorker()", "drainOutboxJobs()", "outbox/service.ts", "worker.ts"]
---

# Q: [outbox] { failedJobCount: 0, oldestPendingAgeMs: 0, processedJobs: 0, type: 'outbox_drain' } sürekli bu mesaj basılıyor, nedendir

## Answer

Expanded from original query via vocab: [outbox, drain, worker, jobs, pending, interval, poll, logger, logging, metrics, stats, report]. Yerel web dev sunucusu server.ts üzerinden startOutboxWorker() çağırır. WHISPR_OUTBOX_WORKER yalnız tam false olduğunda worker kapanır; yerel atama yoksa worker açıktır. Worker varsayılan 5000 ms setInterval ile drainOutboxJobs() çağırır. Her drain boş olsa bile logOutboxDrainMetrics() console.info ile outbox_drain telemetrisi yazar. Üç sıfır hata değil; kuyruk boş ve failed job yok.

## Outcome

- Signal: useful

## Source Nodes

- startOutboxWorker()
- drainOutboxJobs()
- outbox/service.ts
- worker.ts