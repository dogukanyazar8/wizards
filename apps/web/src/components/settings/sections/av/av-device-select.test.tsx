import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { AvAudioTab } from "@/components/settings/sections/av/audio-tab";
import { AvCameraTab } from "@/components/settings/sections/av/camera-tab";
import {
  AvDeviceSelect,
  buildAvDeviceOptions,
} from "@/components/settings/sections/av/av-device-select";
import { AvScreenShareTab } from "@/components/settings/sections/av/screen-share-tab";
import { getMessagesForLocale } from "@/lib/locale";
import { findSettingsTab, walkSettingsRows } from "@/lib/settings/tree";

/** Ş8 §A — cihaz menüleri gerçek listeden; üç sekme uçtan uca çiziliyor. */

function render(node: React.ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
        {node}
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("buildAvDeviceOptions", () => {
  it("varsayılan her zaman ilk seçenek", () => {
    const options = buildAvDeviceOptions([], {
      defaultLabel: "Sistem varsayılanı",
      unknownLabel: "Bilinmeyen cihaz",
    });

    assert.deepEqual(options, [{ deviceId: "default", label: "Sistem varsayılanı" }]);
  });

  it("etiketsiz cihaz kimliğiyle değil, adıyla anılıyor", () => {
    const options = buildAvDeviceOptions(
      [
        { deviceId: "mic-1", label: "" },
        { deviceId: "mic-2", label: " Yeti Nano " },
        { deviceId: "default", label: "Varsayılan" },
      ],
      { defaultLabel: "Sistem varsayılanı", unknownLabel: "Bilinmeyen cihaz" },
    );

    assert.deepEqual(options, [
      { deviceId: "default", label: "Sistem varsayılanı" },
      { deviceId: "mic-1", label: "Bilinmeyen cihaz" },
      { deviceId: "mic-2", label: "Yeti Nano" },
    ]);
  });
});

describe("AvDeviceSelect", () => {
  it("tasarımın örnek cihaz adları ürüne sızmıyor", () => {
    const row = findSettingsTab("av", "audio")
      ?.groups.flatMap((group) => group.rows)
      .find((candidate) => candidate.key === "i1");

    assert.ok(row);

    const markup = render(
      <AvDeviceSelect
        devices={[{ deviceId: "mic-9", label: "Blue Snowball" }]}
        onSelect={() => {}}
        row={row}
        selectedDeviceId="mic-9"
      />,
    );

    assert.ok(markup.includes("Blue Snowball"));
    // Ağacın örnek seçenekleri (`MacBook Pro Mikrofonu` …) çizilmiyor.
    assert.ok(!markup.includes("MacBook Pro Mikrofonu"));
    assert.ok(!markup.includes("AirPods Pro"));
  });
});

describe("Ses ve Video sekmeleri", () => {
  const rendered = {
    audio: render(<AvAudioTab />),
    camera: render(<AvCameraTab />),
    "screen-share": render(<AvScreenShareTab />),
  } as const;

  it("üç sekme de ağaçtaki her satırını çiziyor", () => {
    for (const [tabKey, markup] of Object.entries(rendered)) {
      const rows = [...walkSettingsRows()]
        .filter((entry) => entry.section.key === "av" && entry.tab.key === tabKey)
        .map((entry) => entry.row.key);

      assert.ok(rows.length > 0, tabKey);

      for (const key of rows) {
        assert.ok(markup.includes(`data-setting-row="${key}"`), `${tabKey}/${key} çizilmedi`);
      }
    }
  });

  it("örnek cihaz adları hiçbir sekmede yok", () => {
    for (const markup of Object.values(rendered)) {
      for (const sample of [
        "MacBook Pro Mikrofonu",
        "AirPods Pro",
        "FaceTime HD Kamera",
        "Studio Display",
      ]) {
        assert.ok(!markup.includes(sample), sample);
      }
    }
  });

  it("kamera izni sunucuda bilinmeyen durumla izin eylemini sunar", () => {
    assert.ok(rendered.camera.includes('data-permission-state="unknown"'));
    assert.ok(rendered.camera.includes("settings-permission-action-camera"));
    assert.ok(!rendered.camera.includes("Engellendi"));
  });

  it("aktif paylaşım satırı gerçek durumdan", () => {
    assert.ok(
      rendered["screen-share"].includes("Paylaşım başlatmak için bir sesli görüşmeye katıl."),
    );
    const button = rendered["screen-share"].match(
      /<button[^>]*data-testid="setting-actions-e7-0"[^>]*>/,
    )?.[0];
    assert.ok(button);
    assert.match(button, /(?:aria-disabled="true"|disabled="")/);
  });
});
