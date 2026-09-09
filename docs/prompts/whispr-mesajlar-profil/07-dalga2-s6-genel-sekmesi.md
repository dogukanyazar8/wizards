# Dalga 2 · Ş6 — Genel sekmesi (DM + grup)

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti. Ş5'in tint yardımcısı ve panel yuvası sözleşmesi
> (`raporlar/06-rapor.md`) okunur; hazır değilse şerit kendi tarafını sözleşmeye göre yazar.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15.3'ün altı bölümünü yaz. Bu sekme panelin varsayılan
sekmesidir; `screens/15` (DM üst), `screens/16` (DM kaydırılmış), `screens/19` (grup) birebir
karşılığıdır.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (K6, K7, K10) ve
`SPEC-MESAJLAR.md` §15.3. Ölçüler `Mesajlar.dc.html` `L1017–L1110`.

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/profile-tab-general.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-badge-grid.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-relationship-card.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-mutual-lists.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-pinned-list.tsx` (yeni) + `.test.tsx`

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, Ş5/Ş7/Ş8 dosyaları,
`apps/mobile/**`.

## Bölümler — sıra bağlayıcıdır

### 1. `HAKKINDA` (grupta `GRUP AÇIKLAMASI`)

Bölüm etiketi 600 10.5 display, `letter-spacing:.15em`, uppercase, muted. Gövde 13/1.6.
DM kaynağı `User.bio`, grup kaynağı `DMConversation.description`. **Boşsa bölüm hiç çizilmez** —
boş bir başlık bırakılmaz.

### 2. `ROZETLER` + `{kazanılan} / {toplam}` — yalnız DM

2 kolon grid, gap 6. Kart: padding `9 10`, radius 11, `--surface-card`, `1px --border/0.7`;
26×26 radius 8 ikon karosu `--primary/0.14` + `--primary` 13px çizgi ikon; etiket 600 11.5 body,
tek satır ellipsis; `title` kazanım açıklamasıdır.

**K10 bağlayıcı:** kart Ayarlar ekranının rozet kartıdır. Yeni bir rozet kartı **yazma** —
mevcut bileşeni bul, 26px/11.5 varyantını ekle (varyant yoksa prop'la aç), `ProfileBadgeGrid`
yalnız ızgara sarmalayıcısı olsun. Payda `BADGE_IDS.length` üzerinden okunur, `16` sabiti
yazılmaz (tuzak 11). Profilde **yalnız kazanılanlar** listelenir.

SPEC'in altı örneği ile katalog eşlemesi: `Doğrulanmış`→`verified`, `Erken üye`→`earlyMember`,
`Davetçi`→`inviter`, `Fikir sahibi`→`ideaShipped`, `Katkıcı`→`contributor`,
`Sesli sohbetçi`→`voice`. Metinler Ş0.4'ün anahtarlarından gelir.

Erişilebilirlik: `title` tek başına yetmez — ekran okuyucu için açıklama `aria-describedby` ya da
`sr-only` metinle de verilir (kural 6).

### 3. Tarih kartı — **rozetlerin altında**

Radius 14, `--surface-card`, `1px --border/0.6`, padding 12; 32×32 radius 11 `--primary/0.14`
takvim ikonu.

- DM: `{tarih} tarihinden beri arkadaşsınız` + `{sunucu} üzerinden tanıştınız · {süre}`.
  K7: arkadaş değilse **kart çizilmez**. K6: ortak sunucu yoksa ikinci cümle düşer, ilki kalır.
- Grup: `{tarih} tarihinde kuruldu` + `Kurucu: {ad} · {süre}`.

Tarih ve süre biçimlendirmesi istemcide, kullanıcının `locale` / `dateFormat` tercihine saygıyla
yapılır — sabit `14 Şubat 2025` dizesi gömülmez. Süre (`1 yıl 6 ay`) i18n çoğul kurallarıyla
üretilir.

SPEC ekranında bu kart rozetlerin **altında** duruyor ve bu ayrıca kabul kriteri — sırayı bozma.

### 4. `ORTAK SUNUCULAR` {n} — yalnız DM

28×28 radius 9 tile + ad + sağda çevrimiçi sayısı. Satır gerçek `button`/`a` ve sunucuya
götürür. Boşsa bölüm çizilmez.

### 5. `ORTAK ARKADAŞLAR` {n} — yalnız DM

28px **renkli** daire karo (kişi tinti, Ş5'in yardımcısı) + 9px presence noktası + ad.
Satır o kişinin profil paneline / DM'ine götürür. Boşsa bölüm çizilmez.
Uç bir fazla kayıt döndürüyorsa (Ş1) fazlası `ve {n} kişi daha` satırına dönüşür.

### 6. `SABİTLENEN MESAJLAR` — yalnız grup

İki kart: warning pin ikonu + yazar/tarih + alıntı. Kart tıklanınca mesaja gider
(mevcut sabitlenen mesaj yolu neyse o kullanılır, yeni gezinme icat edilmez).
Sabitlenen yoksa bölüm çizilmez.

## Ortak davranış

- Her bölüm kendi `Skeleton` bileşenini gösterir; biri geciktiğinde diğerleri **beklemez**
  (kural 7).
- Hata hâlinde bölüm tek satır muted metinle sessizce düşer, panelin tamamı çökmez.
- Bölüm etiketleri tek stilden gelir — altı yerde ayrı ayrı yazılmaz, küçük bir
  `ProfileSectionLabel` iç bileşeni yeter.

## Test

- Bio boşken `HAKKINDA` çizilmiyor.
- Rozet sayacı payda katalog uzunluğunu okuyor; katalog uzunluğu değişince metin değişiyor.
- Rozet kartı Ayarlar bileşeni ile aynı bileşen (import kimliği testi).
- Arkadaş değilken tarih kartı çizilmiyor; ortak sunucu yokken ikinci cümle düşüyor.
- Tarih kartı rozet ızgarasının **sonrasında** render ediliyor (DOM sırası testi).
- Ortak arkadaş karosu renkli tint alıyor.
- Grupta rozet ve ortak listeler yok; sabitlenenler var.
- Bir bölümün sorgusu hata verince kalanı çiziliyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/07-rapor.md` — Ayarlar rozet kartına eklenen varyantın adı, süre metninin çoğul
kuralı, boş bölümlerin listesi.
