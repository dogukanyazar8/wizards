# Faz 4 — 6c: Sunucu "⋯" menüsü + bağlı ayar yüzeyleri

> Önce `00-ortak-baglam.md` oku. Branch `uat`. caveman ultra. Kararsız kalırsan sor. Cihaz testini kullanıcı yapar. İzinsiz commit yok.

**Ön koşul:** Faz 3 landed, `03-rapor.md` okundu. Faz 3'ün asgari menüsü yerinde.
**Tasarım:** HTML `175–209`. PROMPT.md `352–364`.
**Hedef:** başlıktan kalkan üç aksiyonun kalıcı evi. Sessize alma, yıldızlama ve bildirim seviyesi uçtan uca çalışır hâle gelir.

---

## A0. Faz 3'ten devralınan durum — önce oku

Faz 3 planlanandan fazlasını indirdi. Faz 4 bunları **yeniden yazmaz**, üstüne kurar.

### A0.1 — Menü sheet'i zaten var, beş satırlı

`apps/mobile/src/app/screens/workspace-server-menu-sheet.tsx` (169 satır) — bilgi / üyeler / davet / ayarlar / ayrıl. Faz 4 bu dosyayı **yerinde 6c biçimine dönüştürür**; ikinci bir menü bileşeni açmaz.

**Dört testID aynen taşınacak** (03-rapor §2.2 — e2e Maestro akışı ve iki node sözleşme testi bunlara bakıyor):

```
mobile-server-profile-open-<id>
mobile-server-members-open-<id>
mobile-server-invite-share-<id>
mobile-server-settings-open-<id>
```

Taşınmazsa `mobile-maestro-testid-contract.test.ts` ve `mobile-navigation-contract.test.ts` kırılır.

### A0.2 — "Sunucudan ayrıl" uçtan uca hazır (§D2 kapsam dışı)

`DELETE /api/v1/mobile/servers/[serverId]/members/me` + `leaveMobileServer` + `mutations.leaveServer` + `DestructiveConfirmationSheet` (`mobile-server-leave-confirm`) + sahipte satırın hiç render edilmemesi — **hepsi Faz 3'te indi**. Sahip reddi servis tarafında (`leaveWorkspaceServer`), istemcide kural tekrarı yok.

Faz 4 bu satırı yalnız 6c'nin liste kartına yerleştirir: son satır, ayraçsız, `danger` ikon + metin. **Mutasyonu, onayı, sahip gizlemesini yeniden yazma.** §D2'nin geri kalanı (devir uyarısı) zaten servis davranışıyla karşılanıyor — sahipte satır yok, uyarıya gerek kalmadı.

### A0.3 — Rail sıralaması hâlâ bağlanmadı, veri de yok

`sortMobileServersByStar` (`mobile-sunucular-model.ts:724`) Faz 2'de yazıldı, **hiçbir yerden çağrılmıyor**. Daha kötüsü: `MobileBootstrapServerSummarySchema` (`packages/types/src/mobile.ts:500`) `starred` taşımıyor — sunucu listesinde veri yok, sıralama yapılamaz.

Faz 4'ün ilk işi bu zinciri kapatmak:

1. **Şema**: `MobileBootstrapServerSummarySchema`'ya üç alan — `starred: z.boolean().default(false)`, `muted: z.boolean().default(false)`, `notificationLevel: ServerNotificationLevelSchema.default("all")`. Üçü de `default`'lu; dosyanın kendi kalıbı bu (yorumlar: "bootstrap payload shipped before the flag existed"), eski sunucu yanıtı parse edilmeye devam etmeli.
2. **Backend**: bootstrap sorgusu `UserServerSettings` satırlarını **tek sorguda** çeker (kullanıcı + sunucu id listesi), `serverId` ile map'ler. Sunucu başına sorgu **yasak** — Faz 1'in sorgu bütçesi disiplini burada da geçerli, listede 50 sunucu olabilir. Satır yoksa varsayılan (`false/false/"all"`).
3. **Rail + 1c sheet**: `sortMobileServersByStar` çağrısı. Sıralama stabil (`Array.prototype.sort`), yıldızsızlar mevcut sırasını korur.
4. **Web paritesi**: Faz 1 §B7 web rail sıralamasını istemişti — `01-rapor.md`'den indiği doğrulanır; inmemişse burada kapanır.

**Neden bootstrap'a konuyor, profile değil:** 6c sheet'i açılınca üç toggle'ın durumu **anında** doğru olmalı. Profil okuması 5–7 sorgu; üç boolean için o okumayı tetiklemek saçma. Bootstrap zaten sunucu listesini taşıyor, üç alan oraya bedava biniyor.

### A0.4 — Bilinçli borç, Faz 4 dokunmuyor

Arama açıkken filtre şeridi gizleniyor (03-rapor §6.5). Tasarımda iki durumun birlikte davranışı çizilmemiş. Faz 4'ün işi değil.

---

## A. Sheet kabuğu

