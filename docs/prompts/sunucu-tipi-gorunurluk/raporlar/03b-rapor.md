# 03b — S3 boşluk kapatma raporu

Dal `uat`, çalışma ağacında bırakıldı. Commit yok, `git add` yok.

Uygulama sırası prompttaki bağlayıcı sıraya uydu: **1 → 4 → 2 → 3**.

---

## Boşluk 1 — mobil görünürlük kaydetmesi 400 dönüyordu

**Dosya:** `packages/types/src/mobile-workspace-management.ts:211-223`

Yüklem elle sayımdan çıkarıldı, `MobileServerUpdateFieldsSchema`'nın kendi anahtarlarından türetiliyor:

```typescript
const MOBILE_SERVER_UPDATE_FIELDS = Object.keys(MobileServerUpdateFieldsSchema.shape) as Array<
  keyof z.infer<typeof MobileServerUpdateFieldsSchema>
>;
const hasMobileServerUpdate = (value: z.infer<typeof MobileServerUpdateFieldsSchema>) =>
  MOBILE_SERVER_UPDATE_FIELDS.some((field) => value[field] !== undefined);
```

Kalıcı önlem seçildi (elle düzeltme değil). Riski taradım, güvenli:

- Şemanın 10 alanının **hiçbirinde `.default()` yok**. `description` (`optionalTrimmedString(160, true)`) ve `shortName` `undefined`'ı bilerek koruyor, `iconUrl` zaten `omit` edilmiş. Yani gerçekten boş bir gövde parse sonrası da her alanı `undefined` bırakıyor ve reddedilmeye devam ediyor.
- Hata mesajı ve davranış aynı: `.refine(hasMobileServerUpdate, { message: "validation.form.atLeastOne" })` dokunulmadı.
- Rota tarafında alan sayımı yok: `mobileServerUpdateRoute` (`apps/web/src/app/api/v1/mobile/servers/[serverId]/route-logic.ts:101-102`) parse edilen gövdeyi bütün olarak `updateWorkspaceServer`'a geçiriyor, alan alan eşlemiyor. Yani düzeltme uçtan uca.

**Test (RED önce):** `packages/types/src/mobile-workspace-management.test.ts` — yalnız `isPublic`, yalnız `discoverable`, ikisi birlikte kabul; boş güncelleme hâlâ **reddediliyor** ve mesajı `validation.form.atLeastOne` olarak iddia ediliyor. RED çıktısı:

```
✖ counts every server update field, so a visibility-only save is a valid update (1.6146ms)
  AssertionError [ERR_ASSERTION]: [ { "code": "custom", "path": [], "message": "validation.form.atLeastOne" } ]
```

### Aynı hata sınıfı için denetim (istenen dördüncü tekrar araması)

