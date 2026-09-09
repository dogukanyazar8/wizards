import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPLASH_TEXT_KEYS } from "@wizards/types";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * SPEC-SPLASH metin denetimi.
 *
 * `design_handoff/splash-1b-paketi/SPEC.md` tek doğru kaynak ve Türkçe metinlerin
 * **birebir** aynı olmasını istiyor. Bir kelime kayması hiçbir görsel testte
 * görünmez; bu dosyada görünür.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/** SPEC §3.5, §3.6 ve §7 — Türkçe değerler, SPEC'teki sırayla. */
const SPLASH_TR = {
  "splash.kicker": "Hazırlanıyor",
  "splash.tagline": "Sesli sohbet ve topluluk",
  "splash.step.connecting": "Bağlanıyor",
  "splash.step.session": "Oturum doğrulanıyor",
  "splash.step.servers": "Sunucular yükleniyor",
  "splash.step.almostReady": "Neredeyse hazır",
  "splash.env.prod": "PROD",
  "splash.env.uat": "UAT",
  "splash.tip.commandPalette": "Ctrl + K ile sunucu, kanal ve kişiler arasında atla.",
  "splash.tip.voiceMute": "Sesli kanalda M tuşu mikrofonu anında kapatır.",
  "splash.tip.quickReaction": "Bir mesaja çift dokunarak hızlı tepki bırak.",
  "splash.tip.mentions": "Bahsedilmeler sekmesi sana gelen her şeyi tek listede toplar.",
  "splash.state.slow.kicker": "Uzun sürüyor",
  "splash.state.slow.title": "Bu biraz uzun sürüyor",
  "splash.state.slow.description":
    "Bağlantın yavaş olabilir. Beklemeye devam edebilir ya da uygulamayı yeniden başlatabilirsin.",
  "splash.state.slow.action": "Yeniden başlat",
  "splash.state.offline.kicker": "Bağlantı hatası",
  "splash.state.offline.title": "Sunucuya ulaşılamadı",
  "splash.state.offline.description":
    "İnternet bağlantını kontrol et. Bağlantı gelince otomatik olarak deneriz.",
  "splash.state.offline.action": "Tekrar dene",
  "splash.state.updating.kicker": "Güncelleme",
  "splash.state.updating.title": "Güncelleme indiriliyor",
  "splash.state.sessionExpired.kicker": "Oturum",
  "splash.state.sessionExpired.title": "Oturumun sona erdi",
  "splash.state.sessionExpired.description":
    "Güvenlik için yeniden giriş yapman gerekiyor. Sunucuların ve mesajların yerinde.",
  "splash.state.sessionExpired.action": "Giriş yap",
} as const;

describe("splash copy", () => {
  it("matches the handoff word for word", () => {
    for (const [key, value] of Object.entries(SPLASH_TR)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("keeps the update line a template instead of a frozen version and size", () => {
    // SPEC §7 bu satırı `Sürüm 2.5.0 · 18,4 MB.` diye sabit yazıyor. Sabit metin her
    // güncellemede yanlış sürüm ve yanlış boyut gösterirdi; kalan cümle birebir aynı.
    assert.equal(
      TR["splash.state.updating.description"],
      "Sürüm {version} · {size}. İndirme bitince uygulama kendini yeniden başlatır.",
    );
    assert.equal(
      EN["splash.state.updating.description"],
      "Version {version} · {size}. The app restarts itself once the download finishes.",
    );

    // Sürüm ve boyut bilinmiyorsa şablonun **başı** düşer, cümlenin kalanı aynen kalır:
    // `Sürüm {version} · {size}.` yerine boş bir ön ek basmak "Sürüm  · ." üretirdi.
    // Anahtar SPEC'te yok (orada sayı sabit), o yüzden metni burada kilitleniyor.
    assert.equal(
      TR["splash.state.updating.descriptionUnknown"],
      "İndirme bitince uygulama kendini yeniden başlatır.",
    );
    assert.equal(
      EN["splash.state.updating.descriptionUnknown"],
      "The app restarts itself once the download finishes.",
    );
  });

  it("defines every contract key in both dictionaries", () => {
    for (const key of SPLASH_TEXT_KEYS) {
      assert.ok(TR[key], `TR is missing ${key}`);
      assert.ok(EN[key], `EN is missing ${key}`);
    }
  });

  /**
   * Güncelleme cümlesinin iki şekli de SPEC'in **sabit** satırından türediği için denetim
   * listesinde yer almaz; ikisi de bir üstteki maddede kelimesi kelimesine kilitli.
   */
  const TEMPLATED_UPDATE_KEYS = new Set<string>([
    "splash.state.updating.description",
    "splash.state.updating.descriptionUnknown",
  ]);

  it("covers the whole contract with the audited Turkish list", () => {
    const audited = new Set<string>(Object.keys(SPLASH_TR));
    const untested = SPLASH_TEXT_KEYS.filter(
      (key) => !audited.has(key) && !TEMPLATED_UPDATE_KEYS.has(key),
    );

    assert.deepEqual(untested, []);
  });

  it("keeps the environment badges identical in both languages", () => {
    assert.equal(TR["splash.env.prod"], EN["splash.env.prod"]);
    assert.equal(TR["splash.env.uat"], EN["splash.env.uat"]);
  });
});
