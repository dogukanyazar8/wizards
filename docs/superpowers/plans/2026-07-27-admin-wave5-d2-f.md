# Admin Dalga 5 — D2 Delil Sözleşmesi + F Desktop/Mobil Yüzeyler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** D2: içerik raporu (delil snapshot + itiraz + saklama). F: mobil vaka refakatçisi + desktop konsol penceresi.

**Architecture:** D2 mobil rapor sözleşmesini geriye dönük uyumlu genişletir; sunucu erişimi doğrulamadan snapshot yazmaz. F iki auth yolunu tek capability haritasında birleştirir (`requireMobileAdminCapability`); desktop `voice-mini` pencere desenini kopyalar, web rotasını `?surface=console` kompakt modda yükler.

**Spec'ler:** `2026-07-26-admin-moderation-design.md` §D2, `2026-07-26-admin-desktop-mobile-design.md` (F), G harita (üç yüz).

## Global Constraints

- Commit YOK. TDD. `.strict()` şemalar korunur — alan ekleme opsiyonel alanlarla.
- Mobil aksiyon seti bağlayıcı: yalnızca **üstlen / reddet / web'e yükselt**. Ban ve mesaj silme mobil uçlarda YOK.
- Yetki kararı asla istemcide verilmez; görünürlük bayrağı yalnızca arayüz.

---

## D2 — Delil (Görev 1-4)

### Task 1: Rapor sözleşmesi genişletmesi

**Files:** Modify `packages/types/src/mobile-social.ts:637` (`MobileUserReportRequestSchema` — `messageId/dmMessageId/attachmentId` `MobileBoundedIdSchema.optional()`, `.strict()` kalır); Modify mobil rapor sheet'i (rapor gönderen bileşen — uygulama sırasında `graphify query "mobile user report sheet submit"`); Test `packages/types` + kontrat testleri

- [x] Kırmızı: yalnızca `reason`+`details` gönderen eski istemci parse olur (spec test 12 — geriye dönük uyum).
- [x] Mobil taraf: mesaj bağlamından raporda `messageId` gönderimi (uzun bas → bildir akışı varsa oradan; yoksa profil raporu davranışı değişmez).
- [x] `pnpm --filter @wizards/types test` + mobil testler. Checkpoint.

### Task 2: Erişim doğrulama + snapshot yazımı

**Files:** Modify `apps/web/src/lib/social/mobile-user-profile-service.ts` (rapor kabulü); Create `apps/web/src/lib/moderation/evidence-service.ts`; Test

**Interfaces (Produces):**

```ts
export async function captureEvidenceForReport(args: {
  reportId: string;
  caseId: string;
  reporterId: string;
  messageId?: string;
  dmMessageId?: string;
  attachmentId?: string;
}): Promise<{ captured: boolean }>; // erişim doğrulanamazsa captured:false, alan yok sayılır, rapor yine kaydedilir
```

- [x] Kırmızı — **güvenlik testi** (spec test 13): raporcunun göremediği `messageId` → snapshot YAZILMAZ, rapor kaydedilir. Erişim: kanal mesajı → raporcu `ServerMember` + kanal izni (`resolveChannelPermissions`), DM → `DMParticipant`.
- [x] Snapshot içeriği: mesaj metni, gönderen id+handle, kanal/DM kimliği, zaman, ek URL'leri — `ModerationEvidence.snapshot` Json.
- [x] Delil dayanıklılığı: kaynak `Message` silinse de vaka gösterir (test 14).
- [x] Checkpoint.

### Task 3: Delil kartları + "Mesaj sil" aksiyonu + saklama

**Files:** Modify `.../sections/admin-case-file.tsx` (delil kartı: snapshot içerik, "kaynak silinmiş" rozeti); Modify `case-actions.ts` (+`delete_message`: `Message.deletedAt` işaretle — yalnızca delilli vakada); Outbox `moderation.evidence_purge` günlük iş: `evidencePurgeAt < now` → yalnızca `ModerationEvidence` silinir, vaka+olaylar kalır (test 15); vaka kapanışında `evidencePurgeAt = kapanış + 180 gün`

- [x] Checkpoint.

### Task 4: İtiraz akışı

