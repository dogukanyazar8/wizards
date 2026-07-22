// Probes every candidate component module: can esbuild bundle it for the browser?
// Writes .design-sync/.cache/bundleable.json — { ok: [...], fail: { spec: reason } }
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const repo = resolve(import.meta.dirname, "..");
const require_ = createRequire(join(repo, ".ds-sync/noop.js"));
const esbuild = require_("esbuild");

const entry = readFileSync(join(repo, ".design-sync/ds-entry.tsx"), "utf8");
const mods = [...entry.matchAll(/from "([^"]+)";/g)].map((m) => m[1]);

const NODE_BUILTINS = /^(node:|fs$|path$|crypto$|net$|tls$|dns$|stream$|util$|assert$|url$|string_decoder$|zlib$|http$|https$|os$|child_process$|worker_threads$|perf_hooks$|buffer$|events$|timers)/;

const ok = [];
const fail = {};

for (const spec of mods) {
  const abs = join(repo, ".design-sync", spec) + ".tsx";
  try {
    await esbuild.build({
      entryPoints: [abs],
      bundle: true,
      write: false,
      platform: "browser",
      format: "esm",
      jsx: "automatic",
      target: "es2020",
      logLevel: "silent",
      tsconfig: join(repo, ".design-sync/tsconfig.ds.json"),
      absWorkingDir: join(repo, ".design-sync"),
      external: ["react", "react-dom", "react/jsx-runtime", "react-dom/client"],
    });
    ok.push(spec);
  } catch (err) {
    const msgs = (err.errors || []).map((e) => e.text);
    const builtin = msgs.find((m) => /Could not resolve "([^"]+)"/.test(m) && NODE_BUILTINS.test(/Could not resolve "([^"]+)"/.exec(m)[1]));
    fail[spec] = (builtin || msgs[0] || String(err)).slice(0, 160);
  }
}

mkdirSync(join(repo, ".design-sync/.cache"), { recursive: true });
writeFileSync(join(repo, ".design-sync/.cache/bundleable.json"), JSON.stringify({ ok, fail }, null, 2));
console.log(`bundleable: ${ok.length}/${mods.length}`);
for (const [spec, why] of Object.entries(fail)) console.log(`  FAIL ${spec}\n        ${why}`);