| Yüklem                                                          | Şema alanı sayısı | Yüklemin saydığı | Durum                                       |
| --------------------------------------------------------------- | ----------------- | ---------------- | ------------------------------------------- |
| `hasMobileServerUpdate` (`mobile-workspace-management.ts:212`)  | 10                | 8                | **Kırıktı, düzeltildi** (artık türetiliyor) |
| `hasMobileChannelUpdate` (`mobile-workspace-management.ts:374`) | 4                 | 4                | Sağlam                                      |
| `MobileRoleUpdateRequestSchema.refine` (`:499`)                 | 3                 | 3                | Sağlam                                      |
| `UpdateServerSchema.refine` (web ikizi, `workspace.ts:260`)     | 11                | 11               | Sağlam (S1'de düzeltilmişti)                |
| `UpdateChannelSchema.refine` (`workspace.ts:309`)               | 4                 | 4                | Sağlam                                      |
| `UpdateWorkspaceRoleSchema.refine` (`workspace.ts:361`)         | 4                 | 4                | Sağlam                                      |

Dördüncü tekrar yok. Yalnız `hasMobileServerUpdate` eksikti; diğerleri elle listeye rağmen şemalarıyla birebir örtüşüyor, "iyileştirme" amacıyla dokunulmadı (promptun "Yapılmayacaklar" maddesi).

---

## Boşluk 4 — ayarlar overlay'inin fazladan isteği kaldırıldı

**Sözleşme** (`packages/types/src/workspace.ts:176-198`): `WorkspaceServerDetailSchema.server` bloğuna `discoverable`, `isPublic`, `type` eklendi (üçü de zorunlu).

- `ServerTypeSchema` tanımı dosyada **yukarı taşındı** (eski yeri `:203`, yeni yeri `WorkspaceServerSummarySchema`'nın hemen üstü). Zorunluydu: detay şeması ondan önce değerlendiriliyor, aşağıda kalsaydı modül yüklenirken TDZ `ReferenceError` verirdi. Tanımın kendisi değişmedi.
- `assertSchemaBehaviorCoverage` fixture'ı gerekmedi (yeni şema dışa aktarılmadı, mevcut şema genişletildi) — varsayılmadı, `packages/types` süiti koşularak doğrulandı.

**Servis** (`apps/web/src/lib/workspace/server-service.ts`): `loadWorkspaceServerDetail`'in `select`'ine `discoverable`, `isPublic`, `type` eklendi; dönüş nesnesinde üçü de dolduruluyor. Kolonlar `Server` üzerinde zaten vardı.

**Overlay** (`apps/web/src/components/shell/server-settings-overlay.tsx`): `fetchServerPublicProfile` çağrısı, `visibilityQuery`, `visibilitySeeded`, `visibilityLoaded` ve seed effect'i silindi.

- `isPublic`/`discoverable` state'leri artık diğer alanlarla aynı şekilde `detail.server`'dan başlatılıyor. Güvenli, çünkü `ServerSettingsOverlay` içeriği `props.detail` null'ken hiç mount edilmiyor ve `key={props.detail.server.id}` ile sunucu başına yeniden kuruluyor (`:260-270`) — eski "yükleme yarışı" senaryosu bu yolla zaten imkânsız.
- `isCommunityServer` artık `detail.server.type === "COMMUNITY"`.
- Mutasyon gövdesindeki `visibilityLoaded` koşulu kalktı; görünürlük alanları yalnız COMMUNITY'de dışarıda bırakılıyor (yazımı servis zaten 403'lüyor).
- Kaydetme sonrası `serverProfileQueryKeys.profile(...)` invalidation'ı **korundu** — profil kartı ayrı bir tüketici.

**Tüketici kontrolü:** `pnpm --filter @wizards/web typecheck` üç zorunlu alanın eksikliğini tek yerde yakaladı — `apps/web/src/app/api/v1/mobile/servers/[serverId]/route-logic.test.ts:33-58` fixture'ı. Fixture `discoverable: false`, `isPublic: false`, `type: "PERSONAL"` ile tamamlandı (iddia gevşetilmedi, sadece literal genişletildi). Başka üretici/tüketici yok: mobil detay yükü (`loadMobileWorkspaceServerDetail` + `MobileWorkspaceServerDetailResponseSchema`) ayrı projeksiyon, bu şemadan türemiyor.

---

## Boşluk 2 — mobil profil kartındaki "Sunucuya katıl" artık gerçek ucu çağırıyor

**İstemci** (`apps/mobile/src/about/mobile-community-invite-client.ts`):

```typescript
buildMobilePublicServerJoinPath(serverId); // /api/v1/mobile/servers/{id}/join
joinMobilePublicServer(client, serverId); // gövdesiz POST, MobileMutationSuccessResponseSchema
resolveMobileServerJoinErrorCopyKey(serverCode); // saf eşleme
```

**Ekran** (`apps/mobile/src/app/screens/about/about-community-invite-screen.tsx`, `MobileServerProfileScreen`): `onBack()`'e düşen dal `joinServer()` ile değiştirildi; `joining` state'i `primaryBusy`'yi besliyor. Başarıda `communityJoinSuccess` toast'ı + `profileQuery.refetch()`; etiket **yeniden türetilmiyor**, `resolveServerProfileJoinAction(profile.joined)` taze `joined` ile "Sunucuya git"e dönüyor.

Durum kodu → kullanıcıya gösterilen metin (hepsi mevcut kopya, yeni metin yazılmadı):

| Uç yanıtı      | `MobileApiError.serverCode` | Mobil metin                                                     | Web ikizi                        |
| -------------- | --------------------------- | --------------------------------------------------------------- | -------------------------------- |
| 403            | `SERVER_BANNED`             | `discoverJoinBanned` — "Bu sunucudan yasaklandın."              | `discover.joinError.banned`      |
| 403            | `SERVER_FULL`               | `discoverJoinFull` — "Bu sunucu üye kapasitesine ulaştı."       | `discover.joinError.full`        |
| 404            | `SERVER_NOT_FOUND`          | `discoverJoinUnavailable` — "Bu sunucu şu anda kullanılamıyor." | `discover.joinError.unavailable` |
| diğer / kodsuz | —                           | `communityJoinFailed` — "Sunucuya katılınamadı. Tekrar dene."   | `discover.joinError.generic`     |

Web ile örtüşme: eşleme `resolveServerJoinErrorMessageKey`'in (`apps/web/src/lib/servers/discovery-presentation.ts:17`) birebir aynası — aynı üç kod, aynı varsayılan dal. **404 ayırt edilmiyor**: özel bir sunucunun varlığı ile olmayan sunucu aynı metnin arkasında; kodda gerekçesi yorumla sabitlendi.

Sunum farkı: web hata kartı render ediyor (`server-profile-card.tsx:275-277`), mobil hata toast'ı gösteriyor — bu ekranın (ve davet yolunun) mevcut hata deseni toast. Bildirilen **sonuç** iki platformda aynı.

**Davet yolu değişmedi.** `apps/mobile/component-tests/mobile-about-community-2g.test.tsx` **düzenlenmedi** ve yeşil (9 test).

**Yeni test:** `apps/mobile/component-tests/mobile-server-profile-join.test.tsx` (3 test) — gerçek uç çağrısı + üye eylemine dönüş, dört durum kodunun ayrı metni, üyenin join ucuna hiç dokunmaması. RED çıktısı (düzeltmeden önce):

```
● mobile server profile join › joins through the real endpoint and turns the button into the member action
● mobile server profile join › reports every join failure code with its own honest text
Tests: 2 failed, 1 passed, 3 total
```

---

## Boşluk 3 — `/discover` artık kabuktan erişilebilir

`apps/web/src/components/shell/server-rail.tsx`: "sunucu ekle" düğmesinin altına **tek** affordance — `Compass` ikonlu, `data-testid="server-rail-discover"`, `onClick={() => onNavigate("/discover")}`, `onPrefetch?.("/discover")` ile mevcut prefetch desenine bağlı. Etiket `t("discover.title")` (TR "Sunucuları Keşfet", EN "Discover Servers") — yeni kopya yok. Yeni navigasyon yüzeyi, menü sistemi veya prop eklenmedi.

---

## Doğrulama — gerçek çıktılar

`packages/types`:

```
ℹ tests 195
ℹ suites 34
ℹ pass 195
ℹ fail 0
```

Web birim testleri (`node scripts/run-node-tests.mjs`, apps/web):

```
ℹ tests 2033
ℹ pass 2033
ℹ fail 0
```

Taban 2032'ydi, şimdi 2033. Web tarafına test eklemedim; farkın kaynağını aramadım, kırmızı yok. `apps/web/src/lib/dm/group-service.test.ts` (bilinen, bize ait olmayan kırmızı) bu koşumda geçti.

Mobil node süiti:

```
ℹ tests 1667
ℹ suites 282
ℹ pass 1667
ℹ fail 0
```

Mobil jest süiti:

```
Test Suites: 129 passed, 129 total
Tests:       1172 passed, 1172 total
```

Taban 1169/128 idi; +3 test, +1 suite = yeni `mobile-server-profile-join.test.tsx`.

Typecheck (üç proje de temiz):

```
pnpm --filter @wizards/types typecheck   → 0 error
pnpm --filter @wizards/web typecheck     → 0 error
pnpm --filter @wizards/mobile typecheck  → 0 error
```

### Kapı: Mobile [PASS]

```
Local Quality Gate: Mobile [PASS]
[PASS] mobile-validate-env (582 ms, exit 0)
[PASS] mobile-tests (17836 ms, exit 0)
[PASS] mobile-component-tests (14557 ms, exit 0)
[PASS] mobile-release-check (753 ms, exit 0)
[PASS] mobile-quality-check (719 ms, exit 0)
```

### Kapı: Standard [PASS]

```
Local Quality Gate: Standard [PASS]
[PASS] standard-lint (16098 ms, exit 0): pnpm.cmd lint
[PASS] standard-typecheck (7483 ms, exit 0): pnpm.cmd typecheck
[PASS] standard-format (3325 ms, exit 0): pnpm.cmd format
[PASS] standard-tests (39996 ms, exit 0): pnpm.cmd test
```

Kapı koşumundaki test sayıları:

```
@wizards/db:test     25/25 + 9/9
@wizards/types:test  195/195
@wizards/mobile:test 1667/1667
@wizards/web:test    2033/2033
```

Standard'ı yeşile almak **iki tur** aldı; ikisi de promptun teslim listesinde olmayan iş (kullanıcı açıkça istedi, `00 §1`'in "Dokunma" kuralını bu iki nokta için devre dışı bıraktı):