**Files:** Create `apps/web/src/app/api/v1/moderation/appeal/route.ts` (banlı kullanıcı POST — kimlik: banlı oturum özel yolu; `APPEALED` + `APPEAL_OPENED` olayı); banlı web girişinde itiraz ekranı (login redirect'te banlı durum sayfası — uygulama sırasında mevcut banlı akışı `graphify query "banned user login redirect"`); vaka dosyasında itiraz çözümleme (`APPEAL_RESOLVED` → `ACTIONED|DISMISSED`)

- [x] İtiraz ayrı kuyruk değil — kuyruk `APPEALED` filtresi. D2 kapanış: mobil mesaj raporu → delil kartı; kaynak silinince kart kalıyor.
- [x] Checkpoint.

---

## F — Desktop + mobil (Görev 5-9)

### Task 5: `requireMobileAdminCapability`

**Files:** Modify `apps/web/src/lib/admin/access.ts` (veya `capabilities.ts`); Test

**Interfaces (Produces):**

```ts
export async function requireMobileAdminCapability(
  request: Request,
  capability: AdminCapability,
): Promise<AdminAccessUser>;
// requireMobileApiSession(request) → userId → AdminMembership → ADMIN_CAPABILITIES kontrolü
```

- [x] Kırmızı (F test 2b/2c): geçerli Bearer admin → 200; çerezsiz istek `requireAdminUser` yolunda 401; aynı capability web+mobil aynı rol listesini uygular (tablo testi).
- [x] Checkpoint.

### Task 6: Mobil vaka API'leri

**Files:** Create `apps/web/src/app/api/v1/mobile/admin/cases/route.ts` (GET liste — açık vakalar, öncelik+yaş sıralı, filtre yok); `.../cases/[caseId]/route.ts` (GET detay — D1 alanları + delil özetleri); `.../cases/[caseId]/claim/route.ts`; `.../cases/[caseId]/dismiss/route.ts` (neden zorunlu); `.../cases/[caseId]/escalate/route.ts` (→ `HIGH/URGENT` + "masaüstünde karar bekliyor" olayı); Types: `packages/types/src/mobile-admin.ts` zod şemaları; bootstrap yanıtına `isAdmin` bayrağı

- [x] Kırmızı (F test 1-3): admin olmayan → 403; bayrak elle `true` olsa da uç 403; **ban/mesaj-sil ucu YOK** — rota listesi testle sabitlenir (yalnızca list/detail/claim/dismiss/escalate).
- [x] Üstlenme yarışı D1 koşullu güncellemesinden geçer (test 10).
- [x] Checkpoint.

### Task 7: Mobil ekranlar + derin bağlantı + bildirim

**Files:** Modify `apps/mobile/src/navigation/mobile-navigation-types.ts` (+`AdminIncidents`, `AdminIncidentDetail: { caseId }` kök yığın rotaları — MainTabs sekmesi DEĞİL); Modify `apps/mobile/src/navigation/mobile-linking.ts` (+`whispr://admin/case/:caseId`); Create `apps/mobile/src/admin/` — `mobile-admin-cases-screen.tsx`, `mobile-admin-case-detail-screen.tsx`, query/mutation hook'ları, `.styles.ts`; ayarlar ekranına admin satırı (bootstrap `isAdmin` bayrağıyla görünür); push: vaka `URGENT` veya 24s+ `OPEN` → admin üyelerine `NotificationType.MODERATION`, `dedupeKey: \`modcase:{caseId}:alert:{yyyymmdd}\`` (F test 5 — 24 saatte tek)

- [x] Mobil tasarım: **mobil uygulamanın kendi dili** (G §9 — web paneli kopyalanmaz); dikey akış, yan panel yok; üç aksiyon düğmesi.
- [x] Çevrimdışı: son önbellek gösterilir, aksiyon düğmeleri devre dışı, istek atılmaz (F test 6 — kuyruk YOK).
- [x] Derin bağlantı testi: yetkisizde güvenli ekrana düşer (F test 4).
- [x] Mobil typecheck + jest/node testleri (RNTL await gotcha). Checkpoint.

### Task 8: Desktop konsol penceresi

**Files:** Create `apps/desktop/src-tauri/capabilities/admin-console.json` (`voice-mini.json` şablonundan; pencere `admin-console`); Modify `apps/desktop/src-tauri/tauri.conf.json` (`security.capabilities` + `"admin-console"`); Modify `apps/desktop/src-tauri/src/lib.rs` — konsol aç/kapa komutu (`desktop_app_url_with_path("/admin/moderation?surface=console")`, `WebviewWindowBuilder` `voice-mini` deseni `:3227` referans), `is_authorized_desktop_command_window_label:751` genişletmesi — konsol yalnızca kendi komutlarını çağırır (F test 7); Web: `?surface=console` → sol nav gizli + yoğun satır (layout query param okuma, G test 9 muadili F test 9); web admin arayüzünde "Konsolu ayır" düğmesi (yalnızca desktop'ta görünür — mevcut desktop experience köprüsü)

- [x] Rust testleri mevcut desen (`cargo test` — apps/desktop scripts release testlerine dokunma); pencere komut yetki testi.
- [x] Checkpoint.

### Task 9: Tepsi rozeti + kapanış

**Files:** Modify `lib.rs` tepsi ipucu (`tray_tooltip:387` bölgesi) — açık vaka sayısı **sunucudan** socket olayıyla (`admin:open-case-count` — web tarafı D1 sayısını yayınlar; desktop yalnızca gösterir, hesaplamaz — F test 8); global kısayol: mevcut `allow-configure-desktop-voice-shortcuts` deseniyle yapılandırılabilir konsol kısayolu

- [x] Dalga kapanışı: web+db+types+mobile typecheck/test, desktop `pnpm --filter` testleri, `graphify update .`, uçtan uca kanıt raporu (F bitti kanıtı: URGENT vaka → telefonda bildirim → dokun → detay → Üstlen → web'de anında görünür).

## D2 + F5-F6 uygulama notları

- **Delil erişim kuralı kodda:** `captureEvidenceForReport` kanal mesajı için `ServerMember`, DM için `DMParticipant` arar; bulamazsa **rapor yine kaydedilir, snapshot yazılmaz**. Rapor ucu böylece özel konuşma okuma aracına dönüşemez.
- Snapshot kaynağından bağımsız yaşar: vaka dosyası `sourceDeleted` rozetiyle gösterir, "Mesaj sil" yalnız canlı kaynakta çıkar.
- **Saklama:** vaka kapanışında `evidencePurgeAt = kapanış + 180 gün`; outbox worker'ın saatlik bakımı yalnızca `ModerationEvidence` siler, vaka ve olaylar kalır.
- **İtiraz ayrı kuyruk değil:** kuyruğa `İtiraz` filtre çipi eklendi (`scope=appealed` → `APPEALED`). Banlı kullanıcı `/suspended` ekranından tek itiraz açar; ikinci itiraz 409.
- Banlı oturum `requireApiUserId`'den 403 alır, bu yüzden itiraz ucu için `requireBannedApiUserId` eklendi (banlı olmayan çağıran 409 alır) ve rota sözleşme desenine yazıldı.
- **Mobil yetki tek haritadan:** `requireMobileAdminCapability` Bearer oturumu çözer, sonra aynı `ADMIN_CAPABILITIES` tablosunu uygular (`requireAdminUserById` ortak yarı).
- **Mobil yüzey triyaj:** yalnız list/detail/claim/dismiss/escalate. `mobile-admin-contract.test.ts` rota listesini birebir sabitliyor ve `setAdminUserBanState`/`deleteEvidenceMessage` geçmesini yasaklıyor — gizli düğme değil, olmayan uç.
- Bootstrap yanıtına `isAdmin` bayrağı eklendi (mobil ayarlar satırının görünürlüğü; yetki kararı değil).

## Self-review notları

- D2 test 12-15 → Task 1-3; itiraz D2 hedef 8 → Task 4.
- F test 1-10 → Task 5 (2b/2c), 6 (1,2,3,10), 7 (4,5,6), 8 (7,9), 9 (8).
- Banlı itiraz giriş noktası (Task 4) mevcut banlı-login akışına bağlı — uygulama sırasında keşif gerekir; bulunamazsa görev "banlı durum sayfası oluştur" olarak genişler (spec D2 kapsamında).
