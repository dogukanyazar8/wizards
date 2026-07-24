import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const reactCompilerDiagnosticRules = [
  "react-hooks/error-boundaries",
  "react-hooks/incompatible-library",
  "react-hooks/preserve-manual-memoization",
  "react-hooks/purity",
  "react-hooks/refs",
  "react-hooks/set-state-in-effect",
  "react-hooks/use-memo",
];

test("React Compiler diagnostics stay disabled until a compiler rollout begins", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)),
    "utf8",
  );
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  );

  for (const rule of reactCompilerDiagnosticRules) {
    assert.match(
      source,
      new RegExp(`"${rule}": "off"`),
      `${rule} must stay disabled until the compiler is enabled`,
    );
  }
  assert.doesNotMatch(source, /"react-hooks\/rules-of-hooks": "off"/u);
  assert.doesNotMatch(source, /"react-hooks\/exhaustive-deps": "off"/u);
  assert.equal(packageJson.devDependencies["eslint-plugin-react-hooks"], "^7.1.1");
});

test("Next 16 uses native flat ESLint configs", () => {
  const source = readFileSync(
    fileURLToPath(new URL("../eslint.config.mjs", import.meta.url)),
    "utf8",
  );

  assert.match(source, /from "eslint-config-next\/core-web-vitals"/u);
  assert.match(source, /from "eslint-config-next\/typescript"/u);
  assert.doesNotMatch(source, /FlatCompat/u);
});
