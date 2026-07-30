---
type: "query"
date: "2026-07-30T13:15:12.930779+00:00"
question: "Railway UAT ortamı build fail verdi, inceleyip çözer misin sorunu"
contributor: "graphify"
outcome: "useful"
source_nodes: ["admin/help/articles/route.ts", "admin/help/articles/route-logic.ts", "route-contract.test.ts"]
---

# Q: Railway UAT ortamı build fail verdi, inceleyip çözer misin sorunu

## Answer

Expanded from original query via vocab: [admin, help, articles, route, handler, dependencies, nextjs, request, typescript]. Root cause: new admin route modules exported injectable route-logic handlers directly; Next.js interpreted dependency parameters as route context. Fixed with thin Next-compatible wrappers in nine route.ts files and a repository-wide route signature contract. Focused tests passed 56/56; @wizards/web production build exited 0.

## Outcome

- Signal: useful

## Source Nodes

- admin/help/articles/route.ts
- admin/help/articles/route-logic.ts
- route-contract.test.ts