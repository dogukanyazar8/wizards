# 12 — 2g · Topluluk sunucusu (davet önizlemesi)

Önce `00-ortak-baglam.md` oku. Ön koşul: `01`, `02`, `03`. Branch `uat`, commit yok.

Referans: `screenshots/2g-topluluk-sunucusu.png` · HTML `#2g` (satır 521–607) ·
PROMPT.md §3.12, §4.19.

Rota: `CommunityInvite { slug? }` (`invite/:slug`). Giriş: 1b TOPLULUK >
"Whispr topluluk sunucusu". Varsayılan slug yapılandırmadan gelir (`whispr-community`).

---

## 0. Backend eksiği (bu promptun ilk işi)

Mevcut durumda davet **önizlemesi** yok:

- `POST /api/v1/mobile/servers/join` — koda göre katılma **var**
- `POST /api/v1/mobile/invites/[code]/decline` — reddetme **var**
- Üye/çevrimiçi sayısı, kanal listesi, ortak arkadaşlar döndüren uç **yok**

Bu yüzden yeni uç eklenir:

`GET /api/v1/mobile/invites/[code]/preview` → `MobileInvitePreviewResponse`

```ts
{
  serverId, slug, name, verified: boolean, description: string,
  memberCount: number, onlineCount: number,
  bannerUrl: string | null, iconUrl: string | null,
  channels: { name, type: "text" | "voice", readOnly: boolean, liveCount: number | null }[],
  mutualFriends: { id, displayName, avatarUrl | null }[],   // en fazla 8
  mutualFriendCount: number,
  joined: boolean
}
```

Kurallar:

- Yalnız davetin **görmeye izin verdiği** kanallar döner (§4.19); gizli kanal sızmaz.
- `mutualFriends` yalnız istek sahibinin arkadaşlarıyla kesişimdir; arkadaş yoksa boş dizi.
- Şema `packages/types/src/mobile.ts` içine, servis `apps/web/src/lib/invites/` altına.
- Zorunlu kayıtlar (00 §2): `api-rate-limit.ts` → `mobile:invite:preview`;
  `route-contract.test.ts` — kimlik gerektirir, listeye ekleme yok.
- `route-logic.test.ts`: geçersiz kod 404, gizli kanal filtrelemesi, `joined` bayrağı.

---

## 1. Mobil dosyalar

- `apps/mobile/src/app/screens/about/about-community-invite-screen.tsx` (+ `.styles.ts`)
- `apps/mobile/src/about/mobile-community-invite-client.ts`
- Container: `CommunityInviteScreenContainer`

---

## 2. Yerleşim

### Başlık (HTML 533–537)

`AboutScreenHeader` — "Topluluk" 21/800, sağda 36×36 `r13` paylaş butonu
(yukarı ok + tabla, 16px `textSecondary`) → davet bağlantısını **kopyalar**
(`expo-clipboard`) + toast "Bağlantı kopyalandı". Mevcut `mobile-invite-share.ts`
yardımcıları varsa yeniden kullanılır.

### Davet kartı (HTML 539–567)

`margin: 8px 16px 0`, `card` + `1px cardBorder`, `r24`, `overflow: hidden`.

1. Banner `height: 92`:
   `bannerUrl` varsa görsel (`mobile-cached-image.tsx`, `resizeMode: cover`),
   yoksa marka gradyanı — `expo-linear-gradient`:
   `radial-gradient(circle at 22% 26%, rgba(255,255,255,.3), transparent 42%)` katmanı
   RN'de yok → üstte `LinearGradient` + altında düşük opaklıklı beyaz daire (`View`,
   `borderRadius`, `opacity .3`, `blur` yok) ile yaklaşılır; yorumla belirt.
2. İçerik `padding: 0 16px 16px`, `marginTop: -26` (ikon bannerın üzerine biner):
   - 56px `r18` beyaz çerçeve: `backgroundColor: card`, `borderWidth: 3`,
     `borderColor: card`, gölge `0 6px 16px rgba(30,34,53,.14)`;
     içinde 50px `r14` sunucu ikonu — `iconUrl` yoksa `AboutBrandLogo size={50} radius={14}`
     (bar 3px / `gap 3`, yükseklikler 13/19/26/18/14).
   - Ad satırı `marginTop: 12`, `gap: 7`: "Whispr Topluluk" 18/800 `ls -.01em` +
     15px doğrulama rozeti `accent` (`verified` true ise).
   - Sayaç satırı `marginTop: 9`, `gap: 14`: 7px `successDot` + `{n} çevrimiçi`;
     7px `timelineDot` + `{n} üye`; ikisi de 11.5/600 `textSecondary`.
     Sayılar `formatMobileCompactCount` ile (`1,2B`, `12,4B`).
   - Açıklama 12.5/500 `lineHeight 1.5` `textSecondary`, `marginTop: 11`.

### KANALLAR (HTML 569–590)

`AboutGroupLabel` + kart; her satır `padding: 12px 16px`, `gap: 11`:

- 16px kanal ikonu `iconTint` — metin kanalı `#` (HTML 572 path), sesli kanal hoparlör.
- Ad 13.5/600, `flex: 1`.
- Sağ uç durumu (dördü de farklı):
  `salt okunur` 10.5/700 `textTertiary` · `CANLI` çipi (9/800 `accent`/`accentSurface`) ·
  hiçbir şey · `{n} kişi` (7px `successDot` + 11/600 `successText`).
  Kanallar sunucudan gelir; boş listede kart render edilmez.

### Sosyal kanıt satırı (HTML 592–600)

`margin: 16px 16px 0`, kart, `r20`, `padding: 12px 16px`, `gap: 11`:

- Avatar yığını: 28px daireler, `borderWidth: 2`, `borderColor: card`,
  ikinciden itibaren `marginLeft: -9`. En fazla 3 avatar + 4. daire `+{n}`
  9.5/800 `textSecondary`, zemin `control`.
  Avatarlar **gerçek veriden** (`mutualFriends[].avatarUrl`), yoksa mevcut
  `kit/avatar.tsx` baş harf üretimi.
- Metin 11.5/500 `textTertiary` `lineHeight 1.4`: "Arkadaşlarından {n} kişi bu sunucuda".
- **Ortak arkadaş yoksa satır tamamen gizlenir** (§3.12.4).

### Alt eylem çifti (HTML 602–605)

`position: absolute`, `left/right: 16`, `bottom: 26`, `gap: 9`:

- `Sunucuya katıl` — `flex: 1`, `accent`, `r16`, `padding: 14px 0`, 14/800 beyaz,
  gölge `0 10px 24px rgba(79,70,229,.24)`.
  `joined === true` iken etiket **"Sunucuyu aç"** olur (§4.19) ve dokunuş sunucuyu açar
  (mevcut `openWorkspaceRoute(serverId, null)`).
- İkincil kare buton — `card` + `1px cardBorder`, `r16`, `padding: 14px 16px`,
  18px zincir ikonu `textSecondary` → davet bağlantısını kopyalar.

Sabit butonların altında içerik kalmasın: `contentContainerStyle` alt boşluğu
`26 + butonYüksekliği + safeArea.bottom`.

---

## 3. Davranış

1. Katıl → `POST mobile/servers/join` (mevcut uç, kod = davet slug'ı).
   Başarıda `joined = true` optimistik yazılır, toast `success`, buton "Sunucuyu aç".
   Hata: toast `error`, buton eski hâline.
2. Zaten üyeyse ekran doğrudan "Sunucuyu aç" ile açılır.
3. Paylaş/zincir butonları aynı bağlantıyı kopyalar; iki farklı davranış üretilmez.
4. Yükleniyor: banner + kart iskeleti. 404 (davet geçersiz): boş durum
   "Bu davet artık geçerli değil" + geri eylemi.

---

## 4. Testler

`component-tests/mobile-about-community-2g.test.tsx`:

- Banner 92px ve ikon `marginTop: -26` ile bindiriliyor; beyaz çerçeve 3px.
- Avatar yığınında bindirme `-9` ve her avatarda 2px kenar var.
- Ortak arkadaş yokken sosyal kanıt satırı render **edilmiyor**.
- Dört kanal satırının sağ uç durumları farklı ve doğru.
- `joined=false` → "Sunucuya katıl"; `joined=true` → "Sunucuyu aç".
- Katılma başarısında buton etiketi değişiyor.
- Paylaş butonu panoya doğru bağlantıyı yazıyor.
- 404'te boş durum.

`apps/web` içinden: `mobile/invites/[code]/preview/route-logic.test.ts`.

## 5. Doğrulama

```bash
pnpm --filter @wizards/mobile typecheck
```

```bash
pnpm --filter @wizards/web typecheck
```

```bash
npx jest component-tests/mobile-about-community-2g.test.tsx
```

## 6. Kabul kriterleri

33 (banner 92px, ikon `-26px` ile biniyor, beyaz çerçeve 3px) ·
34 (avatar yığınında `-9px` bindirme, 2px beyaz kenar) ·
27 (sabit alt buton ölçüleri) · 9 (grup etiketi) · 1 (kırpma yok).
