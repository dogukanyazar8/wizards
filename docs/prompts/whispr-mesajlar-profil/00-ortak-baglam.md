# 00 — Ortak bağlam

**Bu dosya uygulanmaz, okunur.** Her şerit prompt'u ilk satırında buraya işaret eder.

---

## 1. Otorite sırası

Bir değer iki kaynakta farklıysa üstteki kazanır ve fark `SPEC_DEVIATIONS`'a yazılır.

1. `design_handoff/mesajlar-paketi/referans/Mesajlar.dc.html` — her elemanın inline `style`
   değeri. §15 profil paneli `L950–L1300`, §16 üye ekle modalı `L1415–L1560`, §17 menüler
   `L520–L616`, toast `L617–L630`, başlık sessiz pill'i `L501`.
2. `design_handoff/mesajlar-paketi/SPEC-MESAJLAR.md` — ölçü, metin, davranış (§15, §16, §17).
3. `design_handoff/mesajlar-paketi/screens/13…22.png` — 10 yeni ekran, 1360×920, koyu tema, ×1.
4. `design_handoff/mesajlar-paketi/SPEC-ANA-SAYFA.md` §1 (token/tipografi) ve §8 (ölçekleme).
5. `design_handoff/mesajlar-paketi/referans/Mesajlar-referans.html` — çalışan kopya. İçeriği
   sıkıştırılmış gömülü veridir; **grep'lenmez**, tarayıcıda açılır.

`referans/support.js` tasarım aracının çalışma zamanıdır, ürün kodu değildir — kopyalanmaz.

## 2. Kapsam

**Yapılacak:** SPEC §15 (profil paneli 330), §16 (üye ekle modalı 560), §17 (başlık menüleri +
sessize alma + toast şeridi) ve bunların gerektirdiği veri katmanı.

**Yapılmayacak (dokunma):** sol sunucu rayı 74, gezinme paneli, kullanıcı barı, sohbet rayı 276,
Arkadaşlar görünümü, mesaj listesi, bestekar, anket kartı, thread paneli, arama paneli, grup
oluşturma modalı, anket modalı, boş durum. Bunlar §1–§14'tür ve **uygulandı**. Ş11 bunları
yalnız **doğrular**; bulduğu sapmayı rapora yazar, düzeltmeyi ayrı iş olarak önerir.

Mobil (React Native) **UI'ına dokunulmaz** — K1.

## 3. Doğrulanmış kod tabanı gerçekleri

Aşağıdakiler bu paket yazılmadan önce dosyadan okundu. Varsayım değil, kayıt.

1. `/messages/[conversationId]` rotası `DMConversationPage`
   (`components/dm/dm-conversation-page.tsx`, 309 satır) çiziyor. Sağ paneli **o** tutuyor.
2. `DMConversationPage` bugün üç panel çiziyor: `DmDetailsPanel` (498 satır), `DmGroupDetailsPanel`
   (390), `DmGroupSettingsPanel`. Başka tüketicisi **yok** (testleri hariç) — sökme yarıçapı bir
   dosya.
3. `DmConversation` başlığı yeni `components/messages/conversation-header.tsx` dosyasını
   kullanıyor. Props'unda `role?: DMParticipantRole` ve `onOpenMore?: () => void` **zaten var**;
   `onOpenMore` bir menü açmıyor.
4. `MessagesSidePanel` (`components/messages/messages-side-panel.tsx`) thread ve arama panelinin
   ortak kabuğu: başlık, kapat, `Esc`, `overlay` modunda focus tuzağı, açılışta başlığa focus.
   Genişliği `MESSAGES_METRICS.sidePanel` üzerinden okuyor.
5. `packages/types/src/messages-screen.ts` durum makinesini **taşıyor** (`MessagesScreenState`,
   `MessagesScreenAction`, reducer) ama **hiçbir bileşen tüketmiyor**. `DMConversationPage` iki
   ad-hoc `useState` kullanıyor (`isDetailsDrawerRequested`, `searchRequestId`).
6. `MessagesPanel = "thread" | "search" | null` — `"profile"` yok.
   `MessagesMenu` içinde `{ kind: "conversation" }` yuvası **var**, alt menü yuvası yok.
7. `MESSAGES_METRICS` (`lib/messages/metrics.ts`) §1–§9'u kapsıyor; `sidePanel`, `groupModal`,
   `pollModal`, `emptyState` blokları var. `profilePanel`, `inviteModal`, `moreMenu`, `toast`
   **yok**.
