// Generates .design-sync/ds-entry.tsx — a barrel re-exporting every PascalCase
// component export from packages/ui + apps/web/src/components.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const roots = [
  { dir: join(repo, "packages/ui/src/components"), prefix: "packages/ui/src/components" },
  { dir: join(repo, "apps/web/src/components"), prefix: "apps/web/src/components" },
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith(".tsx") && !e.includes(".test.")) out.push(p);
  }
  return out;
}

const EXPORT_RE = /export\s+(?:const|function|class)\s+([A-Z][A-Za-z0-9_]*)/g;
const seen = new Map(); // name -> module specifier
const lines = [];
const skipped = [];

for (const { dir } of roots) {
  let files;
  try {
    files = walk(dir);
  } catch {
    continue;
  }
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const names = [...src.matchAll(EXPORT_RE)].map((m) => m[1]);
    if (names.length === 0) continue;
    const spec = "./" + relative(join(repo, ".design-sync"), file).split("\\").join("/").replace(/\.tsx$/, "");
    const fresh = [];
    for (const n of names) {
      if (seen.has(n)) {
        skipped.push(`${n} (dup: ${file})`);
        continue;
      }
      seen.set(n, spec);
      fresh.push(n);
    }
    if (fresh.length) lines.push(`export { ${fresh.join(", ")} } from "${spec}";`);
  }
}

// Non-component exports the preview provider chain needs (cfg.provider $refs).
const EXTRA = [
  'export { EN_MESSAGES } from "./../apps/web/src/lib/locale/messages/en";',
];

writeFileSync(
  join(repo, ".design-sync/ds-entry.tsx"),
  ['import "./process-shim";', ...lines, ...EXTRA].join("\n") + "\n",
);
console.log(`exports: ${seen.size}`);
console.log(`modules: ${lines.length}`);
if (skipped.length) console.log(`dup-skipped: ${skipped.length}`);
