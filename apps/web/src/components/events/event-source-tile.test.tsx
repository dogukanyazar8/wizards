import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EventSourceTile } from "@/components/events/event-source-tile";

const base = {
  isPublic: false,
  serverIconColor: "danger" as const,
  serverIconUrl: null,
  serverName: "Whispr Topluluğu",
  serverShortName: "WZR",
  viewerIsMember: true,
};

describe("EventSourceTile sunucu ikonu", () => {
  it("görsel yokken tanımlı üç harf ve sunucu rengini kullanır", () => {
    const markup = renderToStaticMarkup(
      <EventSourceTile event={base} fontSize={10} radius={4} size={18} />,
    );

    assert.match(markup, />WZR<\/span>/u);
    assert.match(markup, /background-color:hsl\(var\(--danger\)\)/u);
  });

  it("yüklenen görsel varsa kısaltmayı çizmez", () => {
    const markup = renderToStaticMarkup(
      <EventSourceTile
        event={{ ...base, serverIconUrl: "https://cdn.whispr.test/server.png" }}
        fontSize={10}
        radius={4}
        size={18}
      />,
    );

    assert.doesNotMatch(markup, />WZR<\/span>/u);
    assert.match(
      markup,
      /background-image:url\(&quot;https:\/\/cdn\.whispr\.test\/server\.png&quot;\)/u,
    );
  });
});
