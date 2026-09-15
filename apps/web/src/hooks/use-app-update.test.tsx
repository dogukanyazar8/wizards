import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppUpdate } from "./use-app-update";
import { nativeSettingsClient } from "@/lib/desktop/settings-client";
import { useVoiceStore } from "@/store/voice-store";
import { AppUpdateRow } from "@/components/settings/rows/app-update-row";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { getMessagesForLocale } from "@/lib/locale";
import { appUpdateQueryOptions } from "@/lib/app-update-query";

it("pins installation, ignores duplicate clicks across remounts, and shares pending/error state", async (t) => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      __WHISPR_DESKTOP__: { shell: "desktop", features: { updater: true } },
    },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const client = new QueryClient();
  t.after(() => client.clear());
  let reject!: (reason: Error) => void;
  const pending = new Promise<void>((_, fail) => {
    reject = fail;
  });
  const install = t.mock.method(nativeSettingsClient, "install", () => pending);
  let state!: ReturnType<typeof useAppUpdate>;
  function Probe() {
    state = useAppUpdate(false, "desktop");
    return null;
  }
  const render = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  render();
  state.install("1.1.0");
  state.install("1.1.0");
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(state.installing, true);
  state.install("1.1.0");
  assert.equal(install.mock.callCount(), 1);
  assert.deepEqual(install.mock.calls[0]?.arguments, ["1.1.0"]);
  reject(new Error("download failed"));
  await new Promise((resolve) => setImmediate(resolve));
  render();
  assert.equal(state.installing, false);
  assert.equal(state.installFailed, true);
  useVoiceStore.setState({ activeConversationId: "direct-call" });
  t.after(() => useVoiceStore.setState({ activeConversationId: null }));
  // Recheck the live voice state, even when a call starts after the confirmation opened.
  state.install("1.1.0");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(install.mock.callCount(), 1);
});

it("shows a usable web check, displays reload only for an update, and exposes check errors", () => {
  const client = new QueryClient();
  const render = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
          <AppUpdateRow rowKey="o3" divider={false} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
  const key = appUpdateQueryOptions(false).queryKey;
  const data = {
    enabled: true,
    available: false,
    latestVersion: "1.1.0",
    checkedAt: Date.now(),
    currentVersion: "1.0.0",
    webVersion: null,
  };
  client.setQueryData(key, data);
  assert.match(render(), /Güncellemeleri denetle/);
  assert.doesNotMatch(render(), /Yenile ve güncelle/);
  client.setQueryData(key, { ...data, available: true });
  assert.match(render(), /Yenile ve güncelle/);
  assert.match(render(), /Son denetleme/);
  client
    .getQueryCache()
    .find({ queryKey: key })!
    .setState({ status: "error", error: new Error("offline") });
  assert.match(render(), /Güncellemeler denetlenemedi/);
  assert.doesNotMatch(render(), /En güncel sürümü/);
  client.clear();
});