1. **Lint** üç hatada duruyordu.
   - `apps/web/src/components/servers/server-discovery-screen.tsx:160` `react-hooks/exhaustive-deps` — 03'ten inen, bu ailenin dosyası. `discoveryQuery`'nin iki üyesi effect öncesi destructure edilerek kapatıldı; davranış aynı.
   - `apps/web/src/components/providers/live-voice-provider.tsx:7` kullanılmayan `LocalTrack` importu — eşzamanlı ses işinin dosyası ve `00 §1` "Dokunma" listesinde. Kullanıcının talimatıyla import satırından kaldırıldı; `LocalTrack` dosyada başka hiçbir yerde geçmiyordu (`stopLocalTracks` ayrı bir sembol), yani semantik değişiklik yok.
2. **Format** adımı bir _kontrol_; `1f71c35514d1` tabanına göre değişmiş **43 dosya** Prettier'dan geçmemişti. Hiçbiri bu promptta yazdığım dosya değildi (onlar zaten temizdi) — önceki oturumların ve eşzamanlı işlerin bıraktığı biçim borcu. Kapıyı yeşile almak için 43'ünde `prettier --write` koşuldu.

Bu 43 dosyanın ikisi `00 §1`'in dokunulmaz ağaçlarında: `apps/web/src/lib/dm/mobile-details-service.ts` ve `apps/web/src/lib/voice/screen-share-audio-wiring.test.ts`. Değişiklik yalnız biçim (Prettier), davranış değil; yine de eşzamanlı iş sahiplerinin haberi olmalı. Tek dosya geri alınmak istenirse:

