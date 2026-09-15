import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopConnectionHealth } from "./desktop-connection-health";
import { getMessagesForLocale } from "@/lib/locale";

describe("desktop connection notice", () => {
  for (const locale of ["tr", "en"] as const) {
    const messages = getMessagesForLocale(locale);
    const render = (isOnline: boolean, socketConnected: boolean) =>
      renderToStaticMarkup(
        <DesktopConnectionHealth
          isOnline={isOnline}
          socketConnected={socketConnected}
          t={(key) => messages[key] ?? key}
        />,
      );
    it(`${locale}: disappears when the connection returns`, () => {
      assert.equal(render(true, true), "");
    });
    it(`${locale}: distinguishes reconnecting from offline and announces status accessibly`, () => {
      const reconnecting = render(true, false);
      const offline = render(false, false);
      assert.ok(reconnecting.includes(messages["desktop.health.socket.title"]!));
      assert.ok(offline.includes(messages["desktop.health.offline.title"]!));
      assert.match(reconnecting, /role="status"/u);
      assert.match(reconnecting, /aria-live="polite"/u);
      assert.doesNotMatch(reconnecting, /Socket.IO|bg-white|text-slate|border-amber/u);
    });
  }
});
