# Admin Görsel Uygulama — Design Handoff (Alt Proje G)

**Tarih:** 2026-07-27
**Dal:** uat
**Durum:** Tasarım kaynağı teslim alındı; uygulama kuralları bu spec'te
**Rol:** faz değil, **bağlayıcı tasarım otoritesi**. B2'den itibaren UI üreten
her faz (B2, C1, C2, C4, D1, E1-E3) ekranlarını bu spec'in kurallarıyla inşa
eder.

## Tasarım kaynağı

`design_handoff/design_handoff_admin_panel/` içinde:

| Dosya                            | Rol                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Whispr Admin.dc.html`           | **Tam kaynak** — tüm ölçüler, token'lar, metinler inline. Şüphede kalınca esas alınacak dosya    |
| `Whispr Admin (standalone).html` | Tek dosyalık çevrimdışı önizleme (tarayıcıda açılır, 10 sekme + tema seçici çalışır)             |
| `README.md`                      | Eksiksiz yazılı spesifikasyon: kabuk, bileşen desenleri, 10 ekran, etkileşimler, token değerleri |
| `PROMPT.md`                      | Uygulama prompt'u                                                                                |
| `screenshots/`                   | 12 ekran görüntüsü                                                                               |

**Doğrulandı:** kaynak README ile tutarlı (250px rail, 6 temalık seçici, 10
modül kimliği: `overview` `users` `servers` `mod` `content` `audit` `voice`
`notif` `system` `settings`). Tasarım mevcut Whispr token sistemini kullanıyor
— 6 tema da (`theme-light`, `theme-lavender`, `theme-dark`, `theme-graphite`,
`theme-midnight`, `theme-ocean-dark`) `globals.css`'teki 32 tema sınıfının alt
kümesi. Tipografi mevcut fontlar (Plus Jakarta Sans + Space Grotesk). Sabit
renk yalnızca avatar/sunucu gradient'lerinde (kasıtlı). Grafiklerin tamamı
bar/progress — **kütüphanesiz uygulanabilir**, mevcut `UsageChart` deseniyle
aynı teknik.

## Bağlayıcı kural

> **Tasarım birebir bu kaynaktan; içerik spec'lerden.**
> Görsel dil (yerleşim, ölçü, renk kullanımı, bileşen biçimleri, durumlar)
> pazarlıksız handoff'tan gelir. Ekranların **veri içeriği** A-F spec'lerinin
> doğruladığı gerçeklere uyarlanır. Çelişkide: görsel konularda handoff
> kazanır, veri/davranış konularında spec kazanır. Bu spec her çelişkiyi tek
> tek karara bağlıyor (§3).

HTML dosyaları kopyalanmaz; tasarım React/Next.js + Tailwind + mevcut bileşen
kütüphanesiyle piksel hassasiyetinde yeniden üretilir (PROMPT.md görev 1).

## 1. Ortak kit — B2'de bir kez inşa edilir

README "Ortak Bileşen Desenleri" bölümündeki ölçülerle, `components/admin/`
altına. Sonraki tüm fazlar bunları kullanır, kendi varyantını üretmez:

| Bileşen           | Kaynak ölçü (README)                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AdminShell`      | 250px sabit rail (`--surface-rail`, sağ kenar `border/0.6`), 62px üst bar (`--surface-panel`), içerik `max-width:1360px`, padding `26px 28px 40px`                                   |
| Nav öğesi         | `9px 12px`, radius 12, `600 13.5px`, 17px stroke SVG; aktif `primary/0.12` zemin + primary metin; grup başlığı `10.5px/700 uppercase tracking .09em`                                 |
| `AdminPageHeader` | Space Grotesk `26px/700 tracking -0.02em` + 13px muted alt satır                                                                                                                     |
| `AdminKpiCard`    | etiket `12.5px/600 muted` + değişim pill'i; değer Space Grotesk `30px/700`; 12px açıklama                                                                                            |
| `AdminMiniStat`   | etiket 12px + değer 21px Space Grotesk                                                                                                                                               |
| `AdminPill`       | `700 11.5px`, `3px 9px`, radius 999; anlam: success=aktif/onay, warning=beklemede, danger=yasak/yüksek, primary %12=bilgi/rol, surface-soft=nötr                                     |
| `AdminGridTable`  | kart içi CSS grid; başlık `11px/700 uppercase tracking .06em` + `surface-secondary` zemin; satır `11px 16px` padding, üst çizgi `border/0.45`, hover `surface-secondary`, 13px metin |
| Birincil buton    | primary zemin, radius 12, `700 13px`, `9px 16px`, `0 8px 22px primary/0.28` gölge                                                                                                    |
| Chip              | çerçeveli şeffaf; seçili: primary zemin                                                                                                                                              |
| Toggle            | 42×24 pill, 18px knob, 0.2s                                                                                                                                                          |
| Bar grafik        | elle: gradient `primary → ambient-2`, radius 7, bar max 34px                                                                                                                         |
| Progress bar      | 7px, gradient dolgu                                                                                                                                                                  |
| Pulse nokta       | `@keyframes wpulse` 2-2.4s                                                                                                                                                           |

