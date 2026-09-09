import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AccountSession } from "@wizards/types";

import { LocaleProvider } from "@/components/providers/locale-provider";
import {
  AccountSessionsProvider,
  ActiveSessionsBlock,
  type AccountSessionsValue,
} from "@/components/settings/blocks/active-sessions-block";
import { getMessagesForLocale } from "@/lib/locale";
import { SETTINGS_METRICS } from "@/lib/settings/metrics";
import type { SettingsRowDef } from "@/lib/settings/tree";

/** Ş7 §4 / tuzak #13 — `Bu cihaz` satırında kapat düğmesi **yok**. */

const MESSAGES = getMessagesForLocale("tr");
const ROW: SettingsRowDef = { block: "sessions", key: "o1", type: "custom" };

function session(overrides: Partial<AccountSession> = {}): AccountSession {
  return {
    browser: "Chrome",
    current: false,
    device: "Chrome · macOS",
    id: "session-1",
    lastActive: "2026-08-24T09:00:00.000Z",
    location: "TR",
    os: "macOS 15.3",
    platform: "web",
    ...overrides,
  };
}

function render(value: Partial<AccountSessionsValue>): string {
  const full: AccountSessionsValue = {
    failed: false,
    pending: false,
    refresh: () => {},
    revoke: () => {},
    revokeOthers: () => {},
    sessions: null,
    ...value,
  };

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={MESSAGES}>
      <AccountSessionsProvider value={full}>
        <ActiveSessionsBlock data={{}} row={ROW} />
      </AccountSessionsProvider>
    </LocaleProvider>,
  );
}

describe("ActiveSessionsBlock — tuzak #13", () => {
  it("`Bu cihaz` satırında X düğmesi yok", () => {
    const markup = render({
      sessions: [session({ current: true, id: "current" }), session({ id: "other" })],
    });

    assert.ok(!markup.includes('data-testid="settings-session-current-close"'));
    assert.ok(markup.includes('data-testid="settings-session-other-close"'));
  });

  it("`Bu cihaz` pili ve yeşil zemin yalnız mevcut oturumda", () => {
    const markup = render({ sessions: [session({ current: true, id: "current" })] });

    assert.ok(markup.includes('data-testid="settings-session-current-current"'));
    assert.ok(
      markup.includes(
        `hsl(var(--success) / ${SETTINGS_METRICS.blocks.sessions.currentSurfaceAlpha})`,
      ),
    );
  });
});

describe("ActiveSessionsBlock — durumlar", () => {
  it("liste yokken iskelet", () => {
    assert.ok(render({}).includes('data-testid="settings-block-o1-skeleton"'));
  });

  it("boş liste kendi cümlesini yazıyor", () => {
    assert.ok(render({ sessions: [] }).includes("Açık oturum yok."));
  });

  it("okuma düşerse hata cümlesi", () => {
    assert.ok(render({ failed: true }).includes("Oturumlar yüklenemedi."));
  });

  it("satır cihaz · platform ve işletim sistemi · konum yazıyor", () => {
    const markup = render({ sessions: [session()] });

    assert.ok(markup.includes("Chrome · macOS · Web"));
    assert.ok(markup.includes("macOS 15.3"));
  });

  it("işlem uçarken kapat düğmesi kilitli", () => {
    const markup = render({ pending: true, sessions: [session()] });

    assert.match(markup, /settings-session-session-1-close"[^>]*disabled/u);
  });
});
