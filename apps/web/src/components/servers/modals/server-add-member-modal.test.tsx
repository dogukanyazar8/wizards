import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ServerAddMemberForm } from "./server-add-member-modal";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

function render(overrides: Partial<React.ComponentProps<typeof ServerAddMemberForm>> = {}) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      <ServerAddMemberForm
        error={null}
        onChange={() => {}}
        onClose={() => {}}
        onSubmit={() => {}}
        pending={false}
        serverName="Arkadaşlar"
        success={null}
        username=""
        {...overrides}
      />
    </LocaleProvider>,
  );
}

describe("server add-member form", () => {
  it("names the target server and explains direct membership and notification", () => {
    const html = render();
    assert.match(html, /Arkadaşlar/);
    assert.match(html, /doğrudan sunucuya eklenir/);
    assert.match(html, /bildirim gönderilir/);
    const id = html.match(/<input[^>]+id="([^"]+)"/)?.[1];
    assert.ok(id);
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`aria-describedby="${id}-hint"`));
  });

  it("disables empty submissions and allows a valid username", () => {
    const submit = (html: string) =>
      html.match(/<button[^>]*data-testid="add-server-member-submit"[^>]*>/)?.[0] ?? "";
    assert.match(submit(render({ username: " " })), /disabled/);
    assert.doesNotMatch(submit(render({ username: "ada" })), /disabled/);
  });

  it("locks the input and submission while the existing request runs", () => {
    const html = render({ pending: true, username: "ada" });
    assert.match(html, /aria-busy="true"/);
    assert.match(html, /<input[^>]*disabled/);
    assert.match(html, /data-testid="add-server-member-submit"[^>]*disabled/);
    assert.match(html, /Ekleniyor/);
  });

  it("associates errors with the field and announces successful additions", () => {
    const error = render({ error: "Kullanıcı bulunamadı." });
    assert.match(error, /aria-invalid="true"/);
    assert.match(error, /aria-describedby="[^"]+-hint [^"]+-error"/);
    assert.match(error, /role="alert"/);
    const success = render({ success: "Ada eklendi ve bilgilendirildi." });
    assert.match(success, /role="status"/);
    assert.match(success, /Ada eklendi/);
    assert.match(success, /Kapat/);
  });
});
