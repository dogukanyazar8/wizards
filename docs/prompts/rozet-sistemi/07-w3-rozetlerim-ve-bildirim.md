# 07 — W3: "Rozetlerim" ekranı + rozet bildirimi

Önce `00-ortak-baglam.md` ve `06-w3-rozet-detayi.md` okunur.

---

## Görev

1. Mobil "Rozetlerim" ekranı (yeni rota).
2. Web "Rozetlerim" bölümü (ayarlar içinde).
3. `NotificationType.BADGE` yazımı + yönlendirme.
4. Socket üzerinden anlık güncelleme + cache tazeleme.
5. Testler.

---

## 1. Ekran içeriği (iki platformda birebir aynı)

Kaynak: `OwnBadgesResponse` (prompt 03) — `badges` + `progress`.

- **Üst özet:** `{kazanılan}/{toplam}` (örn. `4/16`) + ince ilerleme çubuğu.
- **Kazanılanlar** bölümü: aile başlıklarına göre gruplanmış
  (Kimlik / Katkı / Aktiflik / Destek / Etkinlik), her satır 28px chip + ad +
  kademe etiketi + `{Ay Yıl}` kazanma tarihi. Satır → rozet detayı (prompt 06).
- **Henüz kazanılmadı** bölümü: aynı satır düzeni, chip `neutral` + %40 opaklık,
  sağda ilerleme metni (`63/100 gün`). İlerlemesi olmayan rozetlerde yalnız açıklama.
- **Kazanılamayan rozetler gizlenmez.** `staff`, `contributor`, `event` ve `supporter`
  da listede görünür; `supporter` için açıklama kullanıcıya neden boş olduğunu
  söylemez — katalogdaki normal açıklaması yazar. Bu bilinçli: ürün henüz
  faturalandırma sunmuyor, ekran bunu duyurmaz.
- Gruplar içinde sıra `sortBadges` (00 §4).

**Ekran hiçbir yerde "nasıl kazanılır" adımı uydurmaz** — yalnız katalog açıklaması
ve ilerleme sayısı gösterilir.

---

## 2. Mobil

### Rota

Yeni ekran: `apps/mobile/src/social/profile-badges/mobile-badges-screen.tsx`
(+ `.styles.ts`). `SettingsDetail` param'ı `section: string` olduğu için yeni bir
bölüm değeri yeterli: `section: "badges"`.

**Beş dosya birlikte güncellenir** (00 §2): `mobile-navigation-types.ts`,
`mobile-navigator.tsx`, `mobile-screen-containers.tsx`, `mobile-linking.ts`,
`mobile-navigation-ref.ts`. Derin bağlantı: `whispr://settings/badges`.
`settings-screen.tsx` içine `resolvedSection === "badges"` dalı eklenir
(mevcut `about`/`appearance` dallarının deseni, `:2282` civarı).

### Girişler

1. Ayarlar hub'ında yeni satır: chip ikonu + `Rozetlerim` + sağda `{kazanılan}/{toplam}`.
2. **Kendi profil kartında (1d) ve kendi tam profil sayfanda** `+N` chip'i bu ekranı
   açar (başkasının profilinde `+N` prompt 06'daki liste sheet'ini açar). Ayrım
   `profile.self` ile yapılır.

## 3. Web

`apps/web` ayarlar yüzeyi içinde yeni bölüm. Mevcut ayar bölümlerinin deseni izlenir;
yeni üst-seviye rota **açılmaz**. Metin anahtarları:
`settings.account.badges.title`, `settings.account.badges.earned`,
`settings.account.badges.locked`, `settings.account.badges.summary`
(`{earned}/{total}`) — `tr.ts` + `en.ts` birlikte.

Popover'daki `+N` kendi profilinde bu bölüme yönlendirir.

---

## 4. Bildirim

### Yazma

`badge-service.ts` içinde, `advanceBadgeProgress` **kademe yükselttiğinde**
(`tier > previousTier`) bir bildirim yazılır:

