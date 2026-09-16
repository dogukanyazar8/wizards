import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import * as build from "./build-next.mjs";

const { buildPnpmInvocation } = build;

function heapLimit(environment) {
  const result = spawnSync(
    process.execPath,
    ["-p", "require('node:v8').getHeapStatistics().heap_size_limit"],
    { env: environment, encoding: "utf8", shell: false },
  );
  assert.equal(result.status, 0, result.stderr);
  return Number(result.stdout.trim());
}

test("production build gives the Next worker a bounded 4 GiB default heap", () => {
  const environment = { ...process.env, NODE_OPTIONS: "--trace-warnings" };
  const result = build.buildNextEnvironment(environment);
  assert.equal(environment.NODE_OPTIONS, "--trace-warnings");
  assert.ok(result.NODE_OPTIONS.includes("--trace-warnings"));
  assert.equal(
    heapLimit(result),
    heapLimit({ ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" }),
  );
});

test("production build preserves an explicit operator heap limit", () => {
  const environment = { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" };
  assert.equal(heapLimit(build.buildNextEnvironment(environment)), heapLimit(environment));
});

test("production build defaults only missing database configuration", () => {
  assert.equal(
    build.buildNextEnvironment({}).DATABASE_URL,
    "postgresql://prisma:prisma@127.0.0.1:5432/wizards_build",
  );
  const environment = { DATABASE_URL: "postgresql://localhost/explicit_build" };
  assert.equal(build.buildNextEnvironment(environment).DATABASE_URL, environment.DATABASE_URL);
});

test("production build launches a native pnpm executable directly", () => {
  assert.deepEqual(
    buildPnpmInvocation(
      { npm_execpath: "/mise/installs/pnpm/12.4.2/pnpm" },
      "/mise/installs/node/24.21.0/bin/node",
    ),
    {
      command: "/mise/installs/pnpm/12.4.2/pnpm",
      args: ["exec", "next", "build"],
    },
  );
});

test("production build launches JavaScript pnpm clients through Node", () => {
  assert.deepEqual(
    buildPnpmInvocation({ npm_execpath: "C:/pnpm/pnpm.cjs" }, "C:/Program Files/nodejs/node.exe"),
    {
      command: "C:/Program Files/nodejs/node.exe",
      args: ["C:/pnpm/pnpm.cjs", "exec", "next", "build"],
    },
  );
});

test("production build fails clearly when pnpm did not launch it", () => {
  assert.throws(
    () => buildPnpmInvocation({}, "/usr/local/bin/node"),
    /must be launched through pnpm/u,
  );
});