8. `SPEC_DEVIATIONS` 31 kayıt taşıyor ve dosya başındaki yorum sapmanın **neden** kayda geçtiğini
   anlatıyor. Yeni sapmalar aynı listeye, aynı biçimde yazılır.
9. `NAV_PANEL_ADJUSTMENTS` gezinme panelinin 228 → 280 genişlemesini kayda geçiriyor;
   `HOME_METRICS.sideScreens.dayPanelWidth` bu değere **bilerek** bağlı ve `metrics.test.ts`
   eşitliği zorluyor.
10. `User.bio` `VarChar(500)` — §15.3 `HAKKINDA` metninin kaynağı.
11. `DMConversation` şu alanları taşıyor: `ownerId`, `createdAt`, `description VarChar(120)`,
    `avatarColor VarChar(16)` (altı swatch **adı**, hex değil), `permAddMembers`,
    `historyVisibility`, `pinnedMessages`, `invite` (`GroupInvite`, `conversationId` unique).
12. `DMParticipant` şunları taşıyor: `role` (`DMParticipantRole`), `notifyLevel` (`DMNotifyLevel`),
    `muted: Boolean`, `joinedAt`, `nameColor VarChar(7)`. **`mutedUntil` yok.**
    `UserChannelSettings` ve `UserServerSettings` `mutedUntil DateTime?` taşıyor — emsal var.
13. `UserSettings.showReadReceipts: Boolean @default(true)` **var**; yazıyor göstergesi tercihi
    **yok**.
14. `FriendRequest` modeli arkadaşlığı taşıyor (`status: ACCEPTED`, `updatedAt` = kabul anı).
    Ayrı `Friendship` modeli yok. "Nerede tanıştınız" alanı **yok**.
15. `BADGE_IDS` tam **16** kayıt: `staff, verified, earlyMember, veteran, inviter, founder,
ideaShipped, bugHunter, contributor, streak, regular, voice, broadcaster, supporter,
betaTester, event`. SPEC'in `6 / 16` sayacı bu katalogla birebir tutuyor.
    `GET /api/v1/users/[userId]/badges` **var**.
16. `GET /api/v1/dm/users/[userId]/mutual-servers` **var**. Ortak **arkadaş** ucu yok
    (`server-public-profile-service.ts` sunucu için benzerini yapıyor, emsal orada).
17. `lib/dm/shared-media.ts` + `lib/dm/mobile-shared-media-service.ts` **var**;
    `/api/v1/mobile/dm/[conversationId]/attachments` **var**, web karşılığı **yok**.
    Web bugün paylaşılan medyayı `DmDetailsPanel` içinde **React Query önbelleğinden** türetiyor.
18. Grup uçları hazır: `groupSettingsRoute` (addPolicy + historyVisibility), `groupAddMembersRoute`,
    `groupRemoveMemberRoute`, `groupMemberRoleRoute`, `groupPinRoute`, `invite` + `invite/rotate`,
    `leaveGroupConversation`. **Yok:** geçmişi temizle, grubu sil.
19. `PATCH /api/v1/dm/[conversationId]/mute` gövdesi `{ muted: boolean }` — süre almıyor.
    `PATCH /api/v1/dm/[conversationId]/notify` ayrı uçtur.
20. Kullanıcı bildirme ucu yalnız mobilde: `POST /api/v1/mobile/users/[userId]/report`
    (`mobileUserReportRoute`). Web karşılığı yok. Engelleme ucu var:
    `/api/v1/friends/block/[userId]`.
21. i18n tek dosya çifti: `apps/web/src/lib/locale/messages/tr.ts` ve `en.ts`.

## 4. Bağlayıcı kararlar

Dördü kullanıcının kendi seçimidir (K1–K4); kalanı bu paketin kararıdır ve şeritler arası
sözleşmedir. Bir şerit karara **uymuyorsa** kodu değiştirmez, raporuna yazar.

- **K1 — Mobil = sözleşme + API paritesi.** Yeni her uç `/api/v1/mobile/*` karşılığıyla birlikte
  yazılır ve `@wizards/types` şemasını paylaşır. Mobil **ekran** dosyası bu pakette
  **değişmez**. `apps/mobile/src/app/screens/**` hiçbir şeridin yazma listesinde yer almaz.
- **K2 — Şifreleme satırı gerçeği söyler.** §15.5'in `Uçtan uca şifreli` satırı
  `Aktarımda şifreli` olur, alt satırı `TLS 1.3 · sunucuda şifreli saklanır`. Ölçü, ikon karosu,
  yeşil zemin ve `Aktif` pill'i **tasarımdaki gibi kalır**. Ürün E2EE yapmıyor; yapmadığı bir şeyi
  iddia eden bir satır yayınlanmaz. `SPEC_DEVIATIONS` içine metin sapması olarak yazılır.
