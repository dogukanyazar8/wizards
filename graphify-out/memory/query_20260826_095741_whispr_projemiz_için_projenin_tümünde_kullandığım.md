---
type: "query"
date: "2026-08-26T09:57:41.943234+00:00"
question: "Whispr projemiz için projenin tümünde kullandığım test araçları nelerdir? Testsprite kullanabilir miyiz? Kullanırsak nasıl bir faydası veya zararı olur?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["Testing", "playwright.config.ts", "Maestro flows", "cargo-security-baseline.test.mjs", "coverage.ts", "actionlint"]
---

# Q: Whispr projemiz için projenin tümünde kullandığım test araçları nelerdir? Testsprite kullanabilir miyiz? Kullanırsak nasıl bir faydası veya zararı olur?

## Answer

Expanded from original query via vocab: [test, testing, playwright, maestro, cargo, rust, actionlint, eslint, prettier, typescript, security, coverage]. Current source corroboration: Node test plus tsx is primary contract runner; Jest plus React Native Testing Library covers mobile components; Playwright plus axe covers web UI API realtime visual accessibility and cross-browser; Maestro plus ADB covers Android device flows; Cargo test covers Tauri Rust. c8 measures web coverage. ESLint, TypeScript, Prettier, actionlint, Semgrep, Gitleaks, pnpm audit, cargo audit, clippy, and fmt are quality-security gates, not substitutes for behavior tests. TestSprite is absent. It can complement web and HTTP API black-box exploratory testing, but should not replace these layers. Pilot only on isolated preview data after vendor data-flow review; official TestSprite materials are ambiguous about code analysis versus source access.

## Outcome

- Signal: useful

## Source Nodes

- Testing
- playwright.config.ts
- Maestro flows
- cargo-security-baseline.test.mjs
- coverage.ts
- actionlint