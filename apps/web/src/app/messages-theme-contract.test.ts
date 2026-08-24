import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const globalsSource = readFileSync(join(appDirectory, "globals.css"), "utf8");
const shellSource = readFileSync(
  join(appDirectory, "..", "components", "shell", "wizards-shell.tsx"),
  "utf8",
);

function readRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = globalsSource.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "u"));

  assert.ok(match?.[1], `${selector} must exist`);
  return match[1];
}

describe("Messages reference theme", () => {
  it("scopes the reference surface to the Messages shell", () => {
    assert.match(shellSource, /thirdColumn === "messages"[^\n]+"messages-reference-surface"/u);
  });

  it("keeps the exact light reference tokens", () => {
    const rule = readRule("html.theme-light .messages-reference-surface");

    assert.match(rule, /--surface-base:\s*220 23% 98%;/u);
    assert.match(rule, /--surface-panel:\s*220 29% 96%;/u);
    assert.match(rule, /--surface-card:\s*0 0% 100%;/u);
    assert.match(rule, /--surface-soft:\s*220 24% 91%;/u);
    assert.match(rule, /--text-muted:\s*220 11% 52%;/u);
    assert.match(rule, /--primary-readable:\s*hsl\(var\(--primary\)\);/u);
  });

  it("keeps the exact dark reference tokens", () => {
    const rule = readRule("html.theme-dark .messages-reference-surface");

    assert.match(rule, /--surface-base:\s*220 8% 19%;/u);
    assert.match(rule, /--surface-panel:\s*220 8% 20%;/u);
    assert.match(rule, /--surface-card:\s*220 8% 22%;/u);
    assert.match(rule, /--surface-soft:\s*220 9% 26%;/u);
    assert.match(rule, /--text-muted:\s*220 8% 68%;/u);
    assert.match(rule, /--primary-readable:\s*hsl\(var\(--primary\)\);/u);
  });
});
