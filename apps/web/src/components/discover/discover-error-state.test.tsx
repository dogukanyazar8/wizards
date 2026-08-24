import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DiscoverErrorState,
  formatDiscoverFailureTime,
  resolveDiscoverErrorCode,
} from "@/components/discover/discover-error-state";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { DiscoverClientError } from "@/lib/discover/client";
import { getMessagesForLocale } from "@/lib/locale";
import { DISCOVER_DEFAULT_ROUTE_STATE } from "@/lib/discover/routes";

function render(error: unknown, isRetrying = false): string {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <DiscoverErrorState
        error={error}
        failedAt={new Date("2026-08-21T09:41:00.000Z")}
        isRetrying={isRetrying}
        onJoinServer={() => undefined}
        onRetry={() => undefined}
        route={DISCOVER_DEFAULT_ROUTE_STATE}
      />
    </LocaleProvider>,
  );
}

describe("DiscoverErrorState", () => {
  it("HTTP, ağ ve zaman aşımı hatalarını gerçek DIR koduna çevirir", () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";

    assert.equal(resolveDiscoverErrorCode(new DiscoverClientError("bad gateway", 502)), "DIR-502");
    assert.equal(resolveDiscoverErrorCode(new TypeError("Failed to fetch")), "DIR-NET");
    assert.equal(resolveDiscoverErrorCode(timeout), "DIR-TMO");
  });

  it("son başarısız denemeyi HH:mm ve istenen saat diliminde biçimler", () => {
    assert.equal(
      formatDiscoverFailureTime(new Date("2026-08-21T09:41:00.000Z"), "tr", "UTC"),
      "09:41",
    );
  });

  it("sabit DIR-502 yerine hata nesnesini ve gerçek deneme saatini çizer", () => {
    const markup = render(new DiscoverClientError("service unavailable", 503));

    assert.match(markup, /Dizin yüklenemedi/u);
    assert.match(markup, /Hata kodu: DIR-503 · son deneme/u);
    assert.match(markup, /height:4\.875rem/u);
    assert.doesNotMatch(markup, /aria-hidden="true"[^>]*Dizin yüklenemedi/u);
    assert.doesNotMatch(markup, /\sinert(?:=|\s|>)/u);
  });

  it("retry sırasında butonu pasifleştirir ve metni değiştirir", () => {
    const markup = render(new TypeError("network"), true);

    assert.match(
      markup,
      /<button[^>]*disabled=""[^>]*>[^<]*(?:<svg[\s\S]*?<\/svg>)?Yeniden deneniyor…<\/button>/u,
    );
  });

  it("Kodla katıl mevcut rotaya modal=join ekler", () => {
    const markup = render(new TypeError("network"));

    assert.match(markup, /href="\/discover\?modal=join"[^>]*>Kodla katıl<\/a>/u);
  });
});
