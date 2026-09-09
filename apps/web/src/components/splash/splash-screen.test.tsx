import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SPLASH_STATE_TEXT_KEYS, type SplashStepId } from "@wizards/types";
import type { SplashVisualStateId } from "@/components/splash/splash-visuals";

import { LocaleProvider } from "@/components/providers/locale-provider";
import { SplashScreen, type SplashScreenProps } from "@/components/splash/splash-screen";
import { getMessagesForLocale } from "@/lib/locale";

/**
 * SPEC-SPLASH §2/§3/§6/§7 — açılış ekranının yapı denetimi.
 *
 * Ölçüler CSS'te olduğu için burada ölçülmez; ölçülen şey **yapı**: aurora nerede,
 * hangi düzen hangi parçayı çiziyor, rozet ve sürüm satırı hangi karelerde var,
 * durum tonları karışıyor mu.
 */

function render(props: Partial<SplashScreenProps> & { step?: SplashStepId } = {}) {
  const { step = "connecting", surface = "desktop", ...rest } = props;

  return renderToStaticMarkup(
    <LocaleProvider initialLocale="tr" initialMessages={getMessagesForLocale("tr")}>
      <SplashScreen step={step} surface={surface} {...rest} />
    </LocaleProvider>,
  );
}

const STATES: SplashVisualStateId[] = ["slow", "offline", "updating", "sessionExpired"];

describe("SplashScreen · ortak katmanlar", () => {
  it("aurorayı kabuğun ilk çocuğu olarak çizer", () => {
    const html = render();
    const frameIndex = html.indexOf('class="whispr-splash-frame"');
    const auroraIndex = html.indexOf('class="whispr-splash-aurora"');
    const rowIndex = html.indexOf('class="whispr-splash-row"');

    assert.ok(frameIndex >= 0 && auroraIndex > frameIndex);
    assert.ok(auroraIndex < rowIndex, "aurora satırdan önce gelmeli");
  });

  it("logoyu tıklanamaz kılar ve DS wordmark'ını ayrı metinle değiştirir", () => {
    const html = render();

    assert.ok(!html.includes('href="/login"'), "splash logosu bağlantı olmamalı");
    assert.match(html, /class="whispr-splash-markbox"/);
    assert.match(html, /class="whispr-splash-wordmark">Whispr</);
    // DS'in kendi wordmark düğümü çizilir ama CSS ile gizlenir; iki "Whispr" olur.
    assert.equal(html.split("Whispr").length - 1 >= 2, true);
  });

  it("ortam rozetini ve sürüm satırını her karede gösterir", () => {
    const frames = [
      render(),
      render({ surface: "web" }),
      render({ layout: "narrow", surface: "web" }),
      ...STATES.map((state) => render({ state })),
    ];

    for (const html of frames) {
      assert.match(html, /class="whispr-splash-pill"/);
      assert.match(html, /data-testid="splash-version"/);
      assert.match(html, /Whispr \d+\.\d+\.\d+/);
    }

    assert.equal(frames.length, 7, "yedi kare denetlenmeli");
  });

  it("rozeti ortamla birlikte değiştirir", () => {
    assert.match(render({ environment: "prod" }), /data-env="prod"[^>]*>PROD</);
    assert.match(render({ environment: "uat" }), /data-env="uat"[^>]*>UAT</);
  });

  it("aynı karede rozeti iki kez çizmez", () => {
    for (const html of [render(), render({ layout: "narrow", surface: "web" })]) {
      assert.equal(html.split('class="whispr-splash-pill"').length - 1, 1);
    }
  });
});

describe("SplashScreen · adımlar", () => {
  it("aktifin öncesini onaylar, sonrasını bekletir", () => {
    const html = render({ step: "servers" });
    const statuses = [...html.matchAll(/data-status="(\w+)"/g)].map((match) => match[1]);

    assert.deepEqual(statuses, ["done", "done", "current", "pending"]);
  });

  it("dört adımı da sözlükteki metinle yazar", () => {
    const html = render({ step: "connecting" });

    for (const label of [
      "Bağlanıyor",
      "Oturum doğrulanıyor",
      "Sunucular yükleniyor",
      "Neredeyse hazır",
    ]) {
      assert.ok(html.includes(label), label);
    }
  });

  it("tamamlandığında dört adımı da onaylı çizer ve üç noktayı durdurur", () => {
    // Son adım yeşil görünmeden perde kalkarsa kullanıcı listenin bittiğini görmez.
    const html = render({ completed: true, step: "almostReady" });
    const statuses = [...html.matchAll(/data-status="(\w+)"/g)].map((match) => match[1]);

    assert.deepEqual(statuses, ["done", "done", "done", "done"]);
    assert.ok(!html.includes("whispr-splash-dots"));
  });

  it("dar düzende listeyi tek satıra indirir", () => {
    const html = render({ layout: "narrow", step: "session", surface: "web" });

    assert.match(html, /data-testid="splash-stepline"/);
    assert.ok(!html.includes('data-testid="splash-steps"'));
    assert.ok(html.includes("Oturum doğrulanıyor…"));
  });

  it("geniş düzende üç nokta yalnız masaüstünde çizilir", () => {
    assert.match(render(), /class="whispr-splash-dots"/);
    assert.ok(!render({ surface: "web" }).includes("whispr-splash-dots"));
  });
});

describe("SplashScreen · ipucu", () => {
  it("sunucuda ipucu seçmez ama satırın yerini korur", () => {
    const html = render();

    assert.match(html, /class="whispr-splash-tip"/);
    for (const tip of ["Ctrl + K", "Sesli kanalda M", "çift dokunarak", "Bahsedilmeler sekmesi"]) {
      assert.ok(!html.includes(tip), `${tip} sunucuda yazılmamalı`);
    }
  });

  it("masaüstünde ipucu panelde, web'de alt barda durur", () => {
    assert.match(render(), /whispr-splash-panel[\s\S]*whispr-splash-tip/);
    assert.match(render({ surface: "web" }), /whispr-splash-webfoot[\s\S]*whispr-splash-tip/);
  });
});

describe("SplashScreen · durumlar", () => {
  it("dört durumun metinlerini sözlükten alır", () => {
    const expected: Record<string, string> = {
      offline: "Sunucuya ulaşılamadı",
      sessionExpired: "Oturumun sona erdi",
      slow: "Bu biraz uzun sürüyor",
      updating: "Güncelleme indiriliyor",
    };

    for (const state of STATES) {
      assert.ok(render({ state }).includes(expected[state] ?? ""), state);
    }
  });

  it("ton ve karo zeminini ayrı değişkenlere yazar", () => {
    const html = render({ state: "slow" });

    assert.ok(html.includes("--whispr-splash-tone:hsl(var(--warning-soft))"));
    assert.ok(html.includes("--whispr-splash-tile:hsl(var(--warning) / 0.22)"));
    assert.ok(html.includes("--whispr-splash-wash:hsl(var(--warning) / 0.16)"));
  });

  it("doygun tonu metin rengi olarak kullanmaz", () => {
    for (const state of STATES) {
      const html = render({ state });
      const tone = /--whispr-splash-tone:([^;"]+)/.exec(html)?.[1] ?? "";

      assert.ok(
        tone.includes("-soft") || tone.includes("--text-secondary") || tone.includes("readable"),
        `${state} tonu okunur varyant olmalı, bulundu: ${tone}`,
      );
    }
  });

  it("güncelleme durumunda düğme yerine ilerleme çubuğu çizer", () => {
    const html = render({
      state: "updating",
      update: { downloadedBytes: 11_800_000, totalBytes: 18_400_000, version: "2.5.0" },
    });

    assert.match(html, /data-testid="splash-state-progress"/);
    assert.ok(!html.includes('data-testid="splash-state-action"'));
    assert.ok(html.includes("%64 · 11,8 / 18,4 MB"));
    assert.ok(html.includes("Sürüm 2.5.0 · 18,4 MB."));
  });

  it("toplam boyut bilinmiyorsa yüzde satırını ve sayıları yazmaz", () => {
    const html = render({
      state: "updating",
      update: { downloadedBytes: 12, totalBytes: null, version: null },
    });

    assert.ok(!html.includes("MB"));
    assert.ok(html.includes("İndirme bitince uygulama kendini yeniden başlatır."));
  });

  it("diğer üç durumda eylem düğmesini çizer", () => {
    for (const state of ["slow", "offline", "sessionExpired"] as const) {
      const html = render({ state });

      assert.match(html, /data-testid="splash-state-action"/, state);
      assert.ok(html.includes(`>${TR_ACTION[state]}<`), state);
    }
  });

  it("normal yüklemede durum paneli çizilmez", () => {
    const html = render();

    assert.ok(!html.includes("whispr-splash-state-title"));
    assert.ok(!html.includes("whispr-splash-tile"));
    assert.match(html, /data-testid="splash-steps"/);
  });

  it("her durumun metin anahtarları sözleşmeden gelir", () => {
    for (const state of STATES) {
      assert.ok(SPLASH_STATE_TEXT_KEYS[state], state);
    }
  });
});

const TR_ACTION: Record<"offline" | "sessionExpired" | "slow", string> = {
  offline: "Tekrar dene",
  sessionExpired: "Giriş yap",
  slow: "Yeniden başlat",
};

describe("SplashScreen · erişilebilirlik", () => {
  it("kökü canlı bölge yapar ve yalnız aktif adımı duyurur", () => {
    const html = render({ step: "servers" });

    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /class="sr-only">Sunucular yükleniyor</);
  });

  it("durumda başlığı duyurur", () => {
    assert.match(render({ state: "offline" }), /class="sr-only">Sunucuya ulaşılamadı</);
  });

  it("sönerken tıklamayı geçirmez", () => {
    assert.match(render({ visible: false }), /pointer-events-none/);
  });

  it("masaüstü kabuğunu iki varyantta da aynı kutuda çizer", () => {
    // Gölge payı pencere ölçüsünde; kabuk her iki varyantta da 420 × 280 kalır.
    for (const variant of ["window", "overlay"] as const) {
      const html = render({ variant });

      assert.match(html, /data-surface="desktop"/, variant);
      assert.match(html, new RegExp(`data-variant="${variant}"`), variant);
    }
  });

  it("masaüstü penceresini sürüklenebilir işaretler", () => {
    assert.match(render({ draggable: true }), /data-tauri-drag-region/);
    assert.ok(!render().includes("data-tauri-drag-region"));
  });
});
