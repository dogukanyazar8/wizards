import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const adminComponentsRoot = dirname(fileURLToPath(import.meta.url));
const GRADIENT_FILE = join(adminComponentsRoot, "kit", "avatar-gradients.ts");

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);

    if (statSync(path).isDirectory()) {
      return collectSourceFiles(path);
    }

    return /\.tsx?$/u.test(entry) && !/\.test\.tsx?$/u.test(entry) ? [path] : [];
  });
}

describe("admin visual contract", () => {
  it("keeps colour literals out of every admin component but the identity gradients", () => {
    for (const file of collectSourceFiles(adminComponentsRoot)) {
      if (file === GRADIENT_FILE) {
        continue;
      }

      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /#[0-9a-fA-F]{3,8}\b/u,
        `${file} hardcodes a colour instead of using hsl(var(--…))`,
      );
    }
  });

  it("allows the identity gradients to stay theme-independent", () => {
    assert.match(readFileSync(GRADIENT_FILE, "utf8"), /#6366f1/u);
  });

  it("locks the shell to the handoff measurements", () => {
    const shell = readFileSync(join(adminComponentsRoot, "kit", "admin-shell.tsx"), "utf8");

    assert.match(shell, /width: 250/u, "rail must be 250px");
    assert.match(shell, /height: 62/u, "top bar must be 62px");
    assert.match(shell, /maxWidth: 1360/u, "content must cap at 1360px");
  });

  it("builds pills, cards and tables once in the kit", () => {
    const primitives = readFileSync(
      join(adminComponentsRoot, "kit", "admin-primitives.tsx"),
      "utf8",
    );

    for (const component of [
      "AdminCard",
      "AdminPill",
      "AdminKpiCard",
      "AdminMiniStat",
      "AdminGridTable",
      "AdminBarChart",
      "AdminProgress",
      "AdminToggle",
      "AdminChip",
      "AdminPulseDot",
    ]) {
      assert.match(primitives, new RegExp(`export function ${component}\\b`, "u"));
    }
  });

  it("does not let a module define its own pill or card next to the kit", () => {
    for (const file of collectSourceFiles(join(adminComponentsRoot, "sections"))) {
      const source = readFileSync(file, "utf8");

      assert.doesNotMatch(
        source,
        /function (Pill|Card|KpiCard|GridTable)\b/u,
        `${file} re-implements a kit component`,
      );
    }
  });

  it("formats numbers through the Turkish helpers rather than toLocaleString", () => {
    for (const file of collectSourceFiles(adminComponentsRoot)) {
      if (file.includes(join("format", "admin-format.ts"))) {
        continue;
      }

      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /toLocaleString\(/u,
        `${file} formats a number outside admin-format`,
      );
    }
  });
});
