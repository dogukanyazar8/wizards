# 00 — Ortak bağlam (okunur, uygulanmaz)

Bu dosya `sunucular-6a-6f` paketinin beş fazının tamamı için geçerlidir. **Her faz başlamadan önce baştan sona okunur.** Burada yazan doğrulanmış gerçekler yeniden keşfedilmez.

---

## 1. Çalışma kuralları

| Kural              | Değer                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Branch             | `uat` (yeni branch açma, worktree açma yok)                                                    |
| Mod                | caveman **ultra** — çıktı terse, teknik terim birebir, kod/commit normal                       |
| Kararsızlık        | Tahmin etme, **kullanıcıya sor**. Tasarımda olmayan bir davranış icat etme.                    |
| Gerçek cihaz testi | **Kullanıcı yapar.** Faz sonunda cihaz test listesi üret, kendin "cihazda çalışıyor" deme.     |
| Commit             | **İzinsiz commit yok.** Faz bitince değişiklikleri uncommitted bırak, rapor yaz, izin iste.    |
| Kapsam             | Faz dosyasındaki "Yapılmayacaklar" bağlayıcıdır. Kapsam kayması bu pakette kusurdan pahalıdır. |

### Tasarım kaynağı — tek doğru

- `design_handoff/design_handoff_sunucular/Whispr Sunucular Redesign.dc.html` — **satır 30–370** (`section#t6`). Ölçüler buradan okunur, PROMPT.md'den değil; PROMPT.md özet, HTML kaynaktır.
  - 6a: satır 35–108 · 6b: 111–172 · 6c: 175–209 · 6d: 212–278 · 6e: 281–321 · 6f: 324–366
- `design_handoff/design_handoff_sunucular/PROMPT.md` — **§6 (satır 286–457)**. Davranış/veri kuralları burada.
- `design_handoff/design_handoff_sunucular/screenshots/6a…6f-*.png` — piksel referansı.

**Bölüm 6, Bölüm 1a/1b'nin başlık düzenini ve kategori satırını GEÇERSİZ kılar.** 1a/1b'nin kanal satırı anatomisi, rozet mantığı ve rail tarifi hâlâ geçerli.

---

## 2. Over-engineering yasağı

Somut maddeler:

1. Yeni soyutlama katmanı (`*Manager`, `*Orchestrator`, generic factory) açma. Mevcut kalıbı kopyala.
2. Bir fazda kullanılmayan API alanı/parametre ekleme. Şema alanı = o fazda render edilen alan.
3. Var olan bileşeni "iyileştirmek" için refactor etme — fazın dokunmasını istediği dosyalar dışına çıkma.
4. Test yardımcıları için yeni framework yazma; `apps/mobile/component-tests/mobile-redesign-servers.test.tsx` ve `apps/mobile/scripts/mobile-sunucular-model.test.ts` kalıplarını kullan.
5. Feature flag ekleme — bu paket doğrudan `uat`'a iner.
6. Tasarımda olmayan animasyon/haptic/boş durum icat etme.

---

## 3. Doğrulanmış gerçekler — mevcut kod

### 3.1 Sunucular ekranı (6a/6b/6f hedefi)

