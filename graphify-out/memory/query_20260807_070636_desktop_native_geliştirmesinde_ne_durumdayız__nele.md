---
type: "query"
date: "2026-08-07T07:06:36.317964+00:00"
question: "desktop native geliştirmesinde ne durumdayız, neler yaptık neler kaldı?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Desktop macOS Transparent Window Build Design", "Desktop macOS Transparent Window Build Implementation Plan", "desktop-release-workflow.mjs", "run-windows-measurement.mjs", "Trust boundaries", "updater.ts"]
---

# Q: desktop native geliştirmesinde ne durumdayız, neler yaptık neler kaldı?

## Answer

Expanded via graph vocabulary: [desktop, native, tauri, phase, trust, capability, measurement, performance, windows, macos, linux, updater, release, workflow, build, security, runtime, smoke]. Live result: P00 PASS; P01 source/CI foundation mostly complete but candidate performance and manual native smoke remain ENV_BLOCKED/NOT_RUN; P02 only first trust-boundary slice complete, custom main permissions reduced 21 to 17. Hosted unsigned Windows and macOS builds PASS at 8b1daabf in run 31021827583; current desktop source is unchanged since that SHA. macOS transparent windows fixed with macos-private-api in Cargo, static config, generated config, and regression tests. Current UAT desktop test gate is FAIL 96/97 because cargo-audit-ci-contract.test.mjs rejects the intentional self-hosted pull-request guard added to desktop-ops; update the contract, never remove the security guard. Latest UAT CI 31103014627 is ENV BLOCKED by self-hosted runner communication loss during Build. Next: fix the desktop CI contract drift, rerun current-SHA CI, refresh living evidence, rebuild current Windows candidate and complete measurement/manual smoke, then continue P02 trusted-local updater, diagnostics, shortcuts, permissions/recovery. P03-P09 remain.

## Outcome

- Signal: useful

## Source Nodes

- Desktop macOS Transparent Window Build Design
- Desktop macOS Transparent Window Build Implementation Plan
- desktop-release-workflow.mjs
- run-windows-measurement.mjs
- Trust boundaries
- updater.ts