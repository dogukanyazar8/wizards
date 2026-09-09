# Dalga 3 · Ş10 — Üye ekle modalı

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 1 Ş2 (grup üye/davet uçları) ve Dalga 2 Ş5 (reducer + panel) bitti.

---

Whispr monorepo, `uat` dalı. Görev: SPEC §16'yı yaz — 560 genişlikte üye ekle modalı, üç açılış
noktası, aday listesi, zaten-üye yığını, bağlantıyla davet kutusu, alt bar. Karşılığı
`screens/22`.

Önce oku: `docs/prompts/whispr-mesajlar-profil/00-ortak-baglam.md` ve `SPEC-MESAJLAR.md` §16 +
§10'un `Üye ekle modalı` satırı. Ölçüler `Mesajlar.dc.html` `L1415–L1560`.

## Sahiplenilen dosyalar

- `apps/web/src/components/messages/add-members-modal.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/invite-candidate-row.tsx` (yeni) + `.test.tsx`
- `apps/web/src/components/messages/invite-link-box.tsx` (yeni) + `.test.tsx`
- `apps/web/src/lib/dm/invite-candidates.ts` (yeni) + `.test.ts` — aday süzme kuralı
- `apps/web/src/app/api/v1/dm/groups/[conversationId]/candidates/route.ts` (yeni) +
  `route-logic.ts` + `.test.ts`

**Yazma:** `metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`, profil paneli dosyaları,
`conversation-more-menu.tsx`, `apps/mobile/**`.

## 1. Aday ucu

`GET /api/v1/dm/groups/[conversationId]/candidates?query=&cursor=`

- Viewer'ın **arkadaşları** aday havuzudur.
- **Mevcut üyeler listede görünmez** (§16 bunu ayrıca kabul kriteri yapmış). Süzme sunucuda
  yapılır; istemcide filtrelemek 250 üyelik grupta yanlış sayfa uzunlukları üretir.
- `UserSettings.allowGroupInvites: false` olan arkadaş **aday değildir** — şemada bu alan var ve
  tam bunun için. Bunu atlama.
- Engellenen / engelleyen kullanıcılar aday değildir.
- Yanıt: `{ items: InviteCandidateDTO[], nextCursor, alreadyMemberCount }` (K16).
  `alreadyMemberCount` `{n} kişi zaten üye` yığınını besler.
- Yetki: viewer bu grubun katılımcısı olmalı **ve** `permAddMembers` kuralına uymalı; üye rolüyle
  `ADMINS` politikasında 403.
- `requireApiUserId` → `enforceApiRateLimit` → zod → yetki → iş.

## 2. Modal kabuğu

560 genişlik, radius 22, `--surface-card`, `1px --border`, gölge `0 50px 90px -40px
hsl(var(--shadow-color))`; **kabuk içinde** ortalanır, backdrop `--backdrop/0.62` + `blur(4px)`.
Mevcut `Modal` bileşeni kullanılır (kural 4).

Başlık (padding `22 24 18`, alt kenar `1px --border/0.6`): 40×40 radius 14 `--primary/0.15`
kişi-ekle ikonu + `Üye ekle` 600 18 display + alt satır `{grup} · {n} / 250 üye` + 32×32 kapat.

`Esc` ve backdrop kapatır; focus tuzağı; açılışta **arama alanına** focus; kapanışta tetikleyiciye
dönüş (kural 6).

## 3. Gövde

- **Arama alanı:** h42, radius 13, `--surface-soft/0.7`, `1px --border/0.6`, placeholder
  `Arkadaş ara — isim veya @kullanıcıadı`. Sorgu **debounce** edilir ve uca gider (istemci içi
  filtre değil).
- **Seçili çipler:** h30, radius 999, `--primary/0.14`, `1px --primary/0.3`; 22px renkli daire
  (Ş5 tinti) + ad (600 12, `nowrap`) + 18px kaldır düğmesi. Seçim yoksa `Henüz kimse seçilmedi`
  12 muted. Kaldır düğmesi gerçek `button` + `aria-label`.
