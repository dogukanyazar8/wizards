# Admin Paneli Yeniden Tasarımı — Alt Proje Haritası

**Tarih:** 2026-07-26 · **Revizyon:** 2026-07-27 (spec-correction turu)
**Dal:** uat

Admin panelinin baştan tasarımı tek spec'e sığmadığı için altı alt projeye
ayrıldı. Değerlendirme turundan sonra alt projeler kendi içlerinde de fazlara
bölündü — her faz bağımsız teslim edilebilir ve kendi bitti kanıtı var.

Hedef kullanıcı (hepsi için): **platform operasyon ekibi** — küçük, tam
yetkili. Bu seçim kiracı izolasyonunu ve PII maskelemeyi ilk sürümün kapsamı
dışında bırakır.

## Revizyon özeti

Spec-correction turunda kodda doğrulanan sekiz bulgu tasarımı değiştirdi.
İkisi **bugün üretimde olan hata**, biri **tasarım hatam**:

| Bulgu                                                                                                                                             | Sonuç                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Dört admin API rotası rol filtresiz (`users`, `servers`, `activity.csv`, `dashboard`) — `ANALYST` ham e-posta ve tüm aktivite CSV'sini alabiliyor | **Canlı açık.** B1 fazına çıkarıldı, ilk sırada                                              |
| `FAILED` kampanya yeniden gönderilince herkese ikinci kez gidiyor (`dedupeKey` yok, `sentCount` sıfırlanıyor, alıcı listesi yeniden çözülüyor)    | **Canlı hata.** E1 fazına çıkarıldı, ilk sırada                                              |
| Mobil Bearer token kullanıyor, `requireAdminUser` çerez okuyor                                                                                    | F'deki mobil uçlar hiç çalışmazdı. `requireMobileAdminCapability` tanımlandı                 |
| Rapor sözleşmesi (`MobileUserReportRequestSchema`) `.strict()` ve delil taşımıyor — yeni raporlarda da                                            | D, D1 (profil raporu kuyruğu) ve D2 (delil sözleşmesi) olarak ikiye bölündü                  |
| `ModerationCase.subjectId` cascade — konu hesabını silen kaydı da siliyordu                                                                       | `SetNull` + `subjectHandle` kopyası + iki katmanlı silme politikası                          |
| Push sağlayıcısı Expo, FCM değil; kampanya push'u hiç çağırmıyor; iOS token kaydı zaten destekli                                                  | C3 Expo ticket/receipt ayrımına göre yeniden yazıldı; v1 yalnızca "Expo kabul oranı" ölçüyor |
| Funnel'ın kayıt ve e-posta doğrulama adımları platforma göre kırılamaz (`User`'da platform kolonu yok)                                            | C4'te kısıt açıkça yazıldı, uydurma kırılım kaldırıldı                                       |
| `/admin#users` sunucuda yönlendirilemez — fragment HTTP isteğine gitmiyor                                                                         | Client-side shim'e çevrildi                                                                  |

Ayrıca: A'daki "tüm eski oturumlar `WEB`" ifadesi **çıkarım olarak** yeniden
etiketlendi ve uygulamanın adım 0'ı ölçüm yapıldı. Eski `AppSession` satırları
için `attributionVerified` kesim bayrağı eklendi.

Değerlendirmenin bir maddesine itiraz edildi: A'nın socket/voice/outbox
attribution zinciri spec'te zaten tanımlıydı (satır 81, 208, 216). Geçerli olan
kısım — eski `AppSession` verisinin de güvenilmez olması — kabul edildi ve
eklendi.

## Alt projeler ve fazlar

| Faz    | Spec                                                                | Kapsam                                                                                | Bağımlılık            |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------- |
| **B1** | [Panel kabuğu §5](2026-07-26-admin-panel-shell-design.md)           | Merkezi API capability politikası, `requireAdminCapability`, kapsama sözleşme testi   | yok                   |
| **E1** | [Kampanya §E1](2026-07-26-admin-campaigns-product-voice-design.md)  | `CampaignDelivery`, dondurulmuş alıcı listesi, idempotent yeniden deneme, onay akışı  | B1                    |
| **A**  | [Telemetri omurgası](2026-07-26-admin-telemetry-backbone-design.md) | Ölçüm (adım 0), platform + `appVersion` boyutu, `ClientAttribution`, kesim politikası | yok                   |
| **B2** | [Panel kabuğu §1-3](2026-07-26-admin-panel-shell-design.md)         | Gerçek rotalar, snapshot bölünmesi, sol navigasyon, anchor shim                       | B1                    |
| **D1** | [Moderasyon §D1](2026-07-26-admin-moderation-design.md)             | Profil-raporu kuyruğu, vaka modeli, üstlenme, aksiyon, audit `ipHash` düzeltmesi      | B1, B2                |
| **C1** | [Sağlık §C1](2026-07-26-admin-platform-health-analytics-design.md)  | İstemci sağlık olayları: ingest + ekran                                               | B2                    |
| **C2** | [Sağlık §C2](2026-07-26-admin-platform-health-analytics-design.md)  | Feature flag + kill-switch                                                            | B2                    |
| **C3** | [Sağlık §C3](2026-07-26-admin-platform-health-analytics-design.md)  | Push telemetrisi (Expo ticket)                                                        | yok                   |
| **C4** | [Sağlık §C4](2026-07-26-admin-platform-health-analytics-design.md)  | Platform serileri, kohort, kısıtlı funnel                                             | A, B2                 |
| **E2** | [Kampanya §E2](2026-07-26-admin-campaigns-product-voice-design.md)  | Zamanlama, teslimat raporu                                                            | E1                    |
| **E3** | [Kampanya §E3](2026-07-26-admin-campaigns-product-voice-design.md)  | Geri bildirim kümeleme, sürüm ilişkisi                                                | B2                    |
| **D2** | [Moderasyon §D2](2026-07-26-admin-moderation-design.md)             | Rapor sözleşmesi genişletmesi, delil snapshot'ı, itiraz                               | D1 + istemci deploy'u |
| **F**  | [Desktop + mobil](2026-07-26-admin-desktop-mobile-design.md)        | `requireMobileAdminCapability`, desktop konsol penceresi, mobil vaka refakatçisi      | B1, D1                |

