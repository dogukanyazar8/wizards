# Dalga 2 · Ş8 — Grup modalı, yeni mesaj seçici, boş durum

**Ön koşul:** Ş1 (`MessagesLayout`, `onNewMessage`/`onNewGroup`), Ş2 (grup ucu) kapıları yeşil.
**Paralel:** Ş5, Ş6, Ş7 ile aynı anda.

Kapsam: SPEC-MESAJLAR §7, §9 ve §3'ün `Yeni mesaj` akışı. Ekranlar: `screens/09`, `10`, `12`.

---

## Sahiplenilen dosyalar

```
apps/web/src/components/dm/group-create-dialog.tsx            (SPEC'e göre yeniden çizilir)
apps/web/src/components/dm/group-create-dialog.test.tsx
apps/web/src/components/dm/group-icon-field.tsx               (6 token swatch)
apps/web/src/components/messages/new-message-picker.tsx       (yeni)
apps/web/src/components/messages/new-message-picker.test.tsx  (yeni)
apps/web/src/components/messages/messages-empty-state.tsx     (yeni)
apps/web/src/components/messages/messages-empty-state.test.tsx(yeni)
apps/web/src/components/ui/toggle-switch.tsx                  (yeni — 42×23, yoksa)
apps/web/src/components/ui/segmented-control.tsx              (yeni — segment, yoksa)
apps/web/src/lib/messages/quick-start.ts + *.test.ts          (yeni)
```

> `toggle-switch` ve `segmented-control` için önce `graphify query "toggle segmented control ui"`
> koş. Karşılığı varsa **yenisini yazma**, mevcut olanı SPEC ölçüsüne hizala.

---

## İş

### 1. Yeni grup sohbeti modalı (SPEC §7)

Mevcut iki adımlı diyalog **korunur**; mantık `@wizards/types/group-dm-selection`'dadır ve
Ş0.3'te güncellendi (250 tavan, 6 token rengi, `LAST_7D`, `ALL` + davet açık varsayılanı, ad
zorunlu). Bu şerit **görsel** ve **etkileşim** katmanını SPEC'e getirir.

**Kabuk:** 560 genişlik, radius 22, `--surface-card`, `1px --border`, gölge
`0 50px 90px -40px --shadow-color`, backdrop `--backdrop/0.62` + `blur(4px)`, kabuk içinde
konumlanır.

**Başlık:** 40×40 radius 14 `--primary/0.15` tile + `Yeni grup sohbeti` 600/18 display + adım
etiketi (`Adım 1 / 2 · Kimler olacak?` / `Adım 2 / 2 · Grup ayarları`) + kapat. Altında iki parçalı
ilerleme çubuğu (aktif `--primary`, diğeri `--border`).

**Adım 1 — kişi seçimi**

- Arama alanı h 42 radius 13, placeholder `Kullanıcı ara — isim veya @kullanıcıadı`.
- Seçilenler çip olarak (h 30, radius 999, `--primary/0.14` + `1px --primary/0.3`, 24px avatar +
  ad + ×). Çipin × butonu `aria-label` taşır (`{ad} seçimini kaldır`).
- Aday listesi max yükseklik 296; satır padding `9 10`, radius 13, seçiliyse `--primary/0.1`;
  solda 19px onay kutusu (radius 6, seçili `--primary` + beyaz tik), ad + durum satırı.
  - `allowsGroupInvites = false` olan satır **kapalı** çizilir (soluk + kilit) — mevcut 2b §7
    davranışı korunur.
  - 250 tavanına yaklaşıldığında (249 seçili) kalan satırlar seçilemez hâle gelir ve ayak
    sayacı nedeni söyler.
  - Liste 250'ye çıkabildiği için **sanallaştırılır** (50 satır üstünde).
- Ayak: solda `En az 2 kişi seç · en çok 250 üye` (11.5 muted), sağda `İptal` + `İleri` (primary).
  `İleri` `canAdvanceToIdentity` false iken pasif + `aria-describedby` ile neden.

**Adım 2 — grup ayarları**

- Üstte canlı ikon önizlemesi: 40×40 radius 14, seçilen renk zemin, iki harf; metin rengi
  `getGroupAvatarForeground` (açık renklerde `hsl(222 30% 14%)`).
- `Grup adı` giriş alanı — **boş başlar**, placeholder yok, etiket alanın üstünde bölüm etiketi
  stilinde. Boşken `Grubu oluştur` pasif (karar: ad zorunlu).
- `Açıklama` textarea, 120 karakter sayacı.
- `Grup ikonu rengi`: 6 yuvarlak swatch (34px) — `primary` · `success` · `warning` · `danger` ·
  `info` · `accent`. Seçilinin çevresinde `--foreground` halka ve içinde tik.
  - `role="radiogroup"`, her swatch `role="radio"` + renk **adı** `aria-label`'da. Renk yalnız
    görsel bir ayrım olarak bırakılmaz.
