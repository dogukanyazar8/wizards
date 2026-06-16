import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppStartupScreen,
  type AppStartupScreenExperience,
  type AppStartupScreenVariant,
} from "@/components/app/app-startup-screen";
import { LocaleProvider } from "@/components/providers/locale-provider";

function renderStartupScreen({
  busy,
  experience,
  locale = "en",
  status,
  variant = "page",
}: {
  busy?: boolean;
  experience?: AppStartupScreenExperience;
  locale?: "en" | "tr";
  status: "session" | "workspace" | "realtime" | "ready";
  variant?: AppStartupScreenVariant;
}) {
  const busyProps = typeof busy === "boolean" ? { busy } : {};
  const experienceProps = experience ? { experience } : {};

  return renderToStaticMarkup(
    <LocaleProvider initialLocale={locale}>
      <AppStartupScreen {...busyProps} {...experienceProps} status={status} variant={variant} />
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

  it("renders desktop launch copy without exposing account context", () => {
    const html = renderStartupScreen({
      experience: "desktop",
      locale: "tr",
      status: "session",
    });

    assert.match(html, /Whispr başlatılıyor/);
    assert.match(html, /masaüstü çalışma alanın/);
    assert.doesNotMatch(html, /@/);
    assert.doesNotMatch(html, /dogukan/i);
  });

  it("uses the compact desktop startup window frame for every splash surface", () => {
    const webHtml = renderStartupScreen({ status: "workspace" });
    const overlayHtml = renderStartupScreen({
      status: "workspace",
      variant: "overlay",
    });
    const desktopHtml = renderStartupScreen({
      experience: "desktop",
      status: "workspace",
    });
    const desktopOverlayHtml = renderStartupScreen({
      experience: "desktop",
      status: "workspace",
      variant: "overlay",
    });

    for (const html of [webHtml, overlayHtml, desktopHtml, desktopOverlayHtml]) {
      assert.match(html, /max-w-\[432px\]/);
      assert.match(html, /gap-4/);
      assert.match(html, /rounded-none/);
      assert.match(html, /border border-\[hsl\(var\(--foreground\)\/0\.14\)\]/);
      assert.match(html, /bg-\[hsl\(var\(--card\)\/0\.97\)\]/);
      assert.match(html, /ring-1 ring-\[hsl\(var\(--background\)\/0\.92\)\]/);
      assert.match(html, /radial-gradient\(circle_at_50%_24%/);
      assert.match(html, /border border-\[hsl\(var\(--primary\)\/0\.2\)\]/);
      assert.match(html, /shadow-\[0_18px_48px_hsl\(var\(--primary\)\/0\.18\)\]/);
      assert.doesNotMatch(html, /max-w-\[360px\]/);
      assert.doesNotMatch(html, /rounded-\[2rem\]/);
      assert.doesNotMatch(
        html,
        /rounded-\[18px\] border border-\[hsl\(var\(--border\)\/0\.78\)\] bg-\[hsl\(var\(--card\)\/0\.94\)\]/,
      );
      assert.doesNotMatch(html, /shadow-\[0_24px_80px/);
      assert.doesNotMatch(html, /backdrop-blur-xl/);
      assert.doesNotMatch(html, /bg-\[hsl\(var\(--card\)\/0\.86\)\]/);
    }

    for (const html of [webHtml, overlayHtml]) {
      assert.match(html, /min-h-\[292px\]/);
      assert.doesNotMatch(html, /h-\[292px\] min-h-0/);
    }

    for (const html of [desktopHtml, desktopOverlayHtml]) {
      assert.match(html, /h-\[292px\] min-h-0/);
      assert.doesNotMatch(html, /flex min-h-\[292px\] w-full max-w-\[432px\]/);
    }

    assert.match(webHtml, /rounded-none/);
    assert.match(desktopHtml, /rounded-none/);
    assert.match(desktopOverlayHtml, /desktop workspace/);
  });
});