Kart: `--card` zemin, `border/0.7`, radius 16, padding 18-22px. (Önceki B
taslağındaki `--admin-row-height: 34px` yaklaşımı yerine README'nin satır
ölçüleri geçerli — pratikte aynı yoğunluk, kaynak artık handoff.)

Skeleton'lar: tasarımda yok; kart yapısını koruyan sade skeleton
(PROMPT.md görev 7), mevcut `skeleton` bileşeniyle.

## 2. Modül → faz haritası

Sol nav üç grup (Platform / Güven & Güvenlik / Operasyon) korunur; rozetler
gerçek veriden.

| Handoff modülü     | Rota                   | Faz                          | İçerik uyarlaması                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Genel Bakış     | `/admin`               | **B2** (+C4)                 | KPI'lar mevcut snapshot verisinden. "Platform Dağılımı" A'ya bağlı — A öncesi gizlenir, A sonrası `UNKNOWN` dördüncü bar olarak eklenir (C4 kuralı). "Rapor İndir" → mevcut `activity.csv` ucu (B1 capability: `export.activity`)                                                                                                                                                                                                                                                                                          |
| 2. Kullanıcılar    | `/admin/users`         | **B2**                       | Tablo `listAdminUsers`'tan. "Askıya alınmış" KPI'sı çıkar — üründe suspend yok (`User.isBanned` var, suspend kolonu yok); yerine "Doğrulanmamış". "Rol" kolonu topluluk rolü değil admin işlemleri bağlamında durum rozetleri. "Kullanıcı Davet Et" v1'de yok                                                                                                                                                                                                                                                              |
| 3. Sunucular       | `/admin/servers`       | **B2**                       | "Büyüme %" kolonu çıkar — sunucu düzeyi zaman serisi toplanmıyor; yerine "24s aktif" işareti. "Ortak (Partner)" rozeti yok — üründe partner kavramı yok; Doğrulanmış/Herkese açık rozetleri                                                                                                                                                                                                                                                                                                                                |
| 4. Moderasyon      | `/admin/moderation`    | **D1**                       | Rapor kartları `ModerationCase` kuyruğundan. "Oto. engellenen" KPI'sı çıkar (AutoMod yok) → yerine "Çözülen (7g)". "Ort. ilk yanıt" hesaplanabilir: `firstSeenAt - openedAt`. Kart aksiyonları D1'inkiler: Üstlen / İncele / Reddet                                                                                                                                                                                                                                                                                        |
| 5. İçerik Denetimi | —                      | **AutoMod fazı (ertelendi)** | Ekran tasarımı hazır ve saklanır; backend'i bilinçli ertelendi (D spec kararı). v1 nav'ında görünmez. AutoMod spec'i yazıldığında bu tasarım olduğu gibi kullanılır                                                                                                                                                                                                                                                                                                                                                        |
| 6. Denetim Kaydı   | `/admin/audit`         | **B2** (+D1 `ipHash`)        | "IP" kolonu ham IP gösteremez — sistemde yalnızca `ipHash` var (kasıtlı, analytics hash'i). Kolon kısaltılmış hash + cihaz gösterir. Aktör "system" satırı desteklenir (`adminUserId` null audit kayıtları)                                                                                                                                                                                                                                                                                                                |
| 7. Ses & Görüşme   | `/admin/voice`         | **C4 sonrası**               | Eşzamanlı ses `VoiceState`'ten, görüşme sayısı/ort. süre `MediaUsageSession`'dan, saatlik yoğunluk `startedAt` histogramı. **MOS ve Bölge Gecikmeleri kartları çıkar** — bu veriler hiçbir yerde toplanmıyor (LiveKit telemetri entegrasyonu ayrı iş, kapsam dışı). Yerlerine platform kırılımı kartı (A + `MediaUsageSession.clientType`)                                                                                                                                                                                 |
| 8. Bildirimler     | `/admin/notifications` | **E1/E2**                    | Kompozitör tasarımı birebir; iki içerik düzeltmesi: (a) "sessiz saatlerde push gönderilmez" metni **yazılamaz** — sessiz saat E'de v2'ye ertelendi (timezone kolonu yok); metin "tahmini erişim" ile sınırlı kalır. (b) Kanal chip'lerinden v1'de yalnızca "Uygulama içi" aktif — kampanya push/e-posta göndermiyor (E1 kararı); diğer ikisi disabled + ipucu. Onay akışı (1000+ alıcı, E1) tasarıma eklenir: Gönder butonu eşik üstünde "Onaya Gönder" olur. Geçmiş panelindeki "Açılma" gerçek (`Notification.read`, E2) |
| 9. Sistem Durumu   | `/admin/health`        | **C1**                       | Handoff'un servis-uptime kartları (SFU/CDN/DB uptime %, olay geçmişi) **v1'de uygulanamaz** — uptime izleme altyapısı yok. C1'in platform sağlık ekranı bu modülün **görsel dilini** kullanır: durum bandı, kart ızgarası, 30 günlük tick barları, gecikme notları — içerik platform başına açılış p50/p95, crash oranı, hata sıklığı, Expo kabul oranı, sürüm dağılımı. Servis uptime'ı kapsam dışı listesine                                                                                                             |
| 10. Ayarlar        | `/admin/flags`         | **C2** (+B1)                 | Sol sütun (Özellik Bayrakları + toggle + ortam rozeti) C2'ye birebir oturuyor — C2'nin modeli `clientTypes` + `rolloutPercent` taşır, rozetler oradan türer. Sağ "Roller & İzinler" → B1 capability haritasının **salt okunur** görünümü (düzenleme v2). "Tehlikeli Bölge" → §3.5                                                                                                                                                                                                                                          |

**Handoff'ta olmayan ekranlar** (analitik `/admin/analytics` C4, geri bildirim
`/admin/feedback` E3) yeni modül olarak aynı dilden türetilir: metrik ekranı
Genel Bakış arketipini, liste ekranı Kullanıcılar arketipini kullanır. Yeni
görsel desen icat edilmez.

