---
type: "query"
date: "2026-07-29T16:37:03.750272+00:00"
question: "Wizards projesi için en iyi IDE ve geliştirme araçları nelerdir? Detaylı inceler misin, graphify kullanabilirsin."
contributor: "graphify"
outcome: "useful"
source_nodes: ["Whispr Windows geliştirme ve CI/CD onboarding rehberi", "package.json", "typescript-typecheck-runner.mjs", "mobile/package.json", "desktop/package.json", "playwright.config.ts"]
---

# Q: Wizards projesi için en iyi IDE ve geliştirme araçları nelerdir? Detaylı inceler misin, graphify kullanabilirsin.

## Answer

Expanded from original query via graph vocab: [monorepo, typescript, react, native, expo, tauri, rust, prisma, pnpm, turbo, playwright, railway] and [eslint, prettier, jest, semgrep, sentry, docker, metro, gradle, maestro, github, android, ios]. Repo and official-doc verification: VS Code is best primary editor for the mixed pnpm/Turbo TypeScript 7, Next, Expo, Tauri/Rust workspace. Android Studio remains mandatory for SDK, AVD, Logcat, profiler, and native Android inspection. Visual Studio 2022 Build Tools plus Developer PowerShell are required for Tauri Windows builds; full Visual Studio IDE is optional. WebStorm is strongest paid alternative for JS/TS and database work but its current Expo debugging support is incomplete; RustRover is optional for deep Rust. Cursor is optional only after privacy policy approval because AI requests and indexing use Cursor backends. Recommended VS Code core: TypeScriptTeam.native-preview, ESLint, Prettier, Tailwind CSS, Prisma, Playwright, Expo Tools, rust-analyzer, Tauri, GitHub Actions, YAML, PowerShell. Treat Graphify as navigation and repo scripts/CI/device evidence as proof.

## Outcome

- Signal: useful

## Source Nodes

- Whispr Windows geliştirme ve CI/CD onboarding rehberi
- package.json
- typescript-typecheck-runner.mjs
- mobile/package.json
- desktop/package.json
- playwright.config.ts