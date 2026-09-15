import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import {
  NATIVE_DESKTOP_SETTINGS_KEY,
  type NativeDesktopSettings,
} from "@/lib/desktop/settings-client";
import { findSettingsTab } from "@/lib/settings/tree";
import { NativeDesktopSettingsProvider, useNativeDesktopSettings } from "./native-settings-context";
import { NativeShortcutEditor } from "./native-shortcut-editor";
import { DesktopNativeRow } from "./native-settings-rows";

const settings: NativeDesktopSettings = {
  application: { launchOnStartup: true, closeAction: "quit", gameDetectionEnabled: false },
  shortcuts: { enabled: false, entries: [] },
  platform: { os: "windows", arch: "x86_64", family: "windows" },
  updater: { enabled: true, available: false, currentVersion: "1.0.0", latestVersion: null },
};
function fixture() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(NATIVE_DESKTOP_SETTINGS_KEY, settings);
  let controller: ReturnType<typeof useNativeDesktopSettings>;
  function Probe() {
    controller = useNativeDesktopSettings();
    return null;
  }
  function render() {
    return renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <NativeDesktopSettingsProvider>
            <Probe />
            <NativeShortcutEditor />
            <DesktopNativeRow
              divider={false}
              row={findSettingsTab("desktop", "app")!.groups[0]!.rows[0]!}
            />
          </NativeDesktopSettingsProvider>
        </LocaleProvider>
      </QueryClientProvider>,
    );
  }
  render();
  return {
    client,
    render,
    get state() {
      return controller!;
    },
  };
}

it("reopens native settings with cached values during a failed background read", () => {
  const f = fixture();
  for (let mount = 0; mount < 3; mount++) {
    const markup = f.render();
    assert.match(markup, /data-testid="setting-toggle-w1"/);
    assert.match(markup, /aria-checked="true"/);
    assert.doesNotMatch(markup, /Masaüstü ayarları okunamadı/);
  }
  f.client
    .getQueryCache()
    .find({ queryKey: NATIVE_DESKTOP_SETTINGS_KEY })!
    .setState({ status: "error", error: new Error("offline") });
  assert.match(f.render(), /aria-checked="true"/);
  assert.doesNotMatch(f.render(), /Masaüstü ayarları okunamadı/);
  f.client.clear();
});

it("serializes writes across remounts and commits only the successful native result", async () => {
  const f = fixture();
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let calls = 0;
  const first = f.state.run(async () => {
    calls++;
    await gate;
    await f.state.update({ application: { ...settings.application, launchOnStartup: false } });
  });
  await new Promise((resolve) => setImmediate(resolve));
  f.render();
  assert.equal(
    await f.state.run(async () => {
      calls++;
    }),
    false,
  );
  assert.equal(
    f.client.getQueryData<NativeDesktopSettings>(NATIVE_DESKTOP_SETTINGS_KEY)!.application
      .launchOnStartup,
    true,
  );
  finish();
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(
    f.client.getQueryData<NativeDesktopSettings>(NATIVE_DESKTOP_SETTINGS_KEY)!.application
      .launchOnStartup,
    false,
  );
  assert.equal(
    await f.state.run(async () => {
      throw new Error("disk full");
    }),
    false,
  );
  assert.equal(
    f.client.getQueryData<NativeDesktopSettings>(NATIVE_DESKTOP_SETTINGS_KEY)!.application
      .launchOnStartup,
    false,
  );
  f.client.clear();
});

it("shortcut editor explains autosave and has no manual save button", () => {
  const f = fixture();
  const markup = f.render();
  assert.match(markup, /Geçerli kısayollar anında kaydedilir/);
  assert.doesNotMatch(markup, /Kısayol atamalarını kaydet/);
  assert.doesNotMatch(markup, /font-mono/);
  assert.match(markup, /Tümünü gör/);
  f.client.clear();
});