## 3. Çelişki kararları

**3.1. Sekme değil rota.** Prototip tek sayfa, `tab` state ile geçiyor. B2
kararı geçerli: her modül gerçek rota. Görsel fark yok (aynı rail, aynı aktif
durum); davranış farkı URL + geri tuşu + bölüm başına `loading.tsx`.
README'deki "içerik anında değişir (animasyon yok)" korunur.

**3.2. Üst bar araması.** Tasarımda ⌘K rozetli arama kutusu var; B komut
paletini v2'ye erteledi. Karar: kutu v1'de **var** (tasarım birebir) ama
kapsamı modül gezinmesi — yerel eşleştirme, ağ isteği yok. Varlık arama
(kullanıcı/sunucu) v2'de aynı kutuya bağlanır. Placeholder metni v1
kapsamını yansıtır ("Modüle git…" — "Kullanıcı, sunucu, mesaj ara…" değil).

**3.3. Tema seçici.** Tasarımdaki 6 temalık dropdown uygulanır; mevcut
`ThemeProvider` + `ThemeSessionSync` kullanılır (admin layout'ta zaten var).
Kullanıcının uygulama teması 32'den başka biriyse panel yine doğru render
olur — her şey token. Elle tema rengi yazılmaz (README uyarısı).

**3.4. Rol-temelli nav ve tasarım.** Handoff tek "süper-admin" görünümü
çiziyor; B1 haritası beş rol tanıyor. Nav öğeleri capability'ye göre
gizlenir; grup başlığı, altındaki tüm öğeler gizliyse kendisi de gizlenir.
En dar rol (`ANALYST`: Genel Bakış + Aktivite/Analitik) üç öğeli nav ile de
dengeli görünmeli — rail yapısı buna izin veriyor (gruplar dikey akar).

**3.5. Tehlikeli Bölge — ertelendi.** "Tüm oturumları sonlandır" ve
"Kayıtları dondur (salt okunur mod)" iki yeni altyapı istiyor: toplu oturum
iptali kısmen var (`auth/session-revocation.ts`) ama global dondurma modu hiç
yok, ve "iki yönetici onayı" deseni yeni. E1'in onay desenine benzer ama
kapsamı ayrı. Karar: v1'de Tehlikeli Bölge kartı **render edilmez**; ayrı
mini-spec olarak ertelenir. (Tasarım kaybolmaz — kart hazır, backend'i
yazıldığında eklenir.)

**3.6. Sayı biçimi.** Türkçe biçim (1.204 · %4,2 · 4,21M) — PROMPT.md görev 5.
Mevcut `admin-format.ts` yardımcıları (B2'de ayrışıyor) Türkçe locale'e göre
güncellenir. Panel dili Türkçe; handoff kopyası birebir kullanılabilir, veri
gerçekleriyle çelişen metinler hariç (§2'deki uyarlamalar).

**3.7. Avatar gradient'leri.** Tasarım avatar/sunucu ikonlarında sabit hex
gradient çiftleri kullanıyor (`#6366f1→#38bdf8` vb.). Bu bilinçli bir istisna:
kimlik renkleri temadan bağımsız. Gerçek avatar varsa görsel gösterilir;
yoksa gradient + baş harf(ler) — id'den deterministik gradient seçimi.

## 4. Veri gerçeği düzeltmeleri — özet

Tasarımdaki şu içerikler olduğu gibi uygulanırsa **yanlış bilgi** gösterir;
uyarlamaları §2'de:

| Tasarımdaki içerik                  | Gerçek                                           |
| ----------------------------------- | ------------------------------------------------ |
| "Askıya alınmış" kullanıcı KPI'sı   | Suspend özelliği yok; ban var                    |
| Sunucu "Büyüme %"                   | Sunucu düzeyi zaman serisi toplanmıyor           |
| "Oto. engellenen 1.204"             | AutoMod yok (bilinçli ertelendi)                 |
| Audit "IP" kolonu                   | Ham IP saklanmıyor; `ipHash` var                 |
| Ses MOS + bölge gecikmeleri         | Hiçbir yerde toplanmıyor                         |
| Servis uptime kartları              | Uptime izleme altyapısı yok                      |
| "Sessiz saatlerde push gönderilmez" | Sessiz saat v2 (timezone kolonu yok)             |
| Push/E-posta kampanya kanalları     | Kampanya yalnızca uygulama içi (E1)              |
| "Platform Dağılımı" yüzdeleri       | A öncesi güvenilmez; sonrası `UNKNOWN` ayrı seri |

## 5. Test planı

Görsel sözleşme testleri — fazların kendi işlev testlerine ek:

1. **Sabit renk yasağı:** `components/admin/**` içinde hex renk literali
   yalnızca avatar-gradient sabitleri dosyasında geçebilir (lint/test
   taraması). Geri kalan her renk `hsl(var(--…))`.
2. **Kit tekliği:** admin ekranları KPI/pill/tablo bileşenlerini ortak
   kitten almalı — `components/admin/sections|screens` altında yerel pill
   tanımı testi kırar.
3. **Kabuk ölçüleri:** rail 250px, üst bar 62px, içerik max 1360px
   (snapshot/DOM testi).
4. **Tema geçişi:** 6 temanın her birinde kabuk render edilir, hardcoded
   arka plan sızıntısı yok (class değişimi + computed style örneklemi).
5. **Nav rozeti gerçek:** Moderasyon rozeti D1 sayısından; sayı 0 iken rozet
   render edilmez.
6. **Yasak metin:** bildirim kompozitöründe "sessiz saat" ifadesi geçmez;
   sağlık ekranında "teslim edildi" geçmez (C3 kuralıyla aynı desen).
7. **Türkçe sayı biçimi:** `formatNumber(4210000)` → "4,21M" benzeri;
   yüzde `%4,2`.

## 6. Sıra etkisi

G fazlara yeni sıra eklemiyor; B2'nin tanımını netleştiriyor:

- **B2 = kabuk + ortak kit + Genel Bakış/Kullanıcılar/Sunucular/Audit
  modülleri**, hepsi handoff tasarımıyla. (Önceki B2 "mevcut bölümleri yeni
  rotalara taşı" idi; artık taşıma değil, handoff tasarımına göre yeniden
  üretim.)
- Sonraki her UI fazı kendi modülünü §2 haritasından alır.
- `docs/superpowers/specs/2026-07-27-admin-design-brief.md` bu handoff ile
  **geçersizleşti** — tasarım üretilecek değil, üretildi. Brief'in veri
  kuralları (§8) yaşamaya devam ediyor; G §4 aynı kuralların handoff'a
  uygulanmış hali.

## Riskler

| Risk                                                           | Etki                     | Karşılık                                                                                                |
| -------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| "Birebir tasarım" ile "gerçek veri" çatışır                    | Ekran boş/yanlış görünür | §2 uyarlamaları önceden karara bağlandı; uygulayan faz karar vermek zorunda kalmaz                      |
| Kit'ten sapma                                                  | Ekranlar zamanla ayrışır | Test 2; kit B2'de tek seferde inşa edilir                                                               |
| Ertelenen ekranlar (İçerik Denetimi, Tehlikeli Bölge) unutulur | Tasarım israfı           | Her ikisi §2/§3.5'te faz etiketiyle park edildi; AutoMod spec'i ve mini-spec yazıldığında tasarım hazır |
| Standalone HTML'e bakıp kod kopyalanır                         | Üretim kalitesi düşer    | Bağlayıcı kural: HTML kopyalanmaz, README ölçüleriyle yeniden üretilir; şüphede `.dc.html` esas         |