Alttan sheet. Faz 3'ün asgari menüsü **bu yapıyla değiştirilir**, yanına ikinci bir menü açılmaz.

- Arka karartma `rgba(20,23,42,.42)`; arkadaki içerik görünür kalır (mockup'ta `opacity: .45` — RN'de karartma katmanı bunu zaten üretir, ayrıca içeriği soldurma).
- Sheet: beyaz, üst köşeler r28, `padding: 10px 16px 26px`, elevation `0 -12px 34px rgba(30,34,53,.18)`.
- Tutamaç `38×4` r2 `#DEE1EF`, `margin: 0 auto 14px`.
- Sürüklenerek kapanır (kabul kriteri 7). Mevcut sheet altyapısını kullan — yeni sheet motoru yazma.
- Açılış noktaları: 6a başlık "⋯" (`34×34`) ve 6b kart yanındaki "⋯" (`42×42`).

## B. 1 — Kimlik satırı

`gap: 11`, `padding: 0 4px 14px`:

- Avatar `44×44 r16`, `flex: none`, `14/800` fallback.
- Ad `16/800`, `lineHeight 19.2`, **2 satıra kadar** (`getMobileServerNameLayout(name, "card")`).
- Alt satır: davet adresi `whispr.gg/mobile-test`, `11.5/600 #6B7194` — kaynak `ServerPublicProfile.inviteAddress` (Faz 1 B2). `null` ise satır gizlenir, boş string yazma.
- Sağda **"Profili gör"**: `padding 7px 12px`, r12, `#EEF0FE`, `11.5/800 #4F46E5` → 6d (Faz 5). Faz 5 gelene kadar mevcut `ServerProfile` rotasına gider.

## C. 2 — Hızlı aksiyon dörtlüsü

Eşit genişlik kartlar, `gap: 8`, `paddingBottom: 14`. Kart: `flex: 1`, `#F6F7FB`, `1px #EDEFF8`, r16, `padding: 12px 0`, `gap: 6`, ikon `19` stroke `#4F46E5` 2, etiket `11/700`.

| Kart           | Davranış                                                                                                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Davet et**   | 2a davet sheet'ini açar (`mobile-invite-sheet.tsx`). Yalnız davet yetkisi olanda etkin; yetkisizde **kart render edilmez**, kalan üç kart eşit genişliği paylaşır.                                        |
| **Sessize al** | Toggle. Aktifken ikon + etiket `#4F46E5`, kart zemini `#EEF0FE`. Yazma: `updateMobileServerUserSettings({ muted })` (Faz 2 B5). Optimistic; hata → geri al + error toast.                                 |
| **Yıldızla**   | Toggle. Aynı aktif görünüm. Yazma: `updateMobileServerUserSettings({ starred })`. Başarılı yazma **rail sıralamasını** günceller (`sortMobileServersByStar`) — sunucu listesi query'si invalidate edilir. |
| **Paylaş**     | Native share sheet, içerik = `inviteAddress`. `inviteAddress` yoksa kart gizlenir.                                                                                                                        |

Toggle kuralları:

- Durum kaynağı **bootstrap sunucu özeti** (`muted` / `starred` / `notificationLevel`, A0.3) — sheet açılışında ek istek yok. `ServerPublicProfile` aynı üç alanı taşımaya devam eder (6d/6e onları okur); PATCH başarısında **iki cache de** güncellenir.
- Optimistic güncelleme + hata geri alma; başarıda **toast yok** (görsel durum zaten değişti). Yalnız hata toast'ı. Bölüm 3 toast bileşeni.
- Çift dokunma yarışına karşı in-flight koruması: aynı anahtar için ikinci istek gitmez.

## D. 3 — Liste kartı

`#F6F7FB`, `1px #EDEFF8`, r18, `overflow: hidden`. Satır: `gap: 12`, `padding: 13px 14px`, alt ayraç `1px #EDEFF8`, ikon `18` stroke `#6B7194` 2, etiket `14/700`, değer `12.5/600 #9AA0BC`, chevron `14 #C0C5DC` 2.4.

| Satır                 | Değer                                                                           | Hedef                                | Görünürlük                                               |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| **Sunucu bilgisi**    | —                                                                               | 6d (Faz 5); şimdilik `ServerProfile` | herkes                                                   |
| **Üyeler**            | üye sayısı (`5`)                                                                | `ServerMembers` rotası               | herkes                                                   |
| **Bildirim ayarları** | mevcut seçim: `Tümü` / `Bahsetmeler` / `Kapalı`                                 | bildirim seviyesi seçimi             | herkes                                                   |
| **Sunucu ayarları**   | `YÖNETİCİ` çipi (`#EEF0FE`, `9.5/800 #4F46E5`, ls `.38`, r7, `padding 3px 7px`) | `ServerSettings` rotası              | yalnız `canManageServer`                                 |
| **Sunucudan ayrıl**   | —                                                                               | onay dialogu                         | herkes; **son satır, ayraçsız**, ikon ve metin `#E5484D` |

