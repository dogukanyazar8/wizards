import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OAuthTwoFactorClient } from "./oauth-two-factor-client";
import { AuthSurfaceProvider } from "@/components/auth/auth-surface";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { TR_MESSAGES } from "@/lib/locale/messages/tr";

// The node test runner uses classic JSX; Next.js supplies the automatic runtime.
Object.assign(globalThis, { React });

function renderScreen(surface: "web" | "desktop", ready: boolean) {
  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={TR_MESSAGES}>
      <AuthSurfaceProvider surface={surface}>
        <OAuthTwoFactorClient
          callbackUrl="/channels/@me"
          challengeToken={ready ? "test-challenge" : null}
          provider={ready ? "google" : null}
        />
      </AuthSurfaceProvider>
    </LocaleProvider>,
  );
}

describe("OAuth two-factor screen", () => {
  for (const surface of ["web", "desktop"] as const) {
    it(`${surface}: keeps verification and recovery codes in the shared auth screen`, () => {
      const markup = renderScreen(surface, true);
      assert.match(markup, /class="auth-window"/);
      assert.match(markup, /class="auth-form"/);
      assert.match(markup, /class="auth-input"/);
      assert.match(markup, /autoComplete="one-time-code"/);
      assert.match(markup, /maxLength="64"/);
      assert.match(markup, /Bu cihazı 30 gün hatırla/);
      assert.doesNotMatch(markup, /type="checkbox"[^>]*checked/);
      assert.doesNotMatch(markup, /inputMode="numeric"/);
      assert.match(markup, /class="auth-btn-primary"[^>]*type="submit"/);
    });

    it(`${surface}: expired challenges retain the shell and offer login without a code form`, () => {
      const markup = renderScreen(surface, false);
      assert.match(markup, /class="auth-window"/);
      assert.match(markup, /role="alert"/);
      assert.match(markup, /class="auth-btn-primary" href="\/login"/);
      assert.doesNotMatch(markup, /<form|id="oauth-two-factor-code"/);
    });
  }
});
