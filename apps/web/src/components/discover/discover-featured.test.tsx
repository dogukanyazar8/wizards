import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiscoverServer } from "@wizards/types";

import {
  DiscoverFeatured,
  shouldShowDiscoverFeatured,
} from "@/components/discover/discover-featured";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";
import { DISCOVER_DEFAULT_ROUTE_STATE, type DiscoverRouteState } from "@/lib/discover/routes";

const SERVER: DiscoverServer = {
  category: "destek",
  description: "Sürüm notları, tasarım kritiği ve destek kanalları burada.",
  featured: true,
  iconUrl: null,
  id: "server-1",
  initials: "WD",
  joined: true,
  languages: [],
  memberCount: 12_400,
  name: "Whispr Destek",
  onlineCount: 1_240,
  tags: ["Destek"],
};

function route(overrides: Partial<DiscoverRouteState> = {}): DiscoverRouteState {
  return { ...DISCOVER_DEFAULT_ROUTE_STATE, ...overrides };
}

function renderFeatured(server: DiscoverServer = SERVER): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      <DiscoverFeatured
        onJoin={() => undefined}
        previewHref="/discover?panel=server-1"
        server={server}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverFeatured", () => {
  it("beş görünürlük koşulunun her birinde ayrı ayrı gizlenir", () => {
    assert.equal(shouldShowDiscoverFeatured(route(), SERVER), true);
    assert.equal(shouldShowDiscoverFeatured(route({ lane: "people" }), SERVER), false);
    assert.equal(shouldShowDiscoverFeatured(route({ category: "oyun" }), SERVER), false);
    assert.equal(shouldShowDiscoverFeatured(route({ q: "whispr" }), SERVER), false);
    assert.equal(shouldShowDiscoverFeatured(route({ panelServerId: "server-1" }), SERVER), false);
    assert.equal(shouldShowDiscoverFeatured(route(), null), false);
  });

  it("languages boşken üçüncü meta pili çizmez", () => {
    const markup = renderFeatured();
    assert.equal(markup.match(/data-testid="discover-featured-meta"/g)?.length, 2);
  });

  it("joined sunucuda CTA Zaten üyesin ve pasiftir", () => {
    const markup = renderFeatured();

    assert.match(markup, /disabled=""[^>]*>Zaten üyesin</);
    assert.match(markup, /href="\/discover\?panel=server-1"[^>]*>Önizle</);
  });

  it("önizleme bağlantısı panel sonrası odak dönüşü için kalıcı kimlik taşır", () => {
    assert.match(renderFeatured(), /id="discover-featured-preview-server-1"/);
  });
});