## Sıralama

```
B1 ──┬──► E1
     ├──► B2 ──┬──► D1 ──┬──► D2
     │         │         └──► F
     │         ├──► C1
     │         ├──► C2
     │         ├──► E3
     │         └──► C4 ◄── A
     └──────────────────► (C3 bağımsız)

A ── bağımsız başlar, C4'ü besler
E1 ──► E2
```

**Neden B1 ve E1 önce:** ikisi de yeni özellik değil, bugün üretimde olan hata.
Biri yetki açığı (`ANALYST` tüm aktivite CSV'sini indirebiliyor), diğeri
kullanıcıya tekrarlı bildirim gönderiyor. Tasarım turunun ürünü olmayan,
tasarım turunda **bulunan** hatalar.

**Neden A erken ama bloklamıyor:** tek geri dönüşsüz iş. Bugün toplanmayan
platform verisi yarın geriye dönük üretilemez. Ama yalnızca C4 ona bağımlı, o
yüzden paralel koşabilir.

**Neden B2 çoğu şeyin ön koşulu:** C, D, E ekranlarının hepsi B2'nin rota
iskeletine oturur. B2 geç kalırsa her faz kendi kabuğunu uydurur.

## Alt projeler arası bağlayıcı kararlar

- **Tek capability haritası** (`lib/admin/capabilities.ts`, B1). Navigasyon
  görünürlüğü, sayfa koruması, web API yetkisi ve mobil API yetkisi aynı
  haritadan türer. Ayrı liste tutulmaz.
- **İki auth yolu, tek harita** (B1 + F). Web çerez, mobil Bearer; yetki kuralı
  ortak, oturum çözümü ayrı.
- **`UNKNOWN` ayrı seri** (A → C4). Kesimden önceki veri platformsuz; `WEB`'e
  katlanmaz. `attributionVerified = false` satırlar da `UNKNOWN` sayılır.
- **Zorunlu `ClientAttribution`** (A). Metrik yazan her yol tipi zorunlu
  parametre olarak alır; `UNKNOWN` yazmak açık bir sabitle yapılır.
- **`CampaignDelivery` tek gerçek kaynak** (E1). `sentCount`/`failedCount`
  ondan türetilir; elle artırılmaz. Push eklenirse C3'ün
  `PushDeliveryAttempt` tablosuyla `campaignId` üzerinden eşleşir.
- **Delil silinir, karar kalır** (D). `evidencePurgeAt` yalnızca
  `ModerationEvidence` satırlarını siler; vaka ve olayları kalıcı.
- **Ban `setAdminUserBanState` üzerinden** (D1). Mevcut fonksiyon oturum iptali
  ve kendini banlama korumasını zaten yapıyor; yeniden yazılmaz.
- **"Expo kabul" ≠ "teslim"** (C3). Ekran etiketi ticket aşamasını söyler;
  receipt korelasyonu v2.
- **Yüksek riskli işlemler yalnızca web'de** (F). Toplu ban, dışa aktarma,
  politika düzenleme, feature flag değişimi, kampanya onayı mobile ve ikincil
  pencereye gelmez.

## Bilinçli ertelemeler

Önerilen ama ilk turda kapsam dışı bırakılanlar ve sebepleri:

- **Komut paleti + varlık arama + tema token codegen'i** (B). B'nin v1 kapsamı
  gerçek rotalar + yetki politikasına indirildi.
- **AutoMod** — otomatik kuralın ürettiği sinyali koyacak kuyruk D1'den önce
  yok. Önce kuyruk, sonra kural.
- **Sessiz saatler** (E) — `UserSettings.timeZone` kolonu yok; ülke kodundan
  tahmin doğrulanamaz. Timezone kolonu ayrı iş.
- **Geri alma / recall** (E) — kaldırıldı. Push geri alınamaz; `Notification`
  silmek açılma oranını ve frekans limitini bozar. Yerine gönderim öncesi iptal.
- **A/B test** — C2'nin feature flag altyapısı geldiğinde daha ucuz.
- **Expo receipt korelasyonu** (C3 v2) — ayrı kuyruk, ayrı hata kümesi.
- **Kayıt olayına platform eklemek** (C4) — `User` modeline yeni kolon +
  kayıt akışı değişikliği; ayrı spec.
- **Öneri motoru** — sinyaller C'de toplanıyor; üretim ayrı iş.
- **Kiracı izolasyonu ve PII maskeleme** — hedef kullanıcı platform ekibi.
