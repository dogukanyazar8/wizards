## Building with the Whispr design system

This library is the Whispr web app's own component tree (`packages/ui` + `apps/web/src/components`),
compiled as-is. Components are real app components, not simplified primitives.

### Wrapping — required

Almost every component reads app context. Wrap anything you build in this chain, outermost first:

```jsx
<ThemeProvider>
  <QueryProvider>
    <LocaleProvider initialLocale="en">
      <SocketProvider>
        {/* your screen */}
      </SocketProvider>
    </LocaleProvider>
  </QueryProvider>
</ThemeProvider>
```

Without it: `ThemeProvider` missing → no theme class on `<html>`, so every `hsl(var(--…))` color
falls back; `QueryProvider` missing → any component that fetches throws; `LocaleProvider` missing →
`useI18n must be used within LocaleProvider`; `SocketProvider` missing → `useSocket must be used
within SocketProvider`, which is most of `chat/`, `dm/`, `shell/` and `voice/`.
Voice and DM-call components additionally need `VoiceProvider` / `DMCallProvider` inside the chain.

### Styling idiom — Tailwind v3 utilities over HSL token triples

Tokens are stored as **bare HSL triples**, so they are always used inside `hsl(var(--token))`, never
as a plain `var()` color. Two ways to reach them:

1. **Mapped Tailwind colors** (preferred, these exist as real utilities):
   `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`, `bg-primary`,
   `text-primary-foreground`, `border-border`, `bg-input`, `ring-ring`.
2. **Arbitrary values** for every other token and for opacity:
   `bg-[hsl(var(--surface-primary))]`, `border-[hsl(var(--border)/0.7)]`,
   `text-[hsl(var(--muted-foreground))]`, `shadow-[0_12px_34px_hsl(var(--primary)/0.18)]`.

Token families defined in `_ds/styles.css`: `--background`, `--foreground`, `--card`,
`--card-foreground`, `--primary`, `--primary-foreground`, `--border`, `--input`, `--ring`,
`--surface-primary`, `--surface-secondary`, `--surface-tertiary`, `--surface-soft`,
`--danger`/`--danger-foreground`/`--danger-soft`, `--success`/`--success-foreground`/`--success-soft`,
`--warning`/`--warning-foreground`/`--warning-soft`, `--backdrop`, `--shadow-color`.

Themes are **classes on `<html>`**: `theme-light`, `theme-dawn` and the dark set. `ThemeProvider`
sets them; do not hand-write theme colors.

Typography: `--font-sans` (Plus Jakarta Sans) is the body face, `--font-display` (Space Grotesk) for
headings, `--font-auth-body` (DM Sans) on auth screens. Use them as
`font-[family-name:var(--font-display)]` or rely on the inherited body font.

House shapes: `rounded-2xl` on cards and controls, `rounded-full` on pills and avatars,
`gap-3`/`gap-4` between related items, `p-4` inside cards.

### Where the truth is

Read `_ds/styles.css` for the full token and utility set before inventing a class, and the
per-component `<Name>.prompt.md` + `<Name>.d.ts` for its API. Prop contracts come from the app's own
types; a `[prop: string]: unknown` line means the component also forwards standard DOM attributes.

### Idiomatic example

```jsx
<div className="flex max-w-md items-center gap-3 rounded-2xl border border-[hsl(var(--border)/0.7)] bg-card p-4">
  <Avatar alt="Ada Lovelace" fallback="AL" />
  <div className="min-w-0 flex-1">
    <p className="truncate text-sm font-semibold text-foreground">Ada Lovelace</p>
    <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Ship notes are up</p>
  </div>
  <Badge>New</Badge>
  <Button size="sm">Open</Button>
</div>
```