```bash
git checkout -- apps/web/src/lib/dm/mobile-details-service.ts
```

---

## Sapmalar

1. **`ServerTypeSchema` dosya içinde yukarı taşındı** (`workspace.ts`). Zorunlu: detay şeması ona artık atıfta bulunuyor ve `const` TDZ'si modül yüklenirken patlardı. Tanım değişmedi, dışa aktarım aynı.
2. **`server-discovery-screen.tsx`'teki `exhaustive-deps` hatası düzeltildi.** Promptun teslim listesinde yok, ama Standard kapısını kırıyordu ve 03'ün (bu ailenin) dosyası.
3. **Mobil hata sunumu toast, web'de kart.** Promptun istediği "her durum kodu ayrı ve dürüst metin" karşılandı; bileşen biçimi platformun mevcut desenine uyduruldu (yeni hata kartı bileşeni yazmamak için).
4. **`live-voice-provider.tsx`'ten kullanılmayan `LocalTrack` importu kaldırıldı** — `00 §1`'in "Dokunma" listesindeki dosya. Kullanıcı bunu açıkça istedi (Standard'ı yeşile alma talimatı). Tek satır, semantik etkisi yok.
5. **43 dosyada `prettier --write`.** Kapının `standard-format` adımı geçsin diye; ikisi dokunulmaz ağaçlarda (yukarıda adlandırıldı). Sonrasında lint + typecheck + dört süit yeniden koşuldu, hepsi yeşil.

## Eklenmeyenler

- **`joined` sonrası mobil sunucu listesi invalidation'ı yok.** Web `workspaceQueryKeys.servers`'ı invalide ediyor; mobilde davet yolu da (`joinMobileCommunityServer`) bunu yapmıyor, yani platform içi desen tutarlı. Prompt istemedi, kapsam dışı bırakıldı — ayrı bir dilim olarak açık boşluk sayılmalı.
- Keşif kartına yeni alan/sıralama, join'e retry/backoff, yeni kopya, görsel yeniden tasarım: hiçbiri yapılmadı (promptun "Yapılmayacaklar" listesi).

## Bilinen boşluklar / notlar

- **Bu makinede test komutunu boruya bağlamayın.** `pnpm test 2>&1 | tail` ve `... | Select-String` ikisi de kilitlendi: süreç 30 dakika boyunca ~2 saniye CPU harcayıp hiç ilerlemedi (boru arabelleği). Aynı komut çıktısı **dosyaya yönlendirildiğinde** web süiti 26 saniyede bitti. `00 §5`'e eklenmeye değer: `node scripts/run-node-tests.mjs > log 2>&1` kullan, boru kullanma.
- Görsel doğrulama yapılmadı (tarayıcı önizlemesi çalıştırılmadı); değişiklikler test ve typecheck seviyesinde doğrulandı.
- `MobileServerProfileScreen`'e keşif ızgarasından gelen kullanıcı artık gerçekten katılabiliyor; keşif ekranının kendi join'i hâlâ yok ve olmamalı (kart yükü `joined` taşımıyor).
