# design-sync notes — Whispr Design System

Project: `https://claude.ai/design/p/77f68311-2c86-4e6e-903e-427eb617e7e9`

## What is synced

The design system is **not a single package**. It is `packages/ui` (Button, `cn`) plus every
component under `apps/web/src/components` — 145 components in 21 groups. Scope decision by the
user on 2026-07-21: sync everything Claude Design can render, and author previews for all of them.

Out of scope, deliberately:

- **`apps/mobile`** — React Native / Expo. Claude Design renders React DOM; RN primitives
  (`View`, `Text`, `StyleSheet`) do not exist there, and designs the agent produced from RN
  previews would be DOM code that cannot ship to the RN app. Would need `react-native-web`.
- **`apps/desktop`** — Tauri shell with zero `.tsx` of its own; it renders the web app, so web
  coverage already covers it.

## How the build is wired (non-obvious — read before re-syncing)

There is no publishable DS package with a `dist/`, so the converter is pointed at a **synthesized
barrel entry** and `.design-sync/` itself acts as the package directory:

- `.design-sync/package.json` exists **only** to make `.design-sync/` the converter's `PKG_DIR`
  (it walks up from `--entry` to the first `package.json` with a `name`). Its `types` field points
  at the emitted `.d.ts` tree. Do not delete it — without it `PKG_DIR` becomes the repo root and
  every path in `config.json` breaks.
- All `config.json` paths (`srcDir`, `cssEntry`, `tsconfig`, `componentSrcMap`) are therefore
  **`.design-sync/`-relative**, not repo-root-relative.
- `ds-entry.tsx`, `config.json`'s `componentSrcMap`, and `dtsPropsFor` are all **generated** —
  never hand-edit them, re-run the generators (below).

### Regeneration order (all four steps, in order)

```sh
node .design-sync/gen-entry.mjs      # barrel of every component export -> ds-entry.tsx
node .design-sync/gen-srcmap.mjs     # componentSrcMap (converter finds no .d.ts exports on its own)
node .design-sync/build-css.mjs      # Tailwind compile + next/font vars -> whispr.css
node apps/web/node_modules/typescript/lib/tsc.js -p .design-sync/tsconfig.emit.json   # .d.ts tree
node .design-sync/gen-props.mjs      # dtsPropsFor for inline-typed components
```

`tsc` exits non-zero on a pre-existing `uploadthing.ts` portability error — **it still emits**, so
that exit code is expected, not a failure.

Then the converter (note the **absolute Windows** `--node-modules` path — a git-bash `/c/...` path
silently fails `existsSync` and disables `@types/react` resolution):

