import assert from "node:assert/strict";
import { it } from "node:test";
import React, { type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopOAuthStartClient } from "@/app/desktop/oauth/start/desktop-oauth-start-client";
import { MobileOAuthStartClient } from "@/app/mobile/oauth/start/mobile-oauth-start-client";
import { MobileOAuthCompleteClient } from "@/app/mobile/oauth/complete/mobile-oauth-complete-client";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";

// Node uses classic JSX; Next.js supplies the automatic runtime.
Object.assign(globalThis, { React });

function render(child: ReactNode) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      {child}
    </LocaleProvider>,
  );
}
function assertAuthSurface(markup: string) {
  assert.match(markup, /class="auth-page\b/);
  assert.match(markup, /class="auth-status-card\b/);
  assert.match(markup, /class="auth-title"/);
  assert.match(markup, /class="auth-description"/);
  assert.match(markup, /--auth-title:/);
  assert.doesNotMatch(markup, /auth-canvas|app-panel|text-3xl|border-red-200/);
  assert.doesNotMatch(
    markup,
    /class="(?:auth-brand-points|auth-footer|auth-eyebrow|auth-hint|auth-btn-secondary)\b/,
  );
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
}
it("desktop Google start uses the shared login theme and pending button", () => {
  const markup = render(<DesktopOAuthStartClient callbackUrl="/home" />);
  assertAuthSurface(markup);
  assert.match(markup, /class="auth-btn-primary"[^>]*disabled=""/);
  assert.match(markup, /Google ile devam et/);
});
it("mobile Google start uses the same theme and translated copy", () => {
  const markup = render(
    <MobileOAuthStartClient callbackUrl="/home" provider="google" state={"a".repeat(64)} />,
  );
  assertAuthSurface(markup);
  assert.match(markup, /Güvenli Google girişi/);
});
it("mobile completion keeps the exact handoff link and shared action styles", () => {
  const markup = render(<MobileOAuthCompleteClient appHandoffUrl="whispr://auth?token=fixture" />);
  assertAuthSurface(markup);
  assert.match(markup, /href="whispr:\/\/auth\?token=fixture"/);
  assert.match(markup, /class="auth-btn-primary"/);
});
