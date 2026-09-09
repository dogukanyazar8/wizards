# SONUÇ — İndirme ve Sorun bildir paketi

Üç dalga da uygulandı. Branch `uat`, **commit yok**. Tarih 2026-08-26.

---

## 1. Ne landed

| Dalga | Şerit                                                                                        | Durum |
| ----- | -------------------------------------------------------------------------------------------- | ----- |
| 1     | Ş1–Ş7 · sözleşme, `DownloadArtifact` + migration, iki uç, yükleme izni, günlük tamponu, i18n | ✅    |
| 2     | Ş8–Ş12 · ray alt bloğu + Sorun bildir penceresinin 13 durumu                                 | ✅    |
| 3     | Ş13–Ş16 · İndirme penceresi, admin katalog konsolu, parity/a11y spec'i                       | ✅    |

Yeni uçlar: `POST /api/v1/support/report`, `GET /api/v1/app/downloads`,
`GET|POST /api/v1/admin/downloads`, `PATCH|DELETE /api/v1/admin/downloads/[artifactId]`.
Yeni tablo: `DownloadArtifact` (migration `20260826090000_download_catalog`, yerelde koştu).
Yeni admin modülü: `/admin/downloads` (yetki `release.read` / `release.write`).

## 2. Kabul kriterleri

`design_handoff/indirme-sorunbildir-paketi/PROMPT.md` 19 madde.

### Sorun bildir (12/12 uygulandı)

| #   | Madde                                                       | Kanıt                                         |
| --- | ----------------------------------------------------------- | --------------------------------------------- |
| 1   | Pasif buton + alt bar notu eksiği söylüyor                  | `bug-report-form-model.test.ts` · parity spec |
| 2   | Sayaç eşikleri ve 1000'de kesme                             | `bug-report-form-model.test.ts`               |
| 3   | Üç toggle, alt metinler, cihaz satırı kapalıyken de görünür | `bug-report-view.test.tsx`                    |
| 4   | Ekran görüntüsü dört durum (yüzde + ilerleme çubuğu)        | `bug-report-view.test.tsx`                    |
| 5   | Önizleme → tam ekran, tek eylem "Kaldır"                    | `bug-report-overlays.tsx` · model testi       |
| 6   | Dolu taslakta onay, boşta doğrudan kapanış                  | `bug-report-form-model.test.ts` · parity spec |
| 7   | Gönderim: spinner + salt okunur + başarı ekranı + kopyalama | `bug-report-view.test.tsx`                    |
| 8   | Gönderilmişte/gönderirken X onay sormaz                     | `shouldConfirmBugReportClose` testi           |
| 9   | Yeniden açılışta form sıfır                                 | `WorkspaceModals` `modalKey`                  |
| 10  | Üç hata metni ayrı                                          | `bug-report-view.test.tsx` · i18n testi       |
| 11  | Çevrimdışı: pasif buton + sarı satır                        | model testi (`canSubmitBugReport`)            |
| 12  | Odak ilk çipte, Tab tuzağı                                  | `Modal` `initialFocusRef` · parity spec       |

### İndirme (4/4 uygulandı)

| #   | Madde                                                        | Kanıt                                  |
| --- | ------------------------------------------------------------ | -------------------------------------- |
| 13  | PROD/UAT tüm içeriği çeviriyor                               | `download-view.test.tsx` · parity spec |
| 14  | Üç masaüstü kartı, uzantı pili, meta satırı                  | `download-view.test.tsx`               |
| 15  | PROD mağaza (dış bağlantı), UAT APK/TestFlight (indirme oku) | `download-presentation.test.ts`        |
| 16  | Fark tablosu 4 satır, aktif sütun vurgulu                    | `download-view.test.tsx`               |

### Her iki pencere (3/3 uygulandı)

| #   | Madde                                                   | Kanıt                                         |
| --- | ------------------------------------------------------- | --------------------------------------------- |
| 17  | 520/560 genişlik, `max-height:100%`, yalnız gövde kayar | `bug-report-modal.tsx` / `download-modal.tsx` |
| 18  | Karartma `.72`, radius 22, `0 48px 96px -40px` gölge    | aynı iki dosya                                |
| 19  | Esc kapatır, Enter göndermez                            | parity spec                                   |

## 3. Doğrulama

