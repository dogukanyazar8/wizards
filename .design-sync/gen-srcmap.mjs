// Rewrites componentSrcMap in .design-sync/config.json from ds-entry.tsx.
// Paths are repo-root-relative (PKG_DIR is the repo root for this synth-entry setup).
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const entry = readFileSync(join(repo, ".design-sync/ds-entry.tsx"), "utf8");

const map = {};
for (const line of entry.split("\n")) {
  const m = /^export \{ (.+) \} from "(.+)";$/.exec(line);
  if (!m) continue;
  // PKG_DIR is .design-sync/, so keep the paths .design-sync-relative.
  const spec = m[2].replace(/^\.\//, "") + ".tsx";
  for (const name of m[1].split(", ")) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) continue; // SCREAMING_CASE consts aren't components
    map[name] = spec;
  }
}

const cfgPath = join(repo, ".design-sync/config.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const excluded = Object.entries(cfg.componentSrcMap ?? {}).filter(([, v]) => v === null);
cfg.componentSrcMap = Object.fromEntries([...Object.entries(map).sort(), ...excluded]);
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n");
console.log(`componentSrcMap: ${Object.keys(map).length} pinned, ${excluded.length} excluded`);
