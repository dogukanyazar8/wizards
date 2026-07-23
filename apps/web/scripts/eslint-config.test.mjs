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

test("React Compiler diagnostics remain non-blocking while core Hook rules stay enforced", () => {
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
      new RegExp(`"${rule}": "warn"`),
      `${rule} must not block a production build`,
    );
  }
  assert.doesNotMatch(source, /"react-hooks\/rules-of-hooks": "off"/u);
  assert.doesNotMatch(source, /"react-hooks\/exhaustive-deps": "off"/u);
  assert.equal(packageJson.devDependencies["eslint-plugin-react-hooks"], "^7.1.1");
});
