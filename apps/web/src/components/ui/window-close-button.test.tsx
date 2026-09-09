import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WindowCloseButton } from "@/components/ui/window-close-button";

describe("WindowCloseButton", () => {
  it("Ayarlar kapatma kontrolünün ortak görsel sözleşmesini taşır", () => {
    const markup = renderToStaticMarkup(
      <WindowCloseButton aria-label="Kapat" onClick={() => {}} testId="close" />,
    );

    assert.match(markup, /aria-label="Kapat"/u);
    assert.match(markup, /data-testid="close"/u);
    assert.match(markup, /border-color:hsl\(var\(--border\)\//u);
    assert.match(markup, /hover:bg-\[hsl\(var\(--surface-soft\)\/0\.7\)\]/u);
  });
});