| Dosya                                                                              | Bugünkü durum                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/app/screens/workspace-browser.tsx` (36.8 KB)                      | Başlıkta **beş buton** var: ara (`629–649`), bilgi→`ServerProfile` (`653–677`), davet (`678–698`), ayarlar (`701–725`), `+` oluştur (`726–740`). 6f'in "ESKİ DAVRANIŞ — KULLANMA" örneği birebir bu.                                                                                                                                                                                                                                                                                              |
| aynı dosya `606–618`                                                               | Sunucu adı `numberOfLines={1}`. 6f bunu yasaklıyor (2 satır clamp şart).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| aynı dosya `742`                                                                   | Rail görünümünde meta satırı ayrı render ediliyor — 6a bunu koruyor.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| aynı dosya `751–775`                                                               | Arama kutusu: compact'ta kalıcı, rail'de toggle. 6b placeholder'ı **"Kanallarda ve mesajlarda ara"** olarak genişletiyor.                                                                                                                                                                                                                                                                                                                                                                         |
| `apps/mobile/src/app/screens/workspace-channel-section-list.tsx:146–148`           | Kategori başlığındaki `+` butonu (`testID="mobile-workspace-section-create-<id>"`). **6 numaralı bölüm bunu tamamen kaldırıyor** — buton + handler + testID + testler.                                                                                                                                                                                                                                                                                                                            |
| `apps/mobile/src/app/screens/mobile-workspace-server-switcher-sheet.tsx` (15.7 KB) | 1c sunucu seçici sheet. 6a/6b'de ad+chevron ve compact kart bunu açmaya devam eder — **değişmiyor**.                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/mobile/src/workspace/mobile-workspace-create-sheets.tsx` (31.7 KB)           | 1d "Oluştur" menüsü + 1e kanal formu. FAB buraya bağlanır; **kategori ön-seçimi kaldırılır** (6a: "kategori 1e formundan seçilir").                                                                                                                                                                                                                                                                                                                                                               |
| `apps/mobile/src/app/screens/workspace-add-action-buttons.tsx`                     | Mevcut oluşturma giriş noktaları. FAB'a geçişte gözden geçirilecek.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `apps/mobile/src/app/mobile-sunucular-model.ts`                                    | Saf model katmanı. Mevcut export'lar: `getMobileServerBadge`, `getMobileOtherServersUnreadTotal`, `slugifyMobileChannelName(Input)`, `hasMobileChannelNameCollision`, `getMobileMissedNotifications`, `getMobileServerCreateAccess`, `getMobileChannelRowTone`, `getMobileChannelRowPreview`, `getMobileVoiceRowPresence`, `getMobileVoiceParticipantTotal`, `buildMobileCollapsedSectionKey`, `parse/serialize/toggleMobileCollapsedSections`. **Yeni saf mantık buraya yazılır, ekrana değil.** |
| `apps/mobile/src/app/providers/use-mobile-collapsed-sections.ts`                   | Kategori daralt/aç kalıcılığı: tek AsyncStorage anahtarı `whispr.mobile.collapsed-sections`, version-ref ile yarış koruması. **Filtre şeridi kalıcılığı bu kalıbı birebir kopyalar.**                                                                                                                                                                                                                                                                                                             |

### 3.2 Sunucu profili (6d/6e hedefi)

| Gerçek                                                                           | Kanıt                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bugünkü sunucu profili = 2g "topluluk" kartı. **Tek gövde iki rotayı besliyor.** | `apps/mobile/src/app/screens/about/about-screen-shells.tsx:63–64` — `MobileCommunityInviteScreen` ve `MobileServerProfileScreen` ikisi de `./about-community-invite-screen` (26.4 KB) dosyasından export ediliyor.                                        |
| Rota kaydı                                                                       | `apps/mobile/src/navigation/mobile-navigator.tsx:324–326` (`ServerProfile`), `321–323` (`CommunityInvite`); container'lar `mobile-screen-containers.tsx:937–`                                                                                             |
| İki veri kaynağı                                                                 | `apps/mobile/src/about/mobile-community-invite-client.ts` — `fetchMobileCommunityInvitePreview(slug)` (davet önizleme) ve `fetchMobileServerProfile(serverId)` → `GET /api/v1/mobile/servers/[serverId]/profile`                                          |
| Okuma modeli                                                                     | `packages/types/src/workspace.ts:430–447` `ServerPublicProfileSchema`: `bannerUrl, channels, description, discoverable, iconUrl, isPublic, joined, memberCount, mutualFriendCount, mutualFriends, name, onlineCount, serverId, shortName, type, verified` |
| Kanal alt şeması                                                                 | aynı dosya `412–417` `ServerPublicProfileChannelSchema`: `liveCount, name, readOnly, type` — **kategori yok, son etkinlik tarihi yok, katılımcı listesi yok, özel-kanal bayrağı yok**                                                                     |
| Rota dosyası                                                                     | `apps/web/src/app/api/v1/mobile/servers/[serverId]/profile/route.ts`                                                                                                                                                                                      |

### 3.3 Veritabanı