- Ayar satırları (başlık 600/13 + açıklama 11.5 muted + sağda kontrol):

  | Başlık                       | Açıklama                                 | Kontrol                                           | Varsayılan |
  | ---------------------------- | ---------------------------------------- | ------------------------------------------------- | ---------- |
  | `Üye ekleme kuralı`          | `Gruba kim yeni kişi ekleyebilir`        | segment `Herkes` / `Yöneticiler`                  | Herkes     |
  | `Davet bağlantısı izni`      | `Üyeler bağlantı oluşturup paylaşabilir` | toggle 42×23                                      | **açık**   |
  | `Sohbet geçmişi görünürlüğü` | `Yeni üyeler ne kadar geriye bakabilir`  | segment `Tüm geçmiş` / `30 gün` / `7 gün` / `Yok` | Tüm geçmiş |

  Toggle: açık `--primary`, topuz `x=21`; kapalı `--surface-tertiary`, `x=3`. Gerçek
  `role="switch"` + `aria-checked`.
  Segment: `role="radiogroup"`, ok tuşlarıyla gezinir.
  `LAST_24H` bu ekranda **çizilmez** (karar #9) — grup ayarları panelinde kalır.

- Ayak: `Geri` · ortada `{n} kişi seçildi · sen dahil` (11.5 muted) · `Grubu oluştur` (primary).
  Başarıda modal kapanır ve **yeni grup sohbeti açılır** (`/channels/@me/{id}`).
- **Taslak korunur:** `Geri` ile adım 1'e dönüp tekrar gelince ad/açıklama/renk/ayarlar durur
  (mevcut `GroupCreateState` bunu zaten sağlıyor). Modal `Esc` ile kapanırken seçim yapılmışsa
  onay ister (`hasGroupCreateProgress`).

### 2. `Yeni mesaj` kişi seçici

SPEC ayrı bir ekran çizmiyor ama §10 `Yeni mesaj` → "kişi seçici" diyor. Grup modalının adım 1
kabuğunun **tek seçimli** hâli:

- Aynı 560 kabuk, başlık `Yeni mesaj`, arama alanı, arkadaş listesi (tek seçim, çip yok).
- Satıra tıklama doğrudan DM'i açar (varsa mevcut konuşma, yoksa kurar) ve modalı kapatır.
- Ayakta `Yeni grup sohbeti` bağlantısı — grup modalına geçer (adım 1, seçim taşınmaz).

### 3. Boş durum (SPEC §9)

`messages-empty-state.tsx`, ana alanda ortalanmış:

- 96×96 radius 32 `--primary/0.12` zemin + primary konuşma balonu ikonu (dekoratif,
  `aria-hidden`).
- Başlık `Kiminle konuşalım?` (600/22 display).
- Açıklama (genişlik 420, 13.5/1.6 muted, ortalı):
  `Soldan bir sohbet seç ya da yeni bir tane başlat. Grup sohbetlerinde 250 kişiye kadar ekip kurabilirsin.`
- İki buton: `Yeni mesaj` (primary) + `Yeni grup sohbeti` (ikincil, `1px --border`).
- 30px boşluk sonra `Hızlı başla:` (12 muted) + 3 çip (h 32, radius 999, `1px --border/0.7`,
  20px renkli baş harf tile).

**Hızlı başla kaynağı** (karar #12), `lib/messages/quick-start.ts`:

```ts
export function selectQuickStart(
  conversations: readonly ConversationRowDto[],
  limit = 3,
): ConversationRowDto[];
// 1) pinnedAt dolu olanlar, pinnedAt azalan
// 2) yetmezse lastMessageAt azalan, tekrar etmeyecek şekilde
// hiç sohbet yoksa boş dizi → çip şeridi VE "Hızlı başla:" etiketi hiç çizilmez
```

Çip tıklaması ilgili sohbeti açar.

### 4. Modal davranış sözleşmesi (üçü için ortak)

- `Esc` ve backdrop kapatır (grup modalında ilerleme varsa onay).
- Açılışta ilk etkileşimli öğeye focus; focus tuzağı; kapanışta focus tetikleyiciye döner.
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` başlığa.
- Aynı anda tek modal (Ş0.3 indirgeyicisi). Modal açıkken menüler kapanır.

---

## Test

`group-create-dialog.test.tsx` (mevcut testler güncellenir):

- 2 kişiden az seçimde `İleri` pasif; 249'da tavan uyarısı.
- Adım 2'de ad boşken `Grubu oluştur` pasif; ad yazılınca aktif.
- 6 swatch çizilir, her biri `aria-label`'ında renk adı taşır; açık renkte tik metni koyu.
- Varsayılanlar: geçmiş `Tüm geçmiş`, davet bağlantısı **açık**, üye ekleme `Herkes`.
- `7 gün` seçilebilir; `24 saat` **çizilmez**.
- `Geri` → adım 1 → `İleri` yolunda ad/açıklama/renk korunur.
- İlerleme varken `Esc` onay ister; yokken doğrudan kapatır.

`new-message-picker.test.tsx`: satır tıklaması DM açar; `Yeni grup sohbeti` bağlantısı grup
modalına geçirir.

`messages-empty-state.test.tsx`: 3 çip; sohbet yokken şerit **ve** `Hızlı başla:` etiketi yok;
buton tıklamaları doğru modalı açar.

`quick-start.test.ts`: sabitlenenler öne gelir; tekrar yok; 3'ten az veri kısmi liste verir.

## Kapı

```bash
pnpm --filter @wizards/web test -- --test-name-pattern "(group-create|new-message|empty-state|quick-start)"
pnpm typecheck && pnpm lint
pnpm --filter @wizards/web e2e:a11y
```

Rapor: `raporlar/09-rapor.md`. Mobil grup kurma akışının ad zorunluluğundan etkilenip
etkilenmediği bu raporda **kapatılır** (Ş0.3'ün açık kalanı).
