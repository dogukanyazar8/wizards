import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const SOURCE = readFileSync(
  fileURLToPath(new URL("./message-editor.tsx", import.meta.url)),
  "utf8",
);

describe("message editor modern inline surface", () => {
  it("uses a compact editor and neutral/primary actions", () => {
    assert.match(SOURCE, /min-h-\[3\.5rem\]/u);
    assert.match(
      SOURCE,
      /className="[^"\n]*text-app-muted[^"\n]*"\s+data-testid="message-editor-cancel"/u,
    );
    assert.match(
      SOURCE,
      /className="[^"\n]*bg-\[hsl\(var\(--primary\)\)\][^"\n]*"\s+data-testid="message-editor-save"/u,
    );
    assert.doesNotMatch(
      SOURCE,
      /className="[^"\n]*var\(--success\)[^"\n]*"\s+data-testid="message-editor-save"/u,
    );
  });

  it("preserves Enter, Shift+Enter and Escape keyboard behavior", () => {
    assert.match(SOURCE, /e\.key === "Enter" && !e\.shiftKey/u);
    assert.match(SOURCE, /e\.key === "Escape"/u);
  });
});