### D1 — Bildirim seviyesi seçimi

Yeni tam ekran açma. Aynı sheet kalıbında ikinci bir katman veya küçük seçim sheet'i: üç seçenek (`Tümü` / `Bahsetmeler` / `Kapalı`), seçili olanda primary check. Yazma `updateMobileServerUserSettings({ notificationLevel })`. Kapanınca 6c'deki değer güncellenir.

`muted` ile `notificationLevel` **ayrı kavramlar**: sessize alma geçici susturma, bildirim seviyesi kalıcı tercih. İkisini birbirine bağlama; Faz 1 B5 ikisini de ayrı alan olarak yazıyor.

### D2 — Sunucudan ayrıl (Faz 3'te indi — yalnız yerleştir)

A0.2: uç, istemci, mutasyon, onay sheet'i ve sahipte satırın gizlenmesi hazır. Faz 4 **yalnız** satırı 6c liste kartının son satırı olarak konumlandırır (ayraçsız, `danger`).

Yeniden yazma: mutasyon, onay metni, sahip kuralı, ayrılma sonrası sunucu seçimi. Hepsi çalışıyor ve testli.

## E. Etiket düzenleyici (mobil)

Faz 1 B4 `tags` yazma ucunu açtı, web düzenleyicisi orada. Mobil sunucu ayarları da düzenleyebilmeli, yoksa mobil-only yönetici etiket giremez.

- Yer: `apps/mobile/src/workspace/mobile-server-settings-screen.tsx` içinde yeni bölüm.
- Çip listesi + ekleme girişi; max 5, slug doğrulaması **Faz 1'in şemasından** (istemci kendi kuralını yazmaz).
- Yalnız `canManageServer`.

---

## F. Bağlayıcı kararlar

1. "⋯" menüsü **tek bileşendir**; 6a ve 6b aynı bileşeni açar, iki kopya yok.
2. Kullanıcı-sunucu tercihleri yalnız Faz 1 B5 ucundan yazılır.
3. Yetkisiz kullanıcıda öğe **render edilmez** (disable değil) — PROMPT.md §0.2 kuralı, hızlı aksiyon kartları dâhil.
4. Başarılı toggle'da toast yok; yalnız hata.
5. Sahip ayrılamaz — bu ürün kuralı, UI kısıtı değil; backend de reddediyorsa istemci mesajı ona uyar.

## G. Yapılmayacaklar

- Sunucu ayarları ekranını yeniden tasarlamak (etiket bölümü hariç).
- Üye listesi ekranını değiştirmek.
- Yeni sheet/dialog altyapısı yazmak.
- Bildirim ayarları için kanal bazlı override eklemek — tasarımda yok.
- Yıldızlamayı sürükle-bırak sıralamaya çevirmek — yıldız binary, sıralama türetilir.

## H. Kapı

A0.3 bootstrap şemasına ve backend'e dokunuyor — web/types kapıları da koşar.

```bash
pnpm --filter @wizards/types test
```

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/mobile test
```

`apps/mobile` dizininden (tam süit — Faz 3 taban çizgisi rapordan alınır, düşerse regresyon):

```bash
npx jest
```

Kabul:

0. **A0.3 kapandı:** bootstrap özeti üç alanı taşıyor (üçü de `default`'lu), backend tek sorguyla çekiyor (50 sunuculu listede sunucu başına sorgu yok — testle iddia edilir), rail ve 1c sheet `sortMobileServersByStar` kullanıyor.
   0b. **Dört testID korundu:** `mobile-maestro-testid-contract.test.ts` ve `mobile-navigation-contract.test.ts` yeşil.
1. Kaldırılan üç header aksiyonunun (bilgi / davet / ayarlar) **hepsi** menüden erişilebiliyor — kabul kriteri 16.
2. `Sunucu ayarları` satırı yalnız `canManageServer` true iken var; `Davet et` kartı yalnız davet yetkisinde.
3. Sessize al / Yıldızla toggle'ları sunucuya yazıyor, optimistic, hata geri alıyor, çift dokunmada tek istek.
4. Yıldızlama sonrası rail sıralaması güncelleniyor.
5. Bildirim seviyesi seçimi 6c'deki değeri güncelliyor; `muted` bağımsız kalıyor.
6. Sahip için `Sunucudan ayrıl` devir uyarısı veriyor; üye için onay dialogu + başarılı ayrılma akışı.
7. Sheet sürüklenerek kapanıyor; tüm dokunma hedefleri ≥ 44px.

## I. Rapor

`docs/prompts/sunucular-6a-6f/raporlar/04-rapor.md` — 00 §8. Ek olarak:

- Yetki matrisi: hangi öğe hangi izinde render ediliyor.
- Optimistic toggle'ların hata yolu nasıl test edildi.
- Cihaz test listesi: sahip hesabı, salt-üye hesabı, davet yetkisi olan ama yönetici olmayan hesap, çevrimdışıyken toggle.
