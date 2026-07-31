---
type: "query"
date: "2026-07-31T10:47:13.528611+00:00"
question: "lokalimde bulunan iki tane self hosted runner ubuntu sanal makineyi projemizin CI/CD süreçlerinde en verimli şekilde kullanıyor muyuz? Görev paylaşımı, iş paylaşımı, doğru düzgün optimize performanslı bir şekilde yapılıyor mu?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["runner", "workflow", "actions", "desktop", "mobile", "release", "jobs"]
---

# Q: lokalimde bulunan iki tane self hosted runner ubuntu sanal makineyi projemizin CI/CD süreçlerinde en verimli şekilde kullanıyor muyuz? Görev paylaşımı, iş paylaşımı, doğru düzgün optimize performanslı bir şekilde yapılıyor mu?

## Answer

Expanded from graph vocabulary: [github, actions, workflow, runner, desktop, mobile, release, jobs]. Source and live GitHub audit: ci-fast and wizards-ci separate Docker-free vs Docker/E2E jobs, but current release runner shares wizards-ci with pull_request code. CI run 593 took 15m28; wizards-ci was the serial critical path while ci-fast idled after desktop jobs. Run 592 queued Verify for more than six hours. Run 594 was blocked before start by account billing. Outcome: useful.

## Outcome

- Signal: useful

## Source Nodes

- runner
- workflow
- actions
- desktop
- mobile
- release
- jobs