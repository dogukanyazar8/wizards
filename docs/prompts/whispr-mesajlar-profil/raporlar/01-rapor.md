# Dalga 0 — sözleşme katmanı · rapor

**Tarih:** 2026-08-27 · **Dal:** `uat` · **Durum:** dört şerit de bitti, kapı yeşil. Commit atılmadı.

## Kapı

| Komut                                      | Sonuç                                                        |
| ------------------------------------------ | ------------------------------------------------------------ |
| `pnpm --filter @wizards/types test`        | 618 / 618                                                    |
| `pnpm --filter @wizards/db test`           | 158 / 158                                                    |
| `pnpm --filter @wizards/web test`          | 7732 geçti · 0 hata · 3 atlandı (önceden atlanıyordu)        |
| `pnpm --filter @wizards/web typecheck`     | temiz                                                        |
| `prisma migrate deploy` + `migrate status` | migration yerel DB'de koştu, "Database schema is up to date" |

---

## Ş0.1 — Ölçü sözlüğü

`apps/web/src/lib/messages/metrics.ts` + `metrics.test.ts`.

Dört yeni blok, değerler `Mesajlar.dc.html` inline `style` değerlerinden okundu:

- **`profilePanel`** (§15) — başlık, kimlik bloğu (DM 72px daire / grup 66px radius 22), sekme
  şeridi, kaydıran gövde, rozet ızgarası, tarih kartı, ortak listeler, sabitlenenler, üyeler,
  medya, ayarlar (bildirim radyoları + gizlilik kartı + segment + tehlike satırları).
- **`inviteModal`** (§16) — kabuk, arama, çipler, aday satırları, zaten-üye yığını, bağlantı
  kutusu, alt bar.
- **`moreMenu`** (§17) — DM 254 / grup 262, başlık bloğu, satırlar, `YÖNETİM` bölüm etiketi,
  alt menü, başlıktaki sessiz pill'i.
- **`toast`** (§17) — şerit ölçüleri + `autoCloseMs: 5000` (K13).

Ayrıca: `sidePanel.profileWidth = 330` eklendi (`width: 340` **değişmedi**),
`shadow.headerMenu` ve `shadow.profileGroupTile` eklendi.

**Testler (25/25).** Yeni olanlar: profil paneli genişliğinin thread/aramadan ayrı olduğu,
presence halkasının içten dışa büyüdüğü, anahtar topuzunun iki uçta da rayın içinde kaldığı
(`3 + 18 + 19 === 40`), gizlilik satırının ikon/kontrol kolonlarını hizalayacak kadar yüksek
olduğu, medya örtüsünün ızgaranın son karosuna denk geldiği (`3 × 2 = 6`), üye ekle modalının
grup modalıyla aynı kabuk ölçülerini paylaştığı, alt menü girintisinin `9 + 16 + 11 = 36`
olduğu, toast'ın SPEC'in 4–6 sn aralığında kaldığı.

`SIGNED_LEAVES` listesine `memberStackOverlap` eklendi — §16'nın binişik yığını negatif margin
kullanıyor ve "ölçüler pozitiftir" testi onu yazım hatası sanıyordu.

### Kayda geçen sapmalar

Sayısal sapma **çıkmadı**: §15–§17'nin HTML değerleri SPEC'in verdiği her ölçüyle tutuyor.
Sayıya dökülemeyen beş sapma dosya başındaki yorum listesine yazıldı:

1. Bölüm etiketi harf aralığı SPEC'te `0.15em`, HTML'de profil panelinde ve üye ekle modalında
   `0.14em` (menüdeki `YÖNETİM` `0.15em` kalıyor). Sözlük ikisini de HTML'den alır — ve kod
   tabanı bu `0.14em` değerini zaten §1–§14'te sessizce kullanıyordu.
2. **Toast şeridinin yeri.** SPEC "başlığın (ve sabitlenen şeridin) altında" diyor; HTML onu
   başlığın **altına**, sabitlenen şeridin **üstüne** koyuyor. HTML kazanır.
3. `Süresiz` sessizliğin toast metni SPEC'in on iki satırlık listesinde yok; HTML
   `Sohbet süresiz sessize alındı` basıyor (K15).
4. §15.5'in ilk gizlilik satırı metni (K2) — aşağıda.
5. HTML'in state'i `priv: { read, typing, media }` taşıyor ama kart yalnız iki satır çiziyor;
   `media` ölü alan, ürüne taşınmadı.

`NAV_PANEL_ADJUSTMENTS` yorumu güncellendi: yeni tur da 228 diyor, değer K3 ile 280'de kalıyor.
Dosya başlığındaki kaynak yolu `app_new/mesajlar-paketi` → `mesajlar-paketi` olarak düzeltildi ve
iki turun ilişkisi yorumda anlatıldı.

---

## Ş0.2 — Migration

`packages/db/prisma/rebaseline-migrations/20260827120000_messages_profile_panel/migration.sql`.

İki kolon:

- `DMParticipant.mutedUntil DateTime?` — K8. `muted` korunuyor: `Süresiz` =
  `muted = true, mutedUntil = null`. Index eklenmedi ve **gerekçesi şema yorumunda** yazılı
  (üzerinde filtre yok; değer her zaman zaten okunmuş bir satırda değerlendirilir).
- `UserSettings.showTypingIndicator Boolean @default(true)` — K9.

Geri doldurma yok: biri nullable, diğeri default'lu.

`schema-messages-screen.test.mjs` iki migration'ı ayrı ayrı okuyacak şekilde genişletildi
(§1–§14 turu `_messages_screen`, bu tur `_messages_profile_panel`) ve dokuz yeni beklenti eklendi:
kolonların varlığı, `muted`'ın düşürülmediği, index açılmadığı, geri doldurma yapılmadığı,
şifreleme satırı için **üçüncü bir kolon açılmadığı** (o bir durum, tercih değil).

Migration yerel `wizards` veritabanında `migrate deploy` ile koştu; `migrate status` "up to date".

---

## Ş0.3 — `@wizards/types`

`packages/types/src/messages-screen.ts` + testi. **`index.ts` değişmedi** (`export *` zaten var).

### Durum eksenleri

`MessagesPanel` += `"profile"`; `ProfilePanelTab` + `PROFILE_PANEL_TABS`; `MessagesModal` +=
`{ kind: "invite" }`; `MessagesMenu` += `{ kind: "conversationMore" }` ve `{ kind: "muteSubmenu" }`
(mevcut `{ kind: "conversation" }` **kaldı** — o ray satırının menüsü, yenisi başlığınki).

`MessagesScreenState` yeni alanlar: `profileTab`, `role`, `muted`, `mutedUntil`, `toast`,
`privacy`, `inviteSelection`, `inviteLinkExpiry`, `detailsDrawerOpen`, `searchRequestId`.
Son ikisi K14'ün katladığı `DMConversationPage` `useState`'leri.

On dört yeni action: `openProfile`, `setProfileTab`, `openMuteSubmenu`, `setRole`, `setMute`,
`showToast`, `dismissToast`, `setPrivacy`, `toggleInviteSelection`, `clearInviteSelection`,
`setInviteLinkExpiry`, `openDetailsDrawer`, `closeDetailsDrawer`, `bumpSearchRequest`.

### DTO'lar

`ProfileTintSchema` · `ConversationMuteDurationSchema` · `InviteLinkExpirySchema` ·
`ConversationToastKindSchema` + `ConversationToastSchema` · `ConversationPrivacySchema` ·
`UpdatePrivacyRequestSchema` · `SetMutedRequestSchema` · `ProfileFriendshipSchema` ·
`ProfileMutualServerSchema` · `ProfileMutualFriendSchema` · `UserProfilePanelDTOSchema` ·
`GroupProfilePanelDTOSchema` · `GroupMemberRowDTOSchema` + `GroupMemberPageSchema` ·
`SharedMediaKindSchema` + üç öğe şeması + `SharedMediaPageSchema` ·
`InviteCandidateDTOSchema` + `InviteCandidatePageSchema`.

Yardımcılar: `normalizeProfileTab`, `isMuteActive`, `resolveMutedUntil`,
`CONVERSATION_MUTE_DURATION_MINUTES`, `PROFILE_MEDIA_PREVIEW_COUNT`.

**34 yeni test** (toplam 54, dosya bazında). Kapsanan davranışlar: profil thread/aramayı kapatır,
menü satırı paneli doğru sekmeyle açar, ikinci açış paneli kapatmaz, DM'de `uyeler` seçilemez,
gruptan DM'e geçince sekme genele düşer, alt menü ana menü kapalıyken açılmaz, süre seçimi menüyü
kapatır, sessizliği kaldırmak bitiş anını siler, dört sürenin dördü doğru bitiş anını üretir,
modal kapanınca yalnız `invite` seçimi düşer, eski mute gövdesi hâlâ geçerli.

---

## Ş0.4 — i18n

`tr.ts` ve `en.ts`, `messages.errors.suggestionsFailed` satırının hemen altına.
Dört ağaç: `messages.profile.*` (86 anahtar), `messages.more.*` (26), `messages.invite.*` (21),
`messages.toast.*` (15). TR metinleri SPEC'ten birebir; EN karşılıkları yazıldı.

Anahtar paritesi doğrulandı: **tr 4646 = en 4646**, iki yönde de eksik yok.

---

## Sonraki dalgaların bilmesi gereken altı düzeltme

Prompt paketi yazılırken varsayılan altı şey kodda farklı çıktı. `00-ortak-baglam.md` güncellendi.

1. **`go()` ürün kuralı değil.** Paket "tuzak 3" olarak `dc.html`'in `go()` fonksiyonunu ürün
   davranışı sayıyordu (görünüm değişince `panel` sıfırlanır). `go()` referans dosyanın üstündeki
   **inceleme çiplerini** süren yardımcıdır ve SPEC o çipler için "ürüne taşınmaz" diyor.
   Ürün kuralı SPEC §12'nin cümlesidir: **"panel durumu sohbet değişince korunur"**. Reducer
   böyle yazıldı: sohbet değişince `panel` ve `profileTab` **kalır**; `threadRootId` (eski
   sohbetin mesajını gösteriyor), `toast` (eski sohbette yapılan işi bildiriyor) ve DM'de
   `uyeler` sekmesi düşer. Gerçek görünüm değişimi (`openFriends` / `openEmpty`) hepsini sıfırlar.
2. **`MuteDuration` adı doluydu.** `settings.ts` `1h/8h/24h/forever` merdivenini bu adla taşıyor
   (bildirim istisnasının varsayılan süresi) — §17'nin `15m/1h/8h/forever` merdiveni farklı bir
   şey. Yeni tip **`ConversationMuteDuration`** / `ConversationMuteDurationSchema` /
   `CONVERSATION_MUTE_DURATION_MINUTES` adını aldı. Ş4 ve Ş9 bu adı kullanır.
3. **Rozet metni i18n'de değil.** `BADGE_CATALOG.copy` (`@wizards/types`) her iki platformun
   rozet adı ve açıklamasını taşıyor ve dosya "sözlüklerde bilerek yoktur" diyor. Altı rozetin
   **adı** SPEC ile birebir aynı; **açıklamaları** katalogda daha uzun (`Doğrulanmış` →
   `E-postanı doğruladın ve iki adımlı doğrulamayı açtın.`). Katalog kazanır; i18n'e rozet
   anahtarı **eklenmedi**. Ş6 `title` metnini katalogdan okur.
4. **Üye ekleme şeması zaten var.** `GROUP_DM_MAX_PARTICIPANTS = 250` ve
   `GroupDMAddMembersRequestSchema` `group-dm.ts` içinde duruyor. Dalga 0 yeni bir
   `AddMembersRequestSchema` **yazmadı**; Ş10 mevcut olanı kullanır.
5. **Bildirme gövdesi zaten paylaşımda.** `MobileUserReportRequestSchema` ve
   `MobileUserReportResponseSchema` `@wizards/types` içinde. Ş4 web ucunu bu şemayla açar,
   yeni bir gövde tanımlamaz.
6. **Toast sabitlenen şeridin üstünde.** Ş9 şeridi başlığın hemen altına, sabitlenen mesaj
   şeridinin **üstüne** koyar (Ş0.1 sapma #2).

## Açık kalan

Yok. Dalga 1'in dört şeridi paralel başlayabilir.