| Model                | Konum                                      | Not                                                                                                                                                                                                                                                           |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Server`             | `packages/db/prisma/schema.prisma:919–983` | `vanityUrlCode` (`941`) **var** → 6d davet adresi buradan. `createdAt` (`950`) var → 6e "Oluşturulma". `verificationLevel` (`932`) var → 6d doğrulama rozeti. `features String[]` (`947`) var ama **etiket değildir**, yetenek bayrağı. **Etiket alanı yok.** |
| `ServerMember`       | `985–`                                     | 6e "Katılımın" ve yönetici listesi buradan.                                                                                                                                                                                                                   |
| `UserServerSettings` | `1328–1343`                                | `muted`, `mutedUntil`, `messageNotifications`, `mobilePush`. 6c "Sessize al" ve "Bildirim ayarları" buraya bağlanır. **`starred` kolonu yok.**                                                                                                                |
| `ScheduledEvent`     | `1692–1714`                                | `serverId, channelId, creatorId, name, description, imageUrl, scheduledStartAt, scheduledEndAt, status, entityType, externalLocation, interestedCount, createdAt`. **`apps/` içinde SIFIR kullanımı var** — API yok, UI yok, hiç yazılmıyor. Ölü model.       |

### 3.4 Tema ve bileşen kiti

- `apps/mobile/src/design/themes.ts` — `MobileTheme` (`218`), `lightTheme` (`632`), `darkTheme` (`1003`).
- Ekrana özel token grubu kalıbı **kurulu**: `messaging` (`882/1181`), `profileBadge` (`894/1193`), `voiceRoom` (`1000/1296`). **`workspace`/`serverProfile` grubu yok** — Faz 2 bunu `voiceRoom` kalıbıyla ekler.
- `MobileThemeElevationStyle` (`58`) — gölgeler bu tip üzerinden verilir (iOS shadow* + Android elevation). Ham `boxShadow` yazma.
- Toast standardı **kurulu**: `apps/mobile/src/app/components/kit/toast.tsx` + `toast-model.ts`, `MobileToastVariantId = action|error|info|loading|success|warning`. Tüm geçici mesajlar buradan geçer, yeni kalıp icat etme.
- Kit: `apps/mobile/src/app/components/kit/` (`list-row.tsx`, `index.ts` …).
- Kopya: `apps/mobile/src/locale/mobile-copy.ts` + `mobile-workspace-copy.ts`. Bu paketin metinleri **birebir Türkçe** ("Kanallarda ve mesajlarda ara", "Boş · sesli kanal", "Sunucudan ayrıl", "Kalan n kanalı gör", "Sunucuyu aç").

### 3.5 API yüzeyi

Mevcut mobil sunucu rotaları (`apps/web/src/app/api/v1/mobile/servers/`):
`route.ts`, `join/`, `discover/`, `[serverId]/{route,profile,join,channels,categories,members,roles,invites}/…`

---

## 4. Kırılgan noktalar — önden sayıldı

1. **Yeni API rotası eklerken üç kayıt zorunlu.** `apps/web/src/app/api/v1/route-contract.test.ts` içindeki `EXPECTED_RATE_LIMIT_ACTIONS` (satır `116`) **kapalı bir listedir**; rota + metot + action üçlüsü eklenmezse test kırmızı olur. Action'ın karşılığı `apps/web/src/lib/api-rate-limit.ts` içinde tanımlı olmalı. Gövdesiz mutasyon ise `BODYLESS_MUTATING_METHOD_PATHS` (satır `33`) listesine de girer.
2. **Prisma migration dizini tuzağı.** Prisma yalnızca `packages/db/prisma/rebaseline-migrations` içindekileri okur. Yanlış dizine yazılan migration sessizce hiç koşmaz.
3. **RN'de `-webkit-line-clamp` yok.** 6f'in 2 satır kuralı `numberOfLines={2}` + `ellipsizeMode="tail"` ile kurulur. `flex:1; min-width:0` karşılığı RN'de `flex: 1, minWidth: 0` — ikisi de şart, yoksa butonlar adı daraltır.
4. **`letterSpacing` RN'de px'tir, em değil.** Dönüşüm: `.12em @10.5px = 1.26`, `-.01em @19px = -0.19`, `-.02em @22px = -0.44`, `.04em @9.5px = 0.38`, `.06em @9.5px = 0.57`, `.1em @10px = 1.0`.
5. **RNTL 14 async.** `render()` ve `fireEvent.*` promise döner — **await et**. Await edilmeyen bir `fireEvent.press`, aynı dosyadaki _sonraki_ testleri zehirler (tek başına geçer, dosya halinde kırılır).
6. **`typecheck`/`lint` pnpm ile başlatılmalı.** `scripts/quality/typescript-project-runner.mjs`, `npm_execpath` üzerinden `pnpm exec tsc --version === "Version 7.0.2"` doğrular; `npm run typecheck` derlemeye başlamadan ölür.
7. **Node testleri paket dizininden koşulur.** Repo kökünden veya `pnpm exec` ile `node --import tsx` çalışmaz (Node 24 + pnpm symlink).
8. **`@wizards/types` kaynaktan çözülür** (`exports → ./src/index.ts`); `dist/` import edilmez, tip düzenlemeleri anında görünür.
9. **Sunucu adı üç yüzeyde birden geçer** (6a başlık, 6b kart, 6c kimlik satırı, 6d ad, 6e yapışkan başlık). 6f kuralı hepsinde uygulanmalı; biri unutulursa kabul kriteri 15 düşer.
10. **Web paritesi.** `starred` ve `tags` DB'ye giriyor — web istemci bunları okumaz/yazmazsa iki istemci ayrışır. Faz 1 web tarafını da kapatır.

---

## 5. Alınmış bağlayıcı kararlar (kullanıcı, 2026-08-10)

| Konu                 | Karar                                                                                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6d yaklaşan etkinlik | **Tam etkinlik özelliği.** `ScheduledEvent` canlandırılır: CRUD + katılım/ilgi + admin yüzeyi + mobil form.                                                                             |
| 6d etiketler         | **Yeni alan.** `Server.tags String[]` migration + sunucu ayarlarında düzenleme + profilde render + dokununca keşif aramasına gider.                                                     |
| 6c "Yıldızla"        | **DB kolonu, cihazlar arası senkron.** `UserServerSettings.starred` + PATCH ucu + web paritesi.                                                                                         |
| 6d/6e kapsamı        | **Tek gövde, iki rota.** Yeni 6d/6e gövdesi hem `ServerProfile` hem `CommunityInvite` (üye-olmayan varyantı) rotasını besler; eski `about-community-invite-screen.tsx` gövdesi silinir. |

### Varsayımlar (itiraz gelmezse geçerli)

- **Filtre şeridi kalıcılığı** cihaz yerel: AsyncStorage, `whispr.mobile.workspace-filter` anahtarı, `use-mobile-collapsed-sections` kalıbı, kullanıcı+sunucu bileşik anahtar. Sunucu tarafı tercih saklanmaz.
- **"Bu hafta" istatistiği** = son 7 gün mesaj sayısı, profil rotasında hesaplanır, `(channelId, createdAt)` indeksine dayanır ve 5 dk cache'lenir. Sayı üretilemezse hücre `—` gösterir, kart gizlenmez.
- **Koyu tema** tasarımda yok ama uygulama koyu temayı gönderiyor: her yeni token grubu `voiceRoom` kalıbıyla açık **ve** koyu varyantla eklenir. Koyu değerler açık paletten türetilir (Bölüm 3'ün koyu toast kuralı referans).
- **`entityType`** için etkinlikler `VOICE`/ses kanalı odaklıdır (6d kartı `live-room · 3 kişi katılıyor` diyor); harici konum desteklenir ama mobil formda ikincil.

---

## 6. Faz sırası ve kapılar

```
Faz 1  Veri katmanı (DB + API + tipler + web paritesi)
  ↓ kapı: migration koşuyor, route-contract yeşil, web/types testleri yeşil
Faz 2  Mobil temel katman (token + kopya + saf model + query/client + rota)
  ↓ kapı: mobil typecheck temiz, node model testleri yeşil, hiçbir ekran değişmedi
Faz 3  6a + 6b + 6f — Sunucular ekranı
  ↓ kapı: kategori "+" kod tabanında yok, uzun ad testi geçiyor, başlıkta 2 buton
Faz 4  6c — Sunucu "⋯" menüsü + bağlı ayar yüzeyleri
  ↓ kapı: eski header butonlarının hepsi menüden erişilebilir, sessize al/yıldızla uçtan uca
Faz 5  6d + 6e — Sunucu profili + etkinlik yönetimi + CommunityInvite göçü
  ↓ kapı: eski gövde silindi, iki rota tek gövdeden besleniyor, paket kabul kriterleri
```

Sıra zorunludur. Her faz bir öncekinin sözleşmesine dayanır.

---

## 7. Doğrulama komutları

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

Bileşen testleri (`apps/mobile` dizininden):

```bash
npx jest component-tests/mobile-redesign-servers.test.tsx
```

Graf güncelleme (kod değiştikten sonra):

```bash
graphify update .
```

---

## 8. Rapor formatı

Her faz sonunda `docs/prompts/sunucular-6a-6f/raporlar/<faz-no>-rapor.md`:

1. **Ne yapıldı** — dosya listesi, satır sayısı deltası
2. **Bağlayıcı kararlar** — sonraki fazları kısıtlayan her şey
3. **Tasarımdan sapmalar** — varsa gerekçesiyle
4. **Kapı çıktıları** — komut + gerçek sonuç (uydurma yok, kırmızıysa kırmızı yaz)
5. **Cihaz test listesi** — kullanıcının elle doğrulayacağı maddeler, ekran+adım+beklenen
6. **Devredilen borç** — sonraki faza taşınan iş
