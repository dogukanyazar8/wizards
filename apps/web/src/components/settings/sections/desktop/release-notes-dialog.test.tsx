import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { releaseListOptions } from "@/lib/releases/release-query";
import { ReleaseNotesRow, ReleaseNotesContent } from "./release-notes-dialog";
import { PermissionSettingsRow } from "../../permission-settings-row";

function render(client: QueryClient, element: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        {element}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("offers an enabled primary action without loading notes before opening", () => {
  const client = new QueryClient();
  const markup = render(client, <ReleaseNotesRow />);
  assert.match(markup, /data-testid="setting-nav-o5"/u);
  assert.match(markup, /background:hsl\(var\(--primary\)\)/u);
  assert.doesNotMatch(markup, /disabled="|release-notes-content/u);
  assert.equal(client.getQueryCache().getAll().length, 0);
  assert.match(markup, /data-setting-row="o5"/u);
  assert.match(markup, /aria-expanded="false"/u);
  assert.doesNotMatch(markup, /role="dialog"/u);
  client.clear();
});

it("renders loading and empty history explicitly", () => {
  const client = new QueryClient();
  assert.match(render(client, <ReleaseNotesContent installed="0.9.0" />), /Yükleniyor/u);
  client.setQueryData(releaseListOptions("0.9.0").queryKey, {
    pages: [{ releases: [], total: 0, nextCursor: null }],
    pageParams: [null],
  });
  const empty = render(client, <ReleaseNotesContent installed="0.9.0" />);
  assert.match(empty, /Henüz yayımlanmış sürüm notu yok/u);
  assert.match(empty, /Yenile/u);
  client.clear();
});

it("uses shared settings rows, escapes release text, and exposes pagination and details", () => {
  const client = new QueryClient();
  client.setQueryData(releaseListOptions("0.9.0").queryKey, {
    pages: [
      {
        releases: [
          {
            version: "0.9.0",
            codename: "<script>bad()</script>",
            releasedAt: "2026-09-15T00:00:00.000Z",
            changeCount: 1,
          },
        ],
        total: 2,
        nextCursor: "next",
      },
    ],
    pageParams: [null],
  });
  const markup = render(client, <ReleaseNotesContent installed="0.9.0" />);
  assert.match(markup, /data-setting-row="release-0.9.0"/u);
  assert.match(markup, /&lt;script&gt;bad\(\)&lt;\/script&gt;/u);
  assert.doesNotMatch(markup, /<script>/u);
  assert.match(markup, /Bu sürüm/u);
  assert.match(markup, /Ayrıntıları göster/u);
  assert.match(markup, /aria-expanded="false"/u);
  assert.match(markup, /Daha fazla göster/u);
  client.clear();
});

it("keeps retry visible after history and permission reads fail", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false } },
  });
  await client
    .fetchInfiniteQuery({
      ...releaseListOptions("0.9.0"),
      queryFn: async () => {
        throw new Error("unavailable");
      },
    })
    .catch(() => {});
  const markup = render(client, <ReleaseNotesContent installed="0.9.0" />);
  assert.match(markup, /role="alert"/u);
  assert.match(markup, /Tekrar dene/u);
  await client
    .fetchQuery({
      queryKey: ["settings", "permission", "notifications"],
      queryFn: async () => {
        throw new Error("unavailable");
      },
    })
    .catch(() => {});
  const permission = render(
    client,
    <PermissionSettingsRow permissionKey="notifications" rowKey="ns0" title="Bildirim izni" />,
  );
  assert.match(permission, /İşlem tamamlanamadı/u);
  assert.doesNotMatch(permission, /font-family:|font-mono/u);
  client.clear();
});
