// Builds .design-sync/whispr.css — the stylesheet cfg.cssEntry points at.
// Tailwind v3 compile of apps/web/src/app/globals.css (the config already scans
// packages/ui too), with ds-fonts.css prepended for the next/font variables.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const web = join(repo, "apps/web");
const tmp = join(repo, ".design-sync/.cache/tailwind.css");

execFileSync(
  process.execPath,
  [
    join(web, "node_modules/tailwindcss/lib/cli.js"),
    "-c", "tailwind.config.ts",
    "-i", "src/app/globals.css",
    "-o", tmp,
    "--minify",
  ],
  { cwd: web, stdio: "inherit" },
);

const fonts = readFileSync(join(repo, ".design-sync/ds-fonts.css"), "utf8");
writeFileSync(join(repo, ".design-sync/whispr.css"), fonts + "\n" + readFileSync(tmp, "utf8"));
console.log("wrote .design-sync/whispr.css");
