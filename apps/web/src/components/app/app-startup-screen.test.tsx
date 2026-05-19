import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppStartupScreen } from "@/components/app/app-startup-screen";
import { LocaleProvider } from "@/components/providers/locale-provider";

function renderStartupScreen({
  busy,
  locale = "en",
  status,
}: {
  busy?: boolean;
  locale?: "en" | "tr";
  status: "session" | "workspace" | "realtime" | "ready";
}) {
  const busyProps = typeof busy === "boolean" ? { busy } : {};

  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale}>
      <AppStartupScreen {...busyProps} status={status} variant="page" />
    </LocaleProvider>,
  );
}

describe("AppStartupScreen", () => {
  it("renders localized startup status copy without exposing user data", () => {
    const html = renderStartupScreen({ locale: "tr", status: "workspace" });

    assert.match(html, /Whispr ba[şş]latılıyor/);
    assert.match(html, /Çalışma alanı yükleniyor/);
    assert.doesNotMatch(html, /@/);
    assert.doesNotMatch(html, /dogukan/i);
  });

  it("keeps the startup logo non-interactive for authenticated loading surfaces", () => {
    const html = renderStartupScreen({ status: "session" });

    assert.match(html, /aria-label="Whispr"/);
    assert.doesNotMatch(html, /href="\/login"/);
  });

  it("can show realtime status without marking the surface as busy", () => {
    const html = renderStartupScreen({ busy: false, status: "realtime" });

    assert.match(html, /aria-busy="false"/);
    assert.match(html, /Connecting realtime/);
  });
});
