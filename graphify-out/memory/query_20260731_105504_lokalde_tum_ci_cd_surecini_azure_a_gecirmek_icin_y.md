---
type: "query"
date: "2026-07-31T10:55:04.997963+00:00"
question: "Lokalde tum CI/CD surecini Azure a gecirmek icin yaptigimiz calismalar ne durumda?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["deployment", "railway-contract.test.ts", "readiness"]
---

# Q: Lokalde tum CI/CD surecini Azure a gecirmek icin yaptigimiz calismalar ne durumda?

## Answer

Azure pipeline implementasyonu local codex/azure-cicd-modernization worktree sinde 71136278 commitinde PASS: PR Gate, UAT validation/deploy ve nightly var; Azure pipeline contract testleri 17/17 PASS. Commit uat HEAD in ancestor i degil, upstream i yok ve aktif uat checkout ta pipeline dosyalari yok. Azure DevOps nesneleri, gizli degiskenler, YAML preview, shadow run ve live Railway deploy NOT RUN. Release pipeline bilerek yok; GitHub Actions merge authority ve aktif kalacak.

## Outcome

- Signal: useful

## Source Nodes

- deployment
- railway-contract.test.ts
- readiness