import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Avatar } from "@/components/ui/avatar";

function render(props: Partial<React.ComponentProps<typeof Avatar>> = {}) {
  return renderToStaticMarkup(
    <Avatar alt="Alice" fallback="Alice Example" src={null} {...props} />,
  );
}

describe("Avatar — erişilebilir ad", () => {
  it("boş alt değerini fallback adıyla tamamlar", () => {
    const markup = render({ alt: "", fallback: "Alice Example" });

    assert.match(markup, /role="img"/u);
    assert.match(markup, /aria-label="Alice Example"/u);
    assert.doesNotMatch(markup, /aria-label=""/u);
  });

  it("ad üretilemiyorsa dekoratif kalır", () => {
    const markup = render({ alt: " ", fallback: " " });

    assert.match(markup, /aria-hidden="true"/u);
    assert.doesNotMatch(markup, /role="img"/u);
    assert.doesNotMatch(markup, /aria-label=/u);
  });

  it("görseli sarmalayıcı adlandırır; iç img ikinci semantik üretmez", () => {
    const markup = render({ src: "/alice.png" });

    assert.match(markup, /role="img"/u);
    assert.match(markup, /<img alt=""/u);
  });
});
