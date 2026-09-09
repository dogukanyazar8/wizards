# Dalga 2 · Ş5 — Profil paneli kabuğu, kimlik bloğu, sekmeler

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti. Dalga 1 Ş1/Ş2 sözleşmeleri donmuş olmalı; uçlar hazır
> değilse şerit kendi tarafını **DTO şemasına** göre yazar ve testini sahte veriyle koşar.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §15'in **kabuğunu** kur — 330 genişlik, başlık, kimlik
bloğu (DM + grup), sekme şeridi, kaydıran gövde — ve K4 gereği eski üç paneli sök. Sekme
**içerikleri** Ş6/Ş7/Ş8'e aittir; sen yalnız yuvayı ve boş/yükleniyor hâllerini yazarsın.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` (K4, K5, K14, kural 5) ve
`design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` §15, §15.1, §15.2.
Ölçüler `Mesajlar.dc.html` `L950–L1015`; ekranlar `screens/15`, `19`.
Kod tabanı için `graphify query "messages side panel dm conversation page details panel"`.

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/conversation-profile-panel.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-panel-identity.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/profile-panel-tabs.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/messages/avatar-tint.ts` (yeni) + `.test.ts` — **kural 5'in tek kaynağı**
- `apps/web/src/components/dm/dm-conversation-page.tsx` (K14 reducer'ı buraya bağlanır)
- **Silinir:** `apps/web/src/components/dm/dm-details-panel.tsx`,
  `dm-group-details-panel.tsx`, `dm-group-settings-panel.tsx` ve üç test dosyası
  (davranışları yeni panelin testine **taşındıktan sonra**)
- `apps/web/src/components/messages/messages-side-panel.tsx` (yalnız `width` prop'u ya da
  `variant` eklenmesi — 330 / 340 ayrımı)

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, Ş6/Ş7/Ş8'in sekme dosyaları,
`apps/mobile/**`.

## Ne yapılacak

### 1. `avatar-tint.ts` — kural 5

Kişi başına **sabit** tint döndüren tek yardımcı:
`getAvatarTint(userId)` → `"primary" | "success" | "warning" | "danger" | "neutral"`.
Kural Dalga 1 Ş1 raporunda sabitlendi (sunucu tarafı aynı kuralı kullanıyor) — **onu oku ve
birebir eşle**. Grup karosu için `getGroupTileTone(avatarColor)`: `DMConversation.avatarColor`
swatch **adı** taşır (tuzak 4), ham renk değil.

Sohbet rayı bugün kendi tint'ini nasıl üretiyorsa o yol **bu yardımcıya indirgenir**; iki kaynak
bırakma. Ray dosyasına dokunman gerekiyorsa yalnız import satırını değiştir, düzenini değiştirme.

### 2. `ConversationProfilePanel`

`MessagesSidePanel` kabuğunu kullanır (K5), genişlik `MESSAGES_METRICS.sidePanel.profileWidth`
(330). Başlık `Kullanıcı profili` / `Grup profili`, sağda 30×30 radius 10 kapat.

Gövde iskeleti (`profilePanel.body`): `flex:1; min-height:0; gap:16; padding:4 16 20;
overflow-y:auto`, ince kaydırma çubuğu `--border` renginde. `overscroll-behavior: contain`.
İçerik 561px'i geçince kaydırır, **hiçbir bölüm kırpılmaz**.

Sekme değişince gövde **başa döner** (§10). Sekme gövdeleri **tembel** (kural 7): seçilmeyen
sekmenin sorgusu koşmaz.

### 3. Kimlik bloğu — `profile-panel-identity.tsx`

**DM (§15.1):** 72×72 daire harf karosu, zemin `--primary/0.18` yerine **kişinin tinti**
(`avatar-tint.ts`), harf aynı tintin metin tonu, `600 24px` display, `letter-spacing:.03em`.
Halka `0 0 0 3px hsl(var(--<presence>)/0.55), 0 0 0 8px hsl(var(--<presence>)/0.14)` —
presence rengiyle sürülür, sabit success değil. Sağ altta 16×16 presence noktası, 3px
`--surface-secondary` kenar. Altında ad 600 18 display, `@kullanıcıadı` 500 12.5 muted, durum
pill'i (radius 999, presence tinti 0.14, 600 11.5, 6px nokta).
Aksiyon satırı: `Mesaj gönder` (flex 1, h36, radius 12, primary, `#fff`) + 36×36 sesli arama +
36×36 görüntülü arama. **Gri DS avatarı kullanılmaz** (kural 5).

**Grup (§15.1):** 66×66 radius 22 tile (`avatarColor` tonundan), iki harf 600 22 display,
gölge `0 14px 30px -16px hsl(var(--primary))`. Ad 600 18; alt satır `{n} üye · {m} çevrimiçi`
(çevrimiçi kısmı success). Rol pill'i `Yönetici` (`--primary/0.14`) / `Üye` (`--surface-soft`).
Aksiyonlar: `Üye ekle` (flex 1, primary → Dalga 3 Ş10 modalı; şimdilik prop olarak dışarı verilen
`onAddMembers`), sessize al, grup ayarları ikon butonları.

Presence noktasının **metin karşılığı** olmalı (kural 6): `sr-only` etiket ya da
`aria-label`.

### 4. Sekme şeridi — `profile-panel-tabs.tsx`

Padding `12 14 10`, gap 3. DM: `Genel · Medya · Ayarlar`. Grup: `Genel · Üyeler · Medya · Ayarlar`.
Her biri `flex:1`, h31, radius 10, 600 12 body.

- Seçili: `--primary` zemin + `#fff`; hover **yalnız** `filter:brightness(1.07)` — zemin
  **değişmez** (§15.2; SPEC bunu ayrıca kabul kriterine koymuş).
- Seçili değil: saydam + `--text-secondary`; hover `--surface-soft` + `--foreground`.
- Gerçek `role="tablist"` / `role="tab"` / `aria-selected`, ok tuşlarıyla gezinme,
  `aria-controls` ile gövdeye bağlı.

DM'de `uyeler` sekmesi **çizilmez**; reducer zaten bu durumu `genel`e çeviriyor (Dalga 0 Ş0.3).

### 5. `DMConversationPage` — K14

- `messages-screen.ts` reducer'ı bu bileşende `useReducer` ile kurulur.
- `isDetailsDrawerRequested` → `state.detailsDrawerOpen`;
  `searchRequestId` → `state.searchRequestId`. İki `useState` **silinir**.
- Sağ panel yuvası tek: `state.panel` `"thread" | "search" | "profile" | null`.
  `openProfile` thread ve aramayı kapatır (K5) — reducer bunu zaten yapıyor, bileşen ikinci bir
  kapatma çağrısı yazmaz.
- `<1100px` altında panel overlay olur (mevcut `overlay` prop'u); `<960px` altında sohbet rayı
  drawer'a taşınır — mevcut kırılım davranışı **korunur**, yeniden yazılmaz.
- Eski üç panelin çağrıları kaldırılır, `ConversationProfilePanel` bağlanır.

### 6. Eski panellerin sökülmesi (K4)

`dm-details-panel.tsx`, `dm-group-details-panel.tsx`, `dm-group-settings-panel.tsx` silinir.
Silmeden önce üç test dosyasını oku ve **doğruladıkları davranışları** yeni panelin testine
taşı — özellikle: grup ayarları panelinin ayrı rota değil aynı yüzey olduğu, 1:1 panelinin
karşı taraf koruması, paylaşılan ek özetinin boş hâli. Bir davranış artık geçersizse testi
silmeden önce raporda gerekçesini yaz.

Ş3'ün raporunda işaretlediği "React Query önbelleğinden medya türetme" bloğu bu silmeyle birlikte
gider — Medya sekmesi Ş7'de gerçek uca bağlanacak.

## Test

- Panel 330 genişlikte çiziliyor, thread/arama 340'ta kalıyor.
- DM'de 3, grupta 4 sekme; DM'de `uyeler` yok.
- Seçili sekme hover'da zemin değiştirmiyor.
- Sekme değişince gövde başa dönüyor.
- `Esc` paneli kapatıyor, focus tetikleyiciye dönüyor.
- Profil açılınca thread/arama kapanıyor.
- Kimlik karosu **renkli** (gri DS avatarı yok), presence halkası presence rengini alıyor.
- Eski üç panelden taşınan davranışlar geçiyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/06-rapor.md` — tint yardımcısının imzası (Ş6/Ş7/Ş10 tüketecek), eski testlerden
taşınan ve düşürülen davranışların listesi, `MessagesSidePanel` genişlik prop'unun adı.
