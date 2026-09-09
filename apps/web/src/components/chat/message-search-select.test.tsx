import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchSelectField } from "./message-search-panel";

describe("kanal gelişmiş arama seçicisi", () => {
  it("ayarlar görünürlük seçicisinin erişilebilir açılır menü sözleşmesini kullanır", () => {
    const html = renderToStaticMarkup(
      <SearchSelectField
        label="Kimden"
        onChange={() => undefined}
        options={[
          { label: "Herkes", value: "" },
          { label: "Ada", value: "ada" },
        ]}
        testId="server-search-author"
        value="ada"
      />,
    );

    assert.match(html, /data-testid="server-search-author"/u);
    assert.match(html, /aria-haspopup="listbox"/u);
    assert.match(html, /aria-expanded="false"/u);
    assert.match(html, />Ada</u);
    assert.doesNotMatch(html, /<select/u);
  });
});
