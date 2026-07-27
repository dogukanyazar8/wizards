# Whispr Admin Paneli — Tasarım Brief'i

> **GEÇERSİZ (2026-07-27):** Tasarım üretildi ve teslim alındı —
> `design_handoff/design_handoff_admin_panel/`. Görsel otorite artık
> [G spec'i](2026-07-27-admin-design-handoff-implementation.md). Bu brief'in
> §8 veri kuralları G §4'te yaşıyor; belge tarihsel referans olarak duruyor.

**Tarih:** 2026-07-27
**Kime:** görsel tasarımı üretecek tasarım aracı / tasarımcı
**Neden var:** bu belge olmadan üretilen tasarım, jenerik bir admin dashboard
olur ve Whispr'ın veri gerçekleriyle çelişir. Aşağıdaki kısıtların hepsi kodda
doğrulandı.

---

## 0. Bir cümlede

Whispr'ın mevcut admin paneli tek sayfalık bir istatistik ekranı; onu
**rol-temelli bir operasyon merkezine** dönüştürüyoruz. Tasarım, uygulamanın
zaten var olan tasarım sistemini kullanmalı — yeni bir görsel dil icat
edilmeyecek.

---

## 1. Ürün ve kullanıcı

**Whispr** — sunucu/kanal yapısı, direkt mesaj, sesli ve görüntülü sohbet,
ekran paylaşımı içeren bir topluluk uygulaması. Üç istemci: web (Next.js),
masaüstü (Tauri kabuğu, web'i yüklüyor), mobil (React Native).

**Panelin kullanıcısı:** platform operasyon ekibi. Küçük, tam yetkili, günde
birkaç kez giren. Sunucu sahipleri veya son kullanıcılar **değil**.

**Günlük iş:** rapor kuyruğunu boşaltmak, platform sağlığına bakmak, kampanya
göndermek, geri bildirim okumak. Yani panel bir rapor aracı değil, bir **iş
yüzeyi** — kullanıcı ekrana bakmaya değil, ekranda iş bitirmeye geliyor.

**Tonu:** sakin, yoğun, güven veren. Kutlama yok, gradient patlaması yok. Bir
kararın yanlış verilmesi gerçek bir kullanıcıyı etkiliyor.

---

## 2. Zorunlu kısıtlar — uyulmazsa tasarım uygulanamaz

### 2.1. Otuz iki tema var

Uygulama `<html>` üzerindeki sınıfla tema değiştiriyor ve **32 tema sınıfı**
tanımlı:

```
theme-light  theme-dawn  theme-mist  theme-studio  theme-cream-yellow
theme-warm-beige  theme-soft-pink  theme-dusty-rose  theme-sage-green
theme-mint-green  theme-peach-orange  theme-lavender  theme-sky-blue
theme-royal-blue  theme-purple-teal  theme-green-rainbow
theme-blue-purple-gradient  theme-deep-purple-gradient  theme-midnight-navy
theme-ash  theme-graphite  theme-dark  theme-onyx  theme-midnight
theme-slate-dark  theme-amber-dark  theme-crimson-dark  theme-forest-dark
theme-khaki-dark  theme-mauve-dark  theme-ocean-dark  theme-teal-dark
```

**Sonuç: tasarımda sabit renk kullanılamaz.** Hex yok, "marka moru" yok,
tasarımın kendi paleti yok. Her renk bir token üzerinden gelmeli.

Yeni bir anlamsal renk önerilirse, o rengin **32 temada birer değeri** olması
gerekir — yani yeni token önermek ucuz değil. Önce mevcut token'larla
çözülmeye çalışılmalı.

### 2.2. Token sistemi

Token'lar **çıplak HSL üçlüsü** olarak saklanıyor, her zaman `hsl(var(--token))`
biçiminde kullanılıyor — asla düz `var()` rengi olarak değil.

Ana aileler:

| Aile          | Token'lar                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zemin / metin | `--background`, `--foreground`, `--card`, `--card-foreground`                                                                                                                    |
| Yüzeyler      | `--surface-primary`, `--surface-secondary`, `--surface-tertiary`, `--surface-soft`, `--surface-panel`, `--surface-rail`, `--surface-overlay`, `--surface-base`, `--surface-card` |
| Vurgu         | `--primary`, `--primary-foreground`, `--ambient-1`, `--ambient-2`                                                                                                                |
| Anlamsal      | `--danger` / `--danger-foreground` / `--danger-soft`, `--success` / `--success-foreground` / `--success-soft`, `--warning` / `--warning-foreground` / `--warning-soft`           |
| Kenar / girdi | `--border`, `--input`, `--ring`                                                                                                                                                  |
| Metin tonları | `--text-primary`, `--text-secondary`, `--text-soft`, `--text-muted`                                                                                                              |
| Diğer         | `--backdrop`, `--shadow-color`, `--desktop-titlebar-height`                                                                                                                      |

Tailwind v3 kullanılıyor. Bazı token'lar hazır utility olarak var
(`bg-background`, `text-foreground`, `bg-card`, `bg-primary`, `border-border`,
`ring-ring`); geri kalanı arbitrary value ile:
`bg-[hsl(var(--surface-primary))]`, `border-[hsl(var(--border)/0.7)]`,
`text-[hsl(var(--text-soft))]`.

### 2.3. Tipografi

| Değişken           | Font              | Kullanım                                       |
| ------------------ | ----------------- | ---------------------------------------------- |
| `--font-sans`      | Plus Jakarta Sans | Gövde metni                                    |
| `--font-display`   | Space Grotesk     | Başlıklar                                      |
| `--font-auth-body` | DM Sans           | Yalnızca auth ekranları — admin'de kullanılmaz |

Yeni font eklenmeyecek.

### 2.4. Mevcut şekil dili

- Kartlar ve kontroller: `rounded-2xl`
- Pill ve avatar: `rounded-full`
- İlişkili öğeler arası: `gap-3` / `gap-4`
- Kart içi padding: `p-4`

Admin tabloları bu dili **daha sıkı** bir ölçekte tekrar etmeli (bkz. §3),
ama şekil dilini değiştirmemeli.

### 2.5. Zaten var olan bileşenler — yeniden tasarlanmayacak, kullanılacak

`avatar`, `badge`, `button`, `context-menu`, `input`, `modal`, `skeleton`,
`textarea`.

Tasarım bunları temel alsın. Yeni bileşen gerekiyorsa (tablo satırı, filtre
çubuğu, metrik kartı, zaman çizelgesi satırı) bu setin üstüne kurulsun.

### 2.6. Grafik kütüphanesi YOK

Bu önemli ve şaşırtıcı: projede Recharts, Chart.js, visx, D3 — hiçbiri yok.
Mevcut tek grafik elle yazılmış `div`'ler ve CSS gradient'i; ekseni,
ızgarası, tooltip'i yok (tooltip yerine `title` attribute'u).

**Tasarımcıdan istenen:** grafik önerileri ya (a) sade, elle uygulanabilir
biçimlerle sınırlı kalmalı (bar, sparkline, yığılmış bar, ısı şeridi), ya da
(b) kütüphane gerektirdiği açıkça işaretlenmeli ki karar bilinçli verilsin.

Çok serili çizgi grafiği, eksen etiketleri, interaktif legend, brush/zoom —
hepsi kütüphane demek.

**Seri renkleri** de token'dan gelmeli: `--primary`, `--ambient-1`,
`--ambient-2`, `--success`, `--warning`, `--danger`. Bu altı renk 32 temada
birbirinden ayırt edilebilir olmayabilir — tasarım seri ayrımını yalnızca
renge yaslamamalı (desen, kalınlık, doğrudan etiket).

---

## 3. Yoğunluk

Mobil uygulamanın dokunma hedefi 44px. **Admin paneli masaüstü aracıdır**;
aynı ölçeği kullanmak her tabloyu üçte bir daha az satır gösterir hale getirir.

Hedef ölçek:

```
--admin-row-height: 34px
--admin-control-height: 32px
--admin-row-gap: 4px
--admin-section-gap: 20px
```

Renk paylaşılır, boşluk paylaşılmaz. Tasarım "rahat" ve "yoğun" iki mod
sunabilir; varsayılan yoğun olmalı.

---

## 4. Bugünkü panel — neyi değiştiriyoruz

Mevcut hali: tek sayfa, sekiz bölüm anchor bağlantısıyla (`#overview`,
`#users`, `#activity`, `#servers`, `#management`, `#feedback`,
`#notifications`, `#audit`). Sol tarafta bir nav var ama gerçek rota değil.
Tüm veriler tek istekte geliyor. Beş rolün hepsi aynı ekranı görüyor.

Hedef: gerçek rotalar, kalıcı sol navigasyon, bölüm başına yükleme durumu,
role göre değişen navigasyon.

---

## 5. Tasarlanacak ekranlar

Fazlara göre; hepsi aynı kabuğa oturuyor.

### Kabuk (her ekranda)

Sol navigasyon (rol'e göre değişen bölüm listesi), üst bar (tarih aralığı
seçici, kullanıcı menüsü), içerik alanı.

### 5.1. Komuta merkezi — `/admin`

Genel metrikler, kullanım eğilimi, günün öncelikleri (bekleyen vaka sayısı,
gönderilmeyi bekleyen kampanya, sağlık uyarısı).

### 5.2. Kullanıcılar — `/admin/users`

Filtrelenebilir tablo: durum, doğrulanmış, banlı, arama. Satırdan kullanıcı
detayına gidiş. Ban/ban kaldırma aksiyonu (neden zorunlu).

### 5.3. Sunucular — `/admin/servers`

Sunucu tablosu, en aktif sunucular ve kanallar.

### 5.4. Aktivite — `/admin/activity`

Canlı oturumlar tablosu (kullanıcı, platform, cihaz, tarayıcı, OS, ülke,
süre). İstemci/cihaz/ülke kırılımları.

### 5.5. Platform sağlık — `/admin/health`

**Üç platform yan yana** (web / desktop / mobil), her biri için: aktif oturum,
açılış süresi p50/p95, crash oranı, hata sıklığı, Expo kabul oranı, sürüm
dağılımı.

### 5.6. Analitik — `/admin/analytics`

Platform filtreli zaman serileri, kohort/retention tablosu, dört adımlı funnel.

### 5.7. Feature flags — `/admin/flags`

Bayrak listesi: aç/kapa, platform kısıtı, yüzde dağıtım, son değiştiren.
Kapatma tek tık; açma onay ister.

### 5.8. Moderasyon kuyruğu — `/admin/moderation`

Vaka tablosu: vaka no (`MOD-{n}`), konu kullanıcısı, durum, öncelik, rapor
sayısı, atanan, yaş. Filtreler. "Üstlen" aksiyonu.

### 5.9. Vaka dosyası — `/admin/moderation/[caseId]`

Tek kronolojik zaman çizelgesi: raporlar, operatör notları, alınan aksiyonlar,
durum değişiklikleri, (sonraki fazda) delil kartları ve itiraz.
Yan panelde konu kullanıcısının bağlamı.
Aksiyonlar: uyar, banla, reddet — hepsinde karar nedeni zorunlu.

### 5.10. Bildirim kampanyaları — `/admin/notifications`

Kampanya listesi (durum rozetli), kompozitör (başlık, gövde, görsel, aksiyon
bağlantısı, hedef kitle seçici, önizleme), kampanya detay/teslimat raporu.

### 5.11. Geri bildirim ve yol haritası — `/admin/feedback`

Geri bildirim listesi (`WSP-{n}`, konu, durum, puan, ekler), küme önerileri,
yol haritası maddeleri ve oylar.

### 5.12. Audit — `/admin/audit`

Filtrelenebilir kayıt tablosu: aktör, aksiyon, hedef, neden, IP/cihaz bağlamı,
zaman. Dışa aktarma.

---

## 6. Ekran arketipleri

On iki ekran dört kalıba indirgenmeli — her ekranı ayrı tasarlamak yerine dört
kalıp tasarlanıp uygulanmalı:

1. **Liste/tablo ekranı** — filtre çubuğu + yoğun tablo + sayfalama + satır
   aksiyonu. (Kullanıcılar, sunucular, aktivite, moderasyon, audit, kampanya
   listesi, geri bildirim)
2. **Detay/zaman çizelgesi ekranı** — başlık + durum + yan bağlam paneli +
   kronolojik akış + aksiyon çubuğu. (Vaka dosyası, kampanya detayı,
   kullanıcı detayı)
3. **Metrik ekranı** — kart ızgarası + zaman serisi + kırılım listeleri +
   aralık seçici. (Komuta merkezi, sağlık, analitik)
4. **Kompozitör/form ekranı** — form + canlı önizleme + tehlike onayı.
   (Kampanya kompozitörü, feature flag düzenleme)

---

## 7. Zorunlu durumlar

Her arketip için tasarlanmalı — bunlar "sonra düşünürüz" değil, panelin
günlük gerçeği:

- **Boş** — hiç veri yok (kuyruk temiz, kampanya yok). Boş kuyruk **iyi
  haberdir**, hata gibi görünmemeli.
- **Yükleniyor** — mevcut `skeleton` bileşeniyle. Kabuk ayakta kalır, yalnızca
  içerik alanı yüklenir.
- **Hata** — veri gelmedi, yeniden dene.
- **Yetkisiz** — rol bu bölümü göremez. Navigasyonda zaten gizli, ama URL elle
  yazılırsa görünecek ekran.
- **Kısmi/güvenilmez veri** — §8'deki kurallar. Bu en çok atlanan ve bizde en
  çok geçen durum.

---

## 8. Veriden gelen tasarım kuralları

Bunlar keyfi değil; her biri kodda doğrulanmış bir gerçeğin sonucu. Tasarım
bunları görmezden gelirse ekran yanlış bilgi verir.

**8.1. `UNKNOWN` platform ayrı bir seridir.**
Belirli bir tarihten önceki veri platform bilgisi olmadan kaydedildi. Bu veri
`WEB`'e katlanamaz — katlanırsa geçiş tarihinde sahte bir platform kayması
okunur. Grafiklerde `UNKNOWN` ayrı seri, ve grafiğin altında bunun neden
olduğunu söyleyen kalıcı bir not gerekiyor. Tasarım bu notun yerini ve tonunu
çözmeli.

**8.2. "Expo kabul" ≠ "cihaza teslim".**
Push sağlayıcısı Expo; gönderim isteğinin kabul edilmesi bildirimin cihaza
ulaştığı anlamına gelmiyor. Ekranlarda **"teslim edildi" ifadesi
kullanılamaz**. Etiket "Expo kabul oranı" olmalı ve farkı açıklayan bir ipucu
taşımalı.

**8.3. Vakaların delili olmayabilir.**
İlk fazda raporlar yalnızca "kim, hangi sebeple" bilgisini taşıyor — mesaj
veya ek bağlamı yok. Vaka dosyası tasarımı delil kartlarının **olmadığı**
durumu birinci sınıf göstermeli; delil kartı sonraki fazda geliyor. Geçmişten
taşınan vakalar "delil kaydı yok" etiketiyle görünmeli.

**8.4. Konu kullanıcısı silinmiş olabilir.**
Vaka, hakkındaki kişi hesabını sildikten sonra da yaşamaya devam ediyor.
Tasarım "hesap silinmiş" durumunu göstermeli: avatar yerine ne konur, kullanıcı
adı nasıl gösterilir (silinmiş hesabın kullanıcı adının kopyası saklanıyor).

**8.5. Kampanya raporu üç ayrı sayı gösterir.**
"Hedeflenen", "gönderilen" ve "frekans limitine takıldığı için atlanan".
Atlananlar gizlenmemeli — aksi halde kampanyanın kapsamı yanlış okunur.

**8.6. Funnel'ın ilk iki adımı platforma göre kırılamaz.**
Kayıt ve e-posta doğrulama adımları hangi istemciden geldiğini kaydetmiyor.
Platform filtresi uygulandığında bu iki adım toplam değeri göstermeye devam
eder. Tasarım bunu görsel olarak ayırt etmeli — kullanıcı filtrenin bu
adımlara işlemediğini anlamalı.

**8.7. Rol, navigasyonu değiştirir.**
Beş rol var: `OWNER`, `ADMIN`, `SUPPORT`, `ANALYST`, `MODERATOR`. `ANALYST`
audit'i, kampanyaları ve moderasyonu göremez. Sol navigasyon role göre
kısalır. Tasarım en dolu ve en boş navigasyonu birlikte göstermeli — üç
maddelik nav ile on iki maddelik nav aynı kabukta iyi durmalı.

**8.8. Gönderilmiş push geri alınamaz.**
Kampanya "geri al" özelliği yok ve olmayacak. Tasarım geri alma yanılsaması
üretmemeli; onun yerine **gönderim öncesi iptal** akışı belirgin olmalı.

**8.9. Tehlikeli aksiyonlar neden ister.**
Ban, uyarı, kampanya gönderimi, bayrak değişimi — hepsinde serbest metin
gerekçe zorunlu ve audit'e yazılıyor. Bu, tasarımda "onayla" modalinin
standart bir parçası olmalı, ek bir adım gibi değil.

---

## 9. Üç yüz

| Yüzey              | Kapsam                                           | Tasarım notu                                                                                                                                                                           |
| ------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Web**            | Tam panel, on iki ekran                          | Ana tasarım                                                                                                                                                                            |
| **Desktop konsol** | Aynı web rotası, kompakt modda ikincil pencerede | Sol navigasyon gizli, satır yoğunluğu daha da artmış, dar pencerede (≈420-600px) çalışan moderasyon kuyruğu                                                                            |
| **Mobil**          | Yalnızca vaka listesi + vaka detayı              | Dikey akış, yan panel yok, **üç aksiyon**: üstlen, reddet, web'e yükselt. Ban ve toplu işlem yok. Mobil uygulamanın kendi tasarım dili var; bu ekranlar ona uymalı, web paneline değil |

---

## 10. Tasarlanmayacaklar

Bunlar bilinçli olarak kapsam dışı — tasarlanırsa boşa emek olur:

Komut paleti (`Ctrl/Cmd+K`), global varlık arama, AutoMod kural editörü,
A/B test arayüzü, sessiz saat ayarları, kampanya geri alma, sunucu sahibi
paneli, PII maskeleme arayüzü, iOS'a özgü ekranlar.

---

## 11. Referans alınabilecek ürünler

Kopyalanacak değil, belirli bir problemi nasıl çözdüklerine bakılacak:

| Ürün             | Ne için                                                     |
| ---------------- | ----------------------------------------------------------- |
| Linear           | Yoğun liste, klavye odaklı gezinme, sakin ton               |
| Stripe Dashboard | Tablo dili, sayı biçimlendirme, filtre çubuğu               |
| Slack admin      | Audit kaydı filtreleme ve dışa aktarma                      |
| Discord AutoMod  | Kural / istisna / aksiyon üçlüsünün gösterimi (sonraki faz) |
| Teams analytics  | Aynı metriğin farklı kapsamlarda sunulması                  |
| Vercel           | Dağıtım/durum rozetleri, boş durumlar                       |

---

## 12. İstenen teslimat

1. **Dört arketip** tasarımı (§6), her biri için beş durum (§7).
2. **On iki ekranın** arketiplere uygulanmış hali (§5).
3. **Bileşen envanteri**: mevcut sekiz bileşenin üstüne eklenen yeni
   bileşenler ve her birinin varyantları/durumları.
4. **Yeni token önerisi** varsa, gerekçesiyle ve 32 temada nasıl
   karşılanacağına dair not.
5. **Grafik önerileri**, hangilerinin kütüphane gerektirdiği işaretlenmiş.
6. **Yoğunluk ölçeği** doğrulaması: 34px satırda okunabilirlik.
7. **Açık ve koyu** bir temada tam ekran gösterimi (`theme-light` ve
   `theme-dark` yeterli; kalan 30 tema token'lardan türeyecek).
8. **Kabuk davranışı**: üç maddelik ve on iki maddelik navigasyon, ikisi de.

---

## 13. Bağlam dosyaları

Tasarım aracına verilebilecek ek kaynaklar:

- `.design-sync/conventions.md` — tasarım sistemi kullanım kuralları
- `apps/web/src/app/globals.css` — token ve tema tanımları
- `apps/web/src/components/admin/admin-dashboard.tsx` — bugünkü panel
- `docs/superpowers/specs/2026-07-26-admin-redesign-index.md` — alt proje
  haritası ve hangi ekranın hangi fazda geldiği
