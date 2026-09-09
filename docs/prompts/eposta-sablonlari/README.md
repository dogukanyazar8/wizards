# Whispr · İşlemsel e-posta şablonları — 2 dalgalık uygulama paketi

Kaynak tasarım: `design_handoff/eposta-handoff/` (SPEC + PROMPT + iki referans HTML + dört
ekran görüntüsü). Hedef: kayıt doğrulama ve şifre sıfırlama e-postalarını tasarıma **birebir**
sadık biçimde web / masaüstü / mobil için tek sunucu katmanında üretmek.

Branch: `uat`. Commit atılmaz.

## Paket

| Dosya                | Ne                                                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `00-ortak-baglam.md` | **Bağlayıcı** ortak bağlam: tokenlar, tipografi, iskelet, kararlar K1–K8, kod haritası, sözlük tabloları, kabul ölçütleri, yasaklar |
| `dalga-1.md`         | Başlatma promptu · tasarım katmanı + doğrulama kodu + kayıt denemesi                                                                |
| `dalga-2.md`         | Başlatma promptu · şifre sıfırlama + istek bağlamı + önizleme + doğrulama                                                           |
| `raporlar/`          | Dalga çıktıları (dalgalar yazar)                                                                                                    |
| `SONUC.md`           | Paket kapanış raporu (Dalga 2 yazar)                                                                                                |

Sıra: `00` oku → `dalga-1.md` içindeki promptu ver → raporu incele → `dalga-2.md`.

## Temel gerçek

Üç istemci **ayrı şablon üretmez.** Mobil `apps/web/src/lib/mobile/auth.ts`, masaüstü ise
Tauri kabuğu üzerinden aynı web akışını kullanır; e-postaların tamamı
`apps/web/src/lib/auth/*` içindeki dört gönderim noktasından çıkar. Bu yüzden iş, üç ayrı
uygulama işi değil, tek bir sunucu render katmanı + uçlardan bağlam iletimi işidir.

## Dalga sınırı

Sınır "istek bağlamı gerektiren / gerektirmeyen" ekseninde çizildi:

- **Dalga 1** — bağlam istemeyen her şey: token/tipografi katmanı, kabuk, bloklar, düz metin
  üreteci, tr + en sözlüğün tamamı, doğrulama kodu şablonu, kayıt denemesi şablonu, gönderim
  yoluna bağlama, birebirlik testi.
- **Dalga 2** — bağlam isteyen her şey: cihaz satırı ve istek zamanı çözücüsü, şifre sıfırlama
  şablonu, web + mobil uçlardan başlık iletimi, `/dev/email-preview`, görsel karşılaştırma,
  tam kapı.

Dalga 1 bittiğinde şifre sıfırlama e-postası bilerek eski tasarımda kalır; bu bir eksik değil,
sınırın kendisidir.

## Kararlar (kullanıcı onaylı)

| #   | Karar                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Bağlantılar gerçek ürün rotaları (`/verify-email`, `/reset-password`, `/privacy`, `/terms`, `/cookies`, `/settings/account/security`). Yeni rota eklenmez. |
| K2  | tr birebir SPEC, en sadık çeviri; tasarım iki dilde aynı.                                                                                                  |
| K3  | Tek gönderen (`RESEND_FROM_EMAIL`); `hesap@` / `guvenlik@` ayrımı yok.                                                                                     |
| K4  | Kapsam: doğrulama kodu + şifre sıfırlama + kayıt denemesi. Hesap silme (reauth) e-postası kapsam dışı.                                                     |
| K5  | Cihaz satırı `Tarayıcı · OS · Şehir, Ülke`; eksik parça düşer, uydurma değer yok.                                                                          |
| K6  | İstek zamanı `UserSettings.timeZone`, yoksa `Europe/Istanbul`.                                                                                             |
| K7  | Doğrulama konusu kodu taşır; kod yoksa kodsuz biçime düşer.                                                                                                |
| K8  | `/dev/email-preview` galerisi (üretimde 404).                                                                                                              |

## Tasarım dışı çıkarımlar

Yalnız dört tane, hepsi işaretli: **E1** kayıt denemesi bant etiketi, **E2** göz üstü etiketi,
**E3** blok düzeni, **E4** İngilizce tarih biçiminin 24 saat kalması. Başka sapma yok.

## Kapı

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web lint
```

Birebirlik kapısı: `email-reference-parity.test.ts` — üretilen HTML'in yapı imzasını
`design_handoff/eposta-handoff/html/*.html` ile karşılaştırır. Yeşil değilse dalga bitmemiştir.
