import assert from "node:assert/strict";
import test from "node:test";
import { buildPnpmInvocation } from "./build-next.mjs";

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
