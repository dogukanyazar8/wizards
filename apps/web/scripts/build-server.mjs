import { build } from "esbuild";
import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(webRoot, "../..");
const srcRoot = resolve(webRoot, "src");

function resolveTypeScriptModule(pathWithoutExtension) {
  const candidates = [
    pathWithoutExtension,
    `${pathWithoutExtension}.ts`,
    `${pathWithoutExtension}.tsx`,
    resolve(pathWithoutExtension, "index.ts"),
    resolve(pathWithoutExtension, "index.tsx"),
  ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }

    if (statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return pathWithoutExtension;
}

const localAliasPlugin = {
  name: "whispr-local-aliases",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^@\// }, (args) => ({
      path: resolveTypeScriptModule(resolve(srcRoot, args.path.slice(2))),
    }));

    buildContext.onResolve({ filter: /^@wizards\/db$/ }, () => ({
      path: resolve(workspaceRoot, "packages/db/src/index.ts"),
    }));

    buildContext.onResolve({ filter: /^@wizards\/types$/ }, () => ({
      path: resolve(workspaceRoot, "packages/types/src/index.ts"),
    }));
  },
};

const nextEsmPlugin = {
  name: "next-node-esm-specifiers",
  setup(buildContext) {
    buildContext.onResolve({ filter: /^next\/(headers|navigation|server)$/ }, (args) => ({
      path: `${args.path}.js`,
      external: true,
    }));
  },
};

await build({
  bundle: true,
  entryPoints: {
    instrument: resolve(webRoot, "instrument.ts"),
    "outbox-worker": resolve(webRoot, "scripts/run-outbox-worker.ts"),
    server: resolve(webRoot, "server.ts"),
  },
  format: "esm",
  logLevel: "info",
  outdir: resolve(webRoot, "dist"),
  packages: "external",
  platform: "node",
  plugins: [localAliasPlugin, nextEsmPlugin],
  sourcemap: true,
  target: "node22",
});
