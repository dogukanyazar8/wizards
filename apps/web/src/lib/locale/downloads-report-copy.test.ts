import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { EN_MESSAGES } from "./messages/en";
import { TR_MESSAGES } from "./messages/tr";

/**
 * SPEC-INDIRME metin denetimi.
 *
 * `design_handoff/app_new/indirme-sorunbildir-paketi/SPEC.md` tek doğru kaynak ve
 * Türkçe metinlerin **birebir** aynı olmasını istiyor. Bir kelime kaymasını
 * hiçbir görsel test yakalamaz; bu dosya yakalar.
 */

const TR: Record<string, string> = TR_MESSAGES;
const EN: Record<string, string> = EN_MESSAGES;

/** SPEC §0, §A.2–§A.11 — Türkçe değerler, SPEC'teki sırayla. */
const REPORT_TR = {
  "shell.serverRail.downloadApp": "Uygulamayı indir",
  "shell.serverRail.reportProblem": "Sorun bildir",
  "report.title": "Sorun bildir",
  "report.subtitle": "Ne olduğunu anlat, ekipler doğrudan görsün",
  "report.where": "NEREDE OLDU?",
  "report.required": "Zorunlu",
  "report.category.voice": "Ses ve arama",
  "report.category.chat": "Sohbet",
  "report.category.notification": "Bildirim",
  "report.category.performance": "Performans",
  "report.category.other": "Diğer",
  "report.what": "NE OLDU?",
  "report.placeholder": "Ne oldu? Hangi adımlardan sonra?",
  "report.hint": "Adım adım anlatırsan daha hızlı çözeriz",
  "report.counter": "{count} / {max}",
  "report.attachments": "RAPORA EKLENECEKLER",
  "report.logs.title": "Sistem günlükleri",
  "report.logs.body": "Son {count} satır · mesaj içeriği yok",
  "report.screenshot.title": "Ekran görüntüsü",
  "report.screenshot.empty": "Ekle · kaldırabilirsin",
  "report.screenshot.ready": "{name} · {size} · kaldırabilirsin",
  "report.screenshot.uploading": "Yükleniyor · %{percent} · {size}",
  "report.screenshot.failed": "Yüklenemedi · {reason}",
  "report.screenshot.add": "Ekran görüntüsü ekle",
  "report.screenshot.remove": "Kaldır",
  "report.screenshot.retry": "Tekrar dene",
  "report.screenshot.view": "Tam ekran görüntüle",
  "report.device.title": "Cihaz ve sürüm bilgisi",
  "report.device.body": "{browser} · {os} · {version} ({build}) · {channel}",
  "report.privacy":
    "Mesajların, kişilerin ve dosyaların hiçbir zaman gönderilmez. Rapor 90 gün sonra silinir.",
  "report.error.validation": "Kategori seç ve en az 20 karakterle ne olduğunu anlat.",
  "report.error.submit": "Rapor gönderilemedi. Bağlantını kontrol edip tekrar dene.",
  "report.error.upload": "Ekran görüntüsü yüklenemedi. Tekrar dene veya eki kapat.",
  "report.offline": "Bağlantı yok. Rapor şimdi gönderilemez — ağ geldiğinde tekrar dene.",
  "report.footer.sending": "Rapor gönderiliyor…",
  "report.footer.offline": "Ağ gelince tekrar dene.",
  "report.footer.category": "Kategori seç ve en az 20 karakter yaz.",
  "report.footer.short": "{count} karakter daha yaz.",
  "report.footer.ready": "Rapor doğrudan ürün ekibine gider.",
  "report.cancel": "Vazgeç",
  "report.submit": "Raporu gönder",
  "report.submitting": "Gönderiliyor",
  "report.discard.title": "Vazgeçilsin mi?",
  "report.discard.body": "Bu rapordaki değişikliklerin kaybolacak.",
  "report.discard.confirm": "Vazgeç",
  "report.discard.cancel": "Devam et",
  "report.success.title": "Rapor alındı",
  "report.success.body": "Ürün ekibi bu numarayla takip edecek. Rapor 90 gün sonra silinir.",
  "report.success.copy": "Numarayı kopyala",
  "report.success.copied": "Kopyalandı",
} as const;