- `NotificationType.BADGE` (prompt 01'de enum'a eklendi — **ayrı deployment gerektirir**,
  Postgres aynı transaction'da yeni enum değerini kullandırmaz).
- `metadata`: `{ badgeId, tier }`. İstemci metni **metadata'dan değil katalogdan**
  üretir; bildirim gövdesine rozet adı gömülmez (dil değişince yanlış dilde kalır).
- Yazma deseni `apps/web/src/lib/feedback/feedback-service.ts:524` ile aynı;
  socket yayını `emitToUserRooms(userId, "notification:new", payload)`
  (`apps/web/src/lib/socket/emitters.ts:16`). **Yeni socket olayı açılmaz.**

### Bağlayıcı kurallar

- **Backfill bildirim yazmaz.** `advanceBadgeProgress` bir `notify?: boolean`
  parametresi alır, varsayılan `true`; `backfill-badges.ts` `false` geçer.
  Aksi hâlde geriye dönük hesaplama her kullanıcıya onlarca bildirim gönderir.
- **DERIVED rozetler bildirim üretmez** (`veteran` yıl dönümü dahil). Onların
  satırı yok, kademe geçişi gözlenmiyor. Bu bilinçli bir eksiklik, kullanıcıya
  duyurulmaz.
- Aynı rozet+kademe için ikinci bildirim yazılmaz (`@@unique([userId, badge])`
  zaten kademe geçişini tek sefer üretiyor).
- Sweep kaynaklı `founder` kademe **düşüşü** bildirim üretmez.

### Yönlendirme

Mobil bildirim dokunuşu `BADGE` tipinde "Rozetlerim" ekranını açar ve
`metadata.badgeId` varsa o rozetin detayını **doğrudan** gösterir. Yönlendirme
metadata koklamadan tip üzerinden yapılır — `FEEDBACK` için verilen gerekçenin aynısı.

### Cache tazeleme

`notification:new` geldiğinde tipi `BADGE` ise mobil ve web:
`badges.own()` ve `badges.user(<kendi id>)` query key'leri invalidate edilir.
Mobil tarafta bu, mevcut `realtime-query-bridge.ts` içindeki bildirim işleyicisine
eklenir.

---

## 5. Testler

Servis (`apps/web`):

1. `advanceBadgeProgress` kademe yükseltince **bir** bildirim yazıyor; aynı çağrı
   tekrarlandığında ikincisini yazmıyor.
2. `notify: false` ile hiç bildirim yazılmıyor.
3. Kademe düşüşünde (`founder`) bildirim yazılmıyor.
4. Bildirim `metadata` `{ badgeId, tier }` taşıyor ve gövdesinde rozet **adı** yok.

Mobil:

5. `mobile-badges-screen` kazanılan/kazanılmayan ayrımını doğru yapıyor; toplam
   sayacı `4/16` biçiminde.
6. Kilitli rozet satırında ilerleme metni var, kademe etiketi yok.
7. Kendi profilindeki `+N` "Rozetlerim"e gidiyor; başkasınınki liste sheet'ini açıyor.
8. `BADGE` bildirimi geldiğinde iki query key invalidate ediliyor.
9. Derin bağlantı `whispr://settings/badges` ekranı açıyor
   (`mobile-deep-link-contract.test.ts` güncel).

Web:

10. `{earned}/{total}` seçicisi ve gruplama fonksiyonu mobil ile **aynı sonucu**
    veriyor — gruplama/özet fonksiyonu `packages/types/src/badges.ts` içinde ortak
    tutulur (`groupBadgesByFamily`, `summarizeOwnBadges`).

---

## Kabul kriterleri

1. Üç typecheck + `@wizards/types` testleri yeşil.
2. `mobile-deep-link-contract.test.ts` ve `mobile-copy-parity.test.ts` yeşil.
3. Backfill çalıştırıldığında **sıfır bildirim** yazılıyor (test 2 kanıtlar).
4. Rozet adı hiçbir bildirim gövdesinde saklanmıyor.
5. Mobil ve web "Rozetlerim" aynı grupları aynı sırada, aynı sayaçla gösteriyor.
6. Yeni socket olayı eklenmedi.
