import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";

const reactCompilerDiagnosticRules = [
  "react-hooks/error-boundaries",
  "react-hooks/incompatible-library",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/purity",
  "react-hooks/refs",
  "react-hooks/set-state-in-effect",
  "react-hooks/use-memo",
];

test("React Compiler diagnostics are loaded as errors by the flat config", async () => {
  const source = readFileSync(
    fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );

  for (const rule of reactCompilerDiagnosticRules) {
    assert.doesNotMatch(source, new RegExp(`"${rule}": "off"`));
    assert.doesNotMatch(source, new RegExp(`"${rule}": 0`));
  }

  assert.match(packageJson.devDependencies.eslint, /^\^?10\.8\.0$/u);
  assert.equal(packageJson.devDependencies["@eslint/js"], undefined);
  assert.equal(packageJson.devDependencies["@next/eslint-plugin-next"], "16.3.0");
  assert.match(packageJson.devDependencies["eslint-plugin-react-hooks"], /^\^?7\.1\.1$/u);
  assert.equal(packageJson.devDependencies["typescript-eslint"], "8.66.0");
  assert.equal(packageJson.devDependencies["babel-plugin-react-compiler"], "1.0.0");

  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
  const config = await eslint.calculateConfigForFile("src/components/chat/message-list.tsx");

  for (const rule of reactCompilerDiagnosticRules) {
    assert.equal(config.rules[rule]?.[0], 2, `${rule} must be enabled as an error`);
  }
  assert.equal(config.rules["no-undef"]?.[0], 0);
});

test("badge surfaces avoid synchronous state resets inside effects", async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
  const results = await eslint.lintFiles([
    "src/components/admin/sections/admin-user-badges.tsx",
    "src/components/shared/profile-badge-detail.tsx",
    "src/components/shared/user-profile-popover.tsx",
  ]);
  const violations = results.flatMap((result) =>
    result.messages
      .filter((message) => message.ruleId === "react-hooks/set-state-in-effect")
      .map((message) => `${result.filePath}:${message.line}:${message.column}`),
  );

  assert.deepEqual(violations, []);
});

test("unused-value conventions are explicit for intentional omissions", async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });
  const config = await eslint.calculateConfigForFile("src/components/chat/message-list.tsx");

  assert.deepEqual(config.rules["@typescript-eslint/no-unused-vars"], [
    2,
    {
      args: "after-used",
      argsIgnorePattern: "^_",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
      ignoreRestSiblings: true,
      varsIgnorePattern: "^_",
    },
  ]);
});

test("Next 16 uses direct ESLint 10 flat config dependencies", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)),
    "utf8",
  );

  assert.match(source, /from "@next\/eslint-plugin-next"/u);
  assert.match(source, /from "eslint-plugin-react-hooks"/u);
  assert.match(source, /from "typescript-eslint"/u);
  assert.doesNotMatch(source, /from "@eslint\/js"/u);
  assert.doesNotMatch(source, /eslint-config-next/u);
  assert.doesNotMatch(source, /FlatCompat/u);
});

test("Next enables its native React Compiler integration", () => {
  const source = readFileSync(fileURLToPath(new URL("../next.config.ts", import.meta.url)), "utf8");

  assert.match(source, /reactCompiler:\s*true/u);
  assert.doesNotMatch(source, /babel-plugin-react-compiler/u);
});

test("admin authorization may only enter through capabilities outside lib/admin", async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("..", import.meta.url)),
  });

  const routeConfig = await eslint.calculateConfigForFile("src/app/api/v1/admin/users/route.ts");
  const [severity, options] = routeConfig.rules["no-restricted-imports"];

  assert.equal(severity, 2);
  assert.deepEqual(options.paths, [
    {
      importNames: ["requireAdminUser"],
      message: "Use requireAdminCapability from @/lib/admin/capabilities instead.",
      name: "@/lib/admin/access",
    },
  ]);

  const accessConfig = await eslint.calculateConfigForFile("src/lib/admin/capabilities.ts");

  assert.equal(accessConfig.rules["no-restricted-imports"]?.[0] ?? 0, 0);
});

test("screen-share stage state survives share membership changes", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../src/components/voice/voice-channel-view.tsx", import.meta.url)),
    "utf8",
  );

  assert.doesNotMatch(source, /screenShareSessionKey/u);
  assert.doesNotMatch(source, /key=\{screenShareSessionKey\}/u);
});