/** SPEC §B.1–§B.7 — Türkçe değerler. */
const DOWNLOAD_TR = {
  "download.title": "Whispr'i indir",
  "download.subtitle": "Masaüstü ve mobil uygulamalar · {environment} ortamı",
  "download.environment": "ORTAM",
  "download.env.prod.name": "PROD",
  "download.env.prod.pill": "Kararlı",
  "download.env.prod.body": "Günlük kullanım için yayınlanan sürüm",
  "download.env.uat.name": "UAT",
  "download.env.uat.pill": "Test",
  "download.env.uat.body": "Yayın öncesi doğrulama ortamı",
  "download.notice.prod": "Yayındaki kararlı sürüm. Gerçek hesabınla ve gerçek verilerle çalışır.",
  "download.notice.uat":
    "Test ortamına bağlanır. Gerçek hesabınla giriş yapamazsın, veriler haftalık sıfırlanır.",
  "download.desktop": "MASAÜSTÜ",
  "download.mobile": "MOBİL",
  "download.mobile.note.prod": "mağaza sürümü",
  "download.mobile.note.uat": "yalnızca test kullanıcıları",
  "download.action.download": "İndir",
  "download.action.store.android": "Play Store",
  "download.action.store.ios": "App Store",
  "download.action.apk": "APK indir",
  "download.action.testflight": "TestFlight",
  "download.diff": "FARK",
  "download.diff.server": "Sunucu",
  "download.diff.server.prod": "api.whispr.app",
  "download.diff.server.uat": "uat-api.whispr.app",
  "download.diff.account": "Hesap",
  "download.diff.account.prod": "Gerçek hesabın",
  "download.diff.account.uat": "Yalnızca test hesapları",
  "download.diff.update": "Güncelleme",
  "download.diff.update.prod": "2–3 haftada bir",
  "download.diff.update.uat": "Her gün otomatik",
  "download.diff.data": "Veri",
  "download.diff.data.prod": "Kalıcı",
  "download.diff.data.uat": "Haftalık sıfırlanır",
  "download.footer.note": "Tüm paketler imzalı HTTPS release bağlantısından iner.",
  "download.footer.releaseNotes": "Sürüm notları",
} as const;

describe("SPEC-INDIRME metin denetimi", () => {
  it("§0/§A metinleri SPEC ile karakter karakter aynı", () => {
    for (const [key, value] of Object.entries(REPORT_TR)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("§B metinleri SPEC ile karakter karakter aynı", () => {
    for (const [key, value] of Object.entries(DOWNLOAD_TR)) {
      assert.equal(TR[key], value, key);
    }
  });

  it("her anahtarın İngilizce karşılığı da var ve boş değil", () => {
    for (const key of [...Object.keys(REPORT_TR), ...Object.keys(DOWNLOAD_TR)]) {
      assert.ok(EN[key], `${key} is missing from en.ts`);
      assert.notEqual(EN[key]?.trim(), "");
    }
  });

  it("yer tutucular iki dilde de aynı", () => {
    const placeholders = (value: string) => (value.match(/\{[a-zA-Z]+\}/g) ?? []).sort();

    for (const key of [...Object.keys(REPORT_TR), ...Object.keys(DOWNLOAD_TR)]) {
      assert.deepEqual(placeholders(EN[key] ?? ""), placeholders(TR[key] ?? ""), key);
    }
  });

  it("gizlilik notu sunucunun 90 günlük saklama sözüyle aynı sayıyı söylüyor", () => {
    assert.match(TR["report.privacy"] ?? "", /90 gün/);
    assert.match(TR["report.success.body"] ?? "", /90 gün/);
    assert.match(EN["report.privacy"] ?? "", /90 days/);
    assert.match(EN["report.success.body"] ?? "", /90 days/);
  });
});