```bash
pnpm --filter @wizards/web test
```

- `@wizards/web` typecheck ✅ · lint ✅ · **7254 test / 14 fail**
- `@wizards/db` 151/151 ✅ · migration yerelde uygulandı
- Bu paketin kendi testleri: **69** (types 15, db 5, route 17, servis 15, görünüm 20 + i18n 5)

**14 kırık bu paketin değil.** Hepsi Dalga 1'de belgelendi ve sayı üç dalga boyunca değişmedi:
`discover` (8), `events` (2), `servers/shared` (1), `discover/identity` (1),
`settings-screen-copy` (1), `server-screen-copy` (1) — uncommitted sunucu/keşfet/etkinlik
işinden geliyor. Kanıt: `server.create.footer.hint` anahtarı ve onu bekleyen test **HEAD'de
hiç yok**, ikisi de aynı uncommitted dalgadan geliyor ve birbirleriyle çelişiyorlar.

`@wizards/types` 2 kırık: `mobile.test.ts` invite-preview ifşa listesi
`ServerPublicProfileSchema`'ya eklenen `iconColor`'ı bilmiyor. O test bilerek bir **inceleme
kapısı**; listeyi güncellemek bir ifşa kararıdır ve bu paketin işi değil, o yüzden dokunulmadı.

## 4. Koşulamayan iki şey

1. **Canlı uygulamada görsel karşılaştırma.** `/login` şart; `.env`'deki `E2E_TEST_PASSWORD`
   ve `SEED_DEMO_PASSWORD` boş, hesap açmak yasak. 15 ekran görüntüsüyle birebir karşılaştırma
   **yapılmadı**; yukarıdaki maddeler koda ve testlere göre işaretlendi, göze göre değil.
2. **Parity/a11y e2e.** `apps/web/e2e/specs/design/downloads-report-parity.spec.ts` yazıldı
   (9 test: ray düğmeleri, karşılıklı münhasırlık, pasif buton daveti, Esc katman sırası,
   Enter göndermez, ortam anahtarlaması + tek istek, fark tablosu, iki temada taşma yok, axe
   WCAG A/AA) ama **koşulmadı** — aynı kimlik engeli.

Yerel bir test hesabı verildiğinde koşulacak sıra:

```bash
pnpm --filter @wizards/web exec playwright test e2e/specs/design/downloads-report-parity.spec.ts
```

## 5. Tasarımın dışına çıkılan yerler (hepsi bilinçli, gerekçeli)

| #   | Yer                            | Ne yapıldı                                                         | Neden                                                                                      |
| --- | ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| S1  | Ekran görüntüsü toggle'ı       | Gerçek dosya seçici açar; kullanıcı vazgeçerse toggle geri kapanır | Referans mock'u doğrudan `ready` yapıyordu; web'de dosya olmadan ek olamaz                 |
| S2  | Gönder butonu                  | `disabled` değil `aria-disabled`                                   | SPEC §A.8 pasif butona tıklamanın hata göstermesini istiyor; `disabled` tıklamayı doğurmaz |
| S3  | Katalog yükleniyor / okunamadı | Tek satırlık nötr metin + "Tekrar dene"                            | SPEC bu iki durumu çizmiyor; yeni görsel dil kurulmadı                                     |
| S4  | Boş ortam                      | Bölüm kartında tek satırlık bilgi                                  | SPEC boş katalogdan söz etmiyor                                                            |
| S5  | "Sürüm notları" hedefi         | Ayarlar › Hakkında (`/settings/about/about`)                       | Web'de gerçek bir sürüm notu yüzeyi orası (`whatsNew` bloğu); dış bağlantı uydurulmadı     |
| S6  | `download.diff.server.*`       | i18n değeri (`api.whispr.app`)                                     | Gerçek yapılandırma kaynağı yok; README de bunu örnek veri diye işaretliyor                |
| S7  | Uzantı/meta etiketleri         | İki dilli (`tr`/`en`) veri                                         | Uygulama iki dilli; tasarım tek dil gösteriyor                                             |

## 6. Açık kalan tek karar

`download.diff.server.*` adresleri hâlâ i18n sabiti. Gerçek ortam adresleri bir yapılandırma
kaynağına bağlanacaksa (env ya da katalog satırı) bu ayrı bir küçük iştir.
