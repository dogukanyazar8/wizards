import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountDataControls } from "./account-data-controls";

const t = (key: string) => key;

describe("AccountDataControls", () => {
  it("renders separate export and destructive cards with inaccessible destructive submit", () => {
    const html = renderToStaticMarkup(<AccountDataControls t={t} />);

    assert.match(html, /data-testid="account-data-export-card"/);
    assert.match(html, /data-testid="account-delete-card"/);
    assert.match(html, /settings\.account\.data\.export\.action/);
    assert.match(html, /settings\.account\.data\.delete\.open/);
  });
});