```sh
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules "C:/Users/doguk/Desktop/Wizards/apps/web/node_modules" \
  --entry ./.design-sync/ds-entry.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

### Why each piece exists

- **`tsconfig.ds.json`** — the converter's esbuild `paths`. It maps `@/*` at `.design-sync`
  depth, pins three directory-shaped imports (`@/lib/appearance`, `@/lib/locale`,
  `@/lib/socket/handlers`) that would otherwise resolve to a directory and fail with
  `Cannot read file … : Yanlış işlev`, and swaps two categories of module for stubs:
  - **`stubs/*-actions.ts`** — the four `"use server"` action modules. Server actions pull
    `node:fs`/`node:crypto` through `@/auth`; without the stubs 7 components fail to bundle.
    If a new server action module appears, add a stub + a `paths` entry.
  - **`stubs/krisp-noise-filter.ts`** — `@livekit/krisp-noise-filter` is ~6 MB of WASM-as-JS
    behind a lazy `import()`. Unstubbed the bundle is 12.0 MB and **exceeds the 12 MB upload
    limit**. Keep it stubbed.
- **`process-shim.ts`** — imported first from `ds-entry.tsx`. App modules read `process.env` at
  import time (Next inlines it at build; the DS bundle has no such step). Without it every single
  preview dies with `ReferenceError: process is not defined`.
- **`ds-fonts.css`** — the seven `next/font/google` families from `apps/web/src/app/layout.tsx`.
  next/font injects `--font-sans` and friends at runtime, so the DS has to declare them or every
  preview falls back to the browser default face. Loaded via a remote `@import`
  (`[FONT_REMOTE]` in validate is expected).
- **`gen-props.mjs`** — the app declares most props as inline anonymous object types
  (`function Card({ a }: { a: string })`). The converter only extracts named `<Name>Props`
  interfaces, so 144/145 components shipped an empty `[key: string]: unknown` contract until this
  script resolved them through the checker. It skips props declared in `@types/react` (the DOM
  attribute bag — hundreds of entries, and unquoted `aria-*` keys are a `[DTS_PARSE]` syntax
  error) and summarises them as one index signature instead.

### Provider chain

`cfg.provider` is `ThemeProvider > QueryProvider > LocaleProvider > SocketProvider`.
`LocaleProvider` gets `initialMessages` via `{"$ref": "EN_MESSAGES"}`, which is why
`gen-entry.mjs` appends a non-component export for it. `SocketProvider` is required by everything
that calls `useSocket` (most of chat/dm/shell/voice) — it fails to connect in headless chromium,
which is harmless. Components needing voice/DM-call context still have to compose their own
provider inside their preview.

## Environment quirks (Windows / pnpm)

- `node_modules/@types/{react,react-dom}` at the repo root are **junctions** created by this sync
  so the converter's ts-morph project can find React types (pnpm does not hoist them). Recreate
  them on a fresh clone if `[DTS_REACT]` fires.
- `.design-sync/.cache/types/.design-sync/ds-entry.d.ts` lives under a dot-directory, and
  fast-glob skips those — `gen-props.mjs` adds that one file explicitly.
- Playwright must be **1.59.1** to match the cached `chromium-1217` build; it is installed into
  `.ds-sync/`, not the repo.
- `npx tailwindcss` fails under git-bash; `build-css.mjs` invokes `tailwindcss/lib/cli.js` with
  `process.execPath` instead.

## Known render warns

- `[TOKENS_MISSING]` for `--surface`, `--muted`, `--muted-foreground`, `--accent`,
  `--surface-highlight`, `--surface-muted`, `--tw`. **These are a real app-side gap, not a sync
  artifact**: they are used in Tailwind arbitrary values (e.g. `bg-[hsl(var(--muted)/0.72)]`) but
  defined nowhere in `apps/web/src/app/globals.css`, so they are invalid in production too.
  Nothing was invented for the DS — previews show what production shows.
- `[FONT_REMOTE]` — expected, see `ds-fonts.css` above.

## Deliberate floor cards

Provider and side-effect-only components render nothing visual by design and keep the typographic
floor card: everything in the `providers` group, plus `ThemeSessionSync`, `LocaleSessionSync`,
`AppStartupSessionMarker`, `DesktopContextMenuGuard`, `VoiceAudioRenderer`.

## Re-sync risks

- **The barrel is regenerated from a source scan.** A new component export appears automatically;
  a renamed one silently drops its authored preview (`stale preview:` line in the build log —
  read those).
- **Stub drift.** `stubs/*-actions.ts` mirror the real action modules' export names by hand. A new
  export there fails the bundle with an unresolved import, not a silent wrong render.
- **`whispr.css` is a build artifact of `apps/web/tailwind.config.ts`.** Its `content` globs do
  **not** include `.design-sync/previews/`, so a utility class used only in a preview and nowhere
  in the app will not be emitted. Prefer classes the app already uses.
- **Krisp stub is a size guard.** If the upload limit or the package size changes, re-check
  before unstubbing — the margin today is 6.2 MB against a 12 MB cap.
- The `.d.ts` tree is emitted with `strict: false` and `skipLibCheck` — prop types are structural
  and a few unresolvable ones degrade to `unknown`.

## Run log — 2026-07-21 (first sync)

Scope was cut mid-run at the user's request ("finish fastest"): the plan had been to author
previews for all 145 components; only **Button, Badge and MessageItem** were authored and graded
`good`. The other 142 shipped as they build — 51 render themselves from `.d.ts` crash-prevention
props, 91 show the typographic floor card. All 145 are fully importable and typed either way.

Two components render but produce a near-blank card and are the obvious next authoring targets:
`TypingIndicator` and `ContextMenuItem` (a leaf that only makes sense inside `ContextMenu`).

Authoring more later is cheap: write `.design-sync/previews/<Name>.tsx` (named exports, each a
zero-arg component, importing from `"@wizards/ui"`), then
`preview-rebuild.mjs --components <names>` + `package-capture.mjs --components <names>` and grade.
Authored files and grades carry forward.