- **`ARKADAŞLARIN`** etiketi + ince ayırıcı + sağda `{n} eklenebilir`.
- **Aday satırları:** padding `9 10`, radius 13, hover `--surface-soft/0.8`, seçili
  `--primary/0.1`; 19×19 radius 6 onay kutusu (seçili `--primary` + beyaz tik) + 36px renkli
  daire karo + 11px presence + ad 600 13.5 + durum 11.5 muted.
  Satır **tamamı** tıklanabilir (`role="option"` + `aria-selected`, liste `role="listbox"`
  `aria-multiselectable`), onay kutusu ayrı bir tıklama hedefi değil.
- **Zaten üye satırı:** listenin altında, üst kenar `1px --border/0.45`; 26px daireler `-7px`
  binişik (2px `--surface-card` kenar) + `{n} kişi zaten üye` 12 muted.
- **`BAĞLANTIYLA DAVET`** kutusu: radius 14, `--surface-soft/0.55`, `1px --border/0.55`,
  padding 13; sağ üstte süre segmenti `7 gün` · `1 gün` · `Süresiz` (h24, radius 8, seçili
  `--primary` + `#fff`); altında mono bağlantı kutusu + `Kopyala` butonu (h36, `--primary/0.14`)
  → toast `Davet bağlantısı kopyalandı`.
  Süre değişimi mevcut `invite` / `invite/rotate` ucuna yazar; **yeni uç açma**. Süre değişimi
  bağlantıyı döndürüyorsa kutudaki metin de anında güncellenir.

## 4. Alt bar

Padding `18 24 20`. Solda `{n} kişi seçildi · grup {m} üye olur`; seçim yoksa
`Eklemek için arkadaş seç ya da bağlantı paylaş`. `İptal` + birincil buton `{n} kişiyi ekle`.
Seçim yoksa etiket `Ekle` ve zemin `--surface-tertiary` + `--text-muted` (nötr görünür ve
`disabled`).

Ekleme mevcut `POST /api/v1/dm/groups/[conversationId]/members` ucuna gider (`AddMembersRequest`,
Dalga 0). Başarıda: modal kapanır, grup sohbetine dönülür, toast `{ad} gruba eklendi`
(birden fazla kişide i18n çoğul kuralı ile `{ad} ve {n} kişi gruba eklendi`).

**250 üye tavanı:** seçim mevcut üye sayısı + seçilen > 250 olacaksa buton pasifleşir ve alt bar
metni sınırı söyler. Sunucu da bunu reddediyor olmalı — reddetmiyorsa Ş2'ye rapor et, istemci
kontrolü tek savunma hattı kalmasın.

Başarısızlıkta: modal **açık kalır**, seçim korunur, danger toast (Ş9 varyantı) basılır.

## 5. Üç açılış noktası

§16'nın son satırı bağlayıcı: modal grup profili başlığındaki `Üye ekle` (Ş5), Üyeler
sekmesindeki dashed buton (Ş7) ve grup menüsündeki `Üye ekle · davet bağlantısı` (Ş9) satırından
açılır. Üçü de reducer'ın `openModal({ kind: "invite" })` action'ını çağırır — üç ayrı yerel
state açılmaz (K14).

## Test

- Mevcut üye aday listesinde **yok**.
- `allowGroupInvites: false` arkadaş aday değil.
- `permAddMembers: ADMINS` + üye rolü → uç 403.
- Seçim sayacı ve buton etiketi seçimle güncelleniyor; seçim yokken buton nötr ve `disabled`.
- Çipten `×` seçimi kaldırıyor; satır tıklaması seçip çıkarıyor.
- 250 tavanı aşan seçimde buton pasif.
- `Kopyala` toast basıyor; kopyalama reddedilince danger toast.
- Süre segmenti mevcut invite ucuna yazıyor, yeni uç çağırmıyor.
- Ekleme başarısızlığında modal açık ve seçim korunuyor.
- `Esc`, backdrop, focus tuzağı, açılışta arama alanına focus.
- Üç açılış noktasının üçü de aynı action'ı çağırıyor.

## Kapı

```bash
pnpm --filter @wizards/web test
```

```bash
pnpm --filter @wizards/web typecheck
```

Rapor: `raporlar/11-rapor.md` — sunucunun 250 tavanını gerçekten uygulayıp uygulamadığı,
aday süzme kurallarının tam listesi, invite süre değişiminin bağlantıyı döndürüp döndürmediği.