- **K3 — Gezinme paneli 280'de kalır.** SPEC 228 diyor; panel bu paketin kapsamı dışında ve
  genişliği Ana Sayfa ile Etkinlikler gün paneline bağlı. `NAV_PANEL_ADJUSTMENTS` yorumu yeni
  paketi de anacak şekilde güncellenir, değer değişmez.
- **K4 — Tek profil paneli.** `DmDetailsPanel`, `DmGroupDetailsPanel` ve `DmGroupSettingsPanel`
  **silinir**; yerine tek `ConversationProfilePanel` gelir (DM 3 sekme, grup 4 sekme). Eski
  testlerin doğruladığı davranışlar yeni panelin testine taşınır — silinmez.
- **K5 — Profil paneli sağ panel yuvasını paylaşır.** `MessagesSidePanel` kabuğu kullanılır,
  genişlik `sidePanel.profileWidth = 330` ayrı kayıttır (thread/arama 340 kalır). `panel` tek
  yuvadır: profil açılırken thread ve arama **kapanır**.
- **K6 — "Tanıştınız" satırı türetilir, kolon eklenmez.** Kaynak: iki tarafın **ortak** sunucu
  üyeliklerinden `ServerMember.joinedAt` en eskisi. Ortak sunucu yoksa satırın ikinci cümlesi
  düşer, tarih cümlesi kalır.
- **K7 — Arkadaşlık tarihi `FriendRequest.updatedAt` (status `ACCEPTED`).** İki kullanıcı arkadaş
  değilse tarih kartı **çizilmez** (yerine boş satır konmaz, bölüm atlanır).
- **K8 — Süreli sessize alma `DMParticipant.mutedUntil` ile.** `muted: Boolean` korunur ve
  `notifyLevel` ile **aynı update içinde** yazılır (mevcut kural bozulmaz). `Süresiz` =
  `muted: true, mutedUntil: null`. Süre dolmuşsa okuma tarafı sessizliği **yok sayar** ve tembel
  temizler; ayrı bir sweep yazılmaz.
- **K9 — `UserSettings.showTypingIndicator Boolean @default(true)`** yeni kolondur.
  `showReadReceipts` zaten var, ikinci kolon açılmaz.
- **K10 — Rozet kartı yeniden yazılmaz.** Ayarlar ekranının rozet kartı 26px karo + 11.5 etiket
  varyantıyla kullanılır; `ProfileBadgeGrid` yalnız ızgara sarmalayıcısıdır. Sayaç
  `kazanılan / 16`, payda `BADGE_IDS.length` üzerinden okunur — sabit yazılmaz.
- **K11 — Paylaşılan medya tek servise iner.** `lib/dm/shared-media.ts` ortak otorite olur;
  mobil route-logic'i ona indirgenir, web route'u eklenir. React Query önbelleğinden türetme
  **kalkar** (önbellek sayfalanmış ve eksiktir; panel 18 medya + `+12` örtüsü istiyor).
- **K12 — Web bildirme ucu açılır.** `POST /api/v1/users/[userId]/report`, mobil route-logic'inin
  dayandığı servisi paylaşır. İki uç aynı `AuditLog` / moderasyon vakasını üretir.
- **K13 — Toast 5 sn sonra kapanır.** SPEC 4–6 sn aralığı verdi; tek değer seçildi. `role="status"`,
  `aria-live="polite"`, kapat düğmesi `aria-label` taşır. Görünüm ya da sohbet değişince temizlenir
  (`dc.html` içindeki `go()` bunu yapıyor).
- **K14 — Durum makinesi tek sahibe iner.** `DMConversationPage`, `messages-screen.ts` reducer'ını
  tüketir; `isDetailsDrawerRequested` ve `searchRequestId` reducer'a katlanır. Yeni eksenler
  (`ptab`, `role`, `mutedUntil`, `toast`, `privacy`, `inviteSelection`, `inviteLinkExpiry`) yalnız
  reducer'da yaşar. Yeni bir ad-hoc `useState` açılmaz.
- **K15 — `Süresiz` toast metni `dc.html` dosyasından gelir:** `Sohbet süresiz sessize alındı`.
  SPEC §17'nin toast listesinde bu satır yok; otorite sırası gereği HTML kazanır ve sapma kayda
  geçer.
- **K16 — Sayfalama sözleşmesi.** Yeni liste uçları (medya, dosya, bağlantı, aday, üye) **imleçli**
  döner (`{ items, nextCursor }`); `offset` kullanılmaz. Mevcut DM uçlarının imleç biçimi taklit
  edilir, yeni bir biçim icat edilmez.

## 5. Kurallar

1. **Token zorunlu.** Yalnız `hsl(var(--token))` / `hsl(var(--token)/alfa)`. Yeni hex, yeni token,
   yeni tema sınıfı yok.
2. **Ölçü sözlüğünden oku.** Bileşen içinde çıplak px yok. `MESSAGES_METRICS.*` + `pxToRem` /
   `pxToEm` / `hairline`. Arbitrary Tailwind px (`w-[330px]`, `text-[13px]`) yazılmaz.
3. **Metin i18n içinden.** JSX'e gömülü Türkçe yok. TR karşılığı SPEC'teki metnin **birebir
   aynısı** (K2'nin şifreleme satırı hariç). EN karşılığı da yazılır.
4. **Mevcut bileşen kullanılır.** `Avatar`, `Badge`, `Button`, `Input`, `Textarea`, `Modal`,
   `Skeleton`, `ContextMenu` + `ContextMenuItem` + `ContextMenuSeparator`, `MessagesSidePanel`,
   `WindowCloseButton`. Yeni yazılacaklar: `ConversationProfilePanel`, `ProfileBadgeGrid`,
   `PrivacySettingsCard`, `AddMembersModal`, `ConversationMoreMenu`, `ConversationToast`.
5. **Avatar tinti tek yardımcıdan.** Kişi başına sabit tint (primary · success · warning · danger ·
   nötr) sohbet rayı, profil paneli, üye listesi ve üye ekle modalında **aynı** yardımcıdan gelir.
   Profil başlığında gri DS avatarı kullanılmaz. Yardımcı yoksa Ş5 yazar, diğer şeritler tüketir.
6. **Erişilebilirlik.** Tıklanabilir her satır gerçek `button` / `a`; ikon-only butonlarda
   `aria-label`; menü ve modal klavyeyle gezilir (`Esc` kapatır, focus tuzağı, açılışta ilk öğeye
   focus, kapanışta tetikleyiciye dönüş); focus stili `ring-ring`; presence noktasının metin
   karşılığı var; anahtarlar gerçek `role="switch"` + `aria-checked`; radyo kartları gerçek
   `role="radio"` + `radiogroup`.
7. **Performans.** Profil paneli sekme gövdeleri **tembel**: seçilmeyen sekmenin sorgusu koşmaz.
   Medya ızgarası `loading="lazy"`. Panel açılışı mesaj listesini yeniden render etmez. Her bölüm
   kendi `Skeleton` bileşenini gösterir; biri geciktiğinde panelin kalanı beklemez.
8. **Güvenlik.** Her yeni uç: `requireApiUserId` → `enforceApiRateLimit` → zod ile gövde/param →
   **üyelik ve rol kontrolü** → iş. Yönetici satırları (`Geçmişi temizle`, `Grubu sil`, rol
   değişimi) sunucuda **yeniden** doğrulanır; istemcinin `role: admin` demesi yetmez. Yıkıcı
   uçlar `AuditLog` yazar. Kullanıcı adı, e-posta, IP gibi alanlar yanıtta yer almaz.
9. **Yalnız kendi dosyalarına yaz.** Prompt'un "Sahiplenilen dosyalar" listesi dışına çıkma.
   Ortak dosya (`metrics.ts`, `messages-screen.ts`, `tr.ts`, `en.ts`) yalnız Dalga 0'da yazılır.
10. **`TODO(api):`** yalnız gerçekten karşılığı olmayan alan için. Uydurma endpoint çağrılmaz.

## 6. Tuzaklar

1. **`Mesajlar-referans.html` grep'lenmez** — 3.2 MB, gömülü veri sıkıştırılmış. Değer aramak için
   `Mesajlar.dc.html` kullanılır (2120 satır, inline `style`, okunur).
2. **`referans/support.js` ürün kodu değil.** Tasarım aracının kendi runtime'ı. Kopyalanmaz.
3. **`dc.html` içindeki `go()` (`L1706`) ürün kuralı DEĞİLDİR.** (Dalga 0'da düzeltildi.)
   `go()` referans dosyanın üstündeki **inceleme çiplerini** sürer ve SPEC o çipler için "ürüne
   taşınmaz" diyor. Ürün kuralı §12'nin cümlesidir: **"panel durumu sohbet değişince korunur"**.
   Reducer buna göre yazıldı — sohbet değişince `panel` ve `profileTab` **kalır**; `threadRootId`,
   `toast` ve DM'de `uyeler` sekmesi düşer. Gerçek görünüm değişimi (`openFriends`/`openEmpty`)
   hepsini sıfırlar.
4. **`avatarColor` hex değil, swatch adı.** `VarChar(16)` genişliği bunun için. Renk ham yazılmaz.
5. **`DMParticipant.muted` ile `notifyLevel` ikizdir** — biri yazılıp diğeri yazılmazsa bildirim
   davranışı ile arayüz ayrışır. Aynı update içinde yazılır.
6. **`metrics.test.ts` gezinme paneli genişliğini Etkinlikler gün paneline eşitliyor.** Oraya
   dokunan bir değişiklik iki ekranı birden kırar (K3).
7. **RNTL 14 async** — mobil bileşen testi yazılacaksa `render()` ve `fireEvent.*` `await` edilir.
   Bu pakette mobil UI testi yok; kural yine de geçerlidir.
8. **`typecheck` pnpm üzerinden koşar.** `npm run typecheck` derlemeye başlamadan sürüm
   karşılaştırmasında ölür ve sahte bir "hata" verir.
9. **Prisma yalnız `prisma/rebaseline-migrations` klasörünü okur** — migration oraya yazılır.
10. **Profil paneli 330, thread/arama 340.** Tek sabit sanıp `sidePanelWidth` değerini değiştirmek
    thread ve arama panelini de daraltır ve §6 parity'sini kırar.
11. **Rozet sayacı payda sabiti değil.** `6 / 16` içindeki 16 `BADGE_IDS.length` üzerinden okunur;
    katalog büyüdüğünde metin kendiliğinden doğru kalır.

## 6b. Dalga 0'ın getirdiği altı düzeltme

Bu paket yazılırken varsayılan altı şey koda dokununca farklı çıktı. Ayrıntı:
`raporlar/01-rapor.md`.

1. **`go()` ürün kuralı değil** — tuzak 3 yukarıda güncellendi.
2. **`MuteDuration` adı doluydu.** `settings.ts` `1h/8h/24h/forever` merdivenini o adla taşıyor.
   §17'nin merdiveni **`ConversationMuteDuration`** / `ConversationMuteDurationSchema` /
   `CONVERSATION_MUTE_DURATION_MINUTES` adıyla yaşıyor. Ş4 ve Ş9 bu adı kullanır.
3. **Rozet adı ve açıklaması i18n'de değil** — `BADGE_CATALOG.copy` (`@wizards/types`) taşıyor ve
   o dosya "sözlüklerde bilerek yoktur" diyor. Altı rozetin **adı** SPEC ile birebir; açıklamalar
   katalogda daha uzun ve katalog kazanır. Ş6 `title` metnini katalogdan okur, i18n'e rozet
   anahtarı **eklemez**.
4. **`GROUP_DM_MAX_PARTICIPANTS = 250` ve `GroupDMAddMembersRequestSchema` zaten var**
   (`group-dm.ts`). Ş10 yeni bir ekleme şeması yazmaz.
5. **`MobileUserReportRequestSchema` zaten paylaşımda.** Ş4 web ucunu o şemayla açar.
6. **Toast, sabitlenen mesaj şeridinin ÜSTÜNDE.** HTML onu başlığın hemen altına koyuyor;
   SPEC'in "sabitlenen şeridin altında" cümlesi HTML'e yenildi. Ş9 buna göre yerleştirir.

Ayrıca Dalga 0'ın sözlüğe koyduğu ve şeritlerin okuyacağı üç ad:
`MESSAGES_METRICS.sidePanel.profileWidth` (330), `MESSAGES_METRICS.profilePanel`,
`MESSAGES_METRICS.inviteModal`, `MESSAGES_METRICS.moreMenu`, `MESSAGES_METRICS.toast`.

## 7. Kalite çıtası

Bir şerit "bitti" diyebilmek için:

- `pnpm --filter @wizards/web typecheck` temiz (yeni hata yok).
- `pnpm --filter @wizards/web test` yeşil; şeridin yeni bileşen / uç dosyalarının **her biri** için
  test var.
- `pnpm --filter @wizards/types test` yeşil (Dalga 0 ve tip dokunan şeritler).
- Yeni metin `tr.ts` **ve** `en.ts` içinde; JSX'te gömülü dize yok.
- Yeni ölçü `MESSAGES_METRICS` içinde; bileşende çıplak px yok.
- Şeridin ekranı koyu **ve** açık temada 1360×920'de kaydırmasız, kırpmasız.
- `raporlar/NN-rapor.md` yazıldı.

Commit **atılmaz** — kullanıcı açıkça istemedikçe.
