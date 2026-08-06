---
type: "query"
date: "2026-08-05T17:37:39.072540+00:00"
question: "github actions işlerini self hosted runner değil de, github'ın kendisine nasıl verebilirim?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["workflow", "runner"]
---

# Q: github actions işlerini self hosted runner değil de, github'ın kendisine nasıl verebilirim?

## Answer

CI workflow Linux jobs: replace self-hosted label arrays with ubuntu-24.04, change desktop-ops ci-fast matrix entry to ubuntu-24.04, enable pnpm cache for ephemeral hosted VMs, and update hard-coded workflow contract tests. Keep mobile-release separate: its preflight requires at least 20 GiB RUNNER_TEMP while standard GitHub-hosted runners document 14 GB storage, so unchanged migration would fail; use a larger runner, redesign the build, or retain self-hosted.

## Outcome

- Signal: useful

## Source Nodes

- workflow
- runner