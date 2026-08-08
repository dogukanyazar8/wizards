# 03d — S3 mobil yarı: Bölüm C/D/E kapanış raporu

Tarih: 2026-08-08
Dal: `uat`, uncommitted
Kapsam: **yalnız mobilin C (görünürlük anahtarları), D (keşif ekranı) ve E (kopya) bölümleri.** Web yarısı ve `packages/types`/`apps/web` ayrı bir geçişin sorumluluğunda; onlara dokunulmadı.

---

## Teslim edilenler

### Bölüm C — Görünürlük anahtarları (`mobile-server-settings-screen.tsx`)

- Yeni "Görünürlük" kartı, "İçerik izinleri" ile "Yönetim" arasında, iki satır: **Herkese açık** (`isPublic`) ve **Keşfedilebilir** (`discoverable`).
- Okuma kaynağı: `WorkspaceServerDetailSchema`/`MobileWorkspaceServerDetailSchema`'nın `server` nesnesi `isPublic`/`discoverable`/`type` taşımıyor (doğruladım, aşağıda kanıt). Tek mobil yüzey bu üçünü birden veren S2 sunucu profili (`GET .../servers/[serverId]/profile`, `ServerPublicProfileSchema`) — ekran şimdi `fetchMobileServerProfile` ile ikinci, capability'den bağımsız bir `useQuery` açıyor (`mobileQueryKeys.aboutServerProfile(serverId)`, S2 ekranıyla aynı anahtar, aynı cache'i paylaşıyor).
- `discoverable` yalnız `isPublic` açıkken etkileşimli; kapalıyken `serverSettingsDiscoverableRequiresPublicHint` görünür açıklamayla devre dışı.
- `isPublic`'i kapatmak **aynı `mutateAsync` çağrısında** `{ isPublic: false, discoverable: false }` gönderiyor — sunucu tarafında zorlanan tek istek, iki ayrı çağrı değil (`togglePublic`, satır ~206-236).
- COMMUNITY sunucularda (`profile.type === "COMMUNITY"`) iki anahtar da `disabled` ve satır altyazısı `serverSettingsVisibilityManagedByCommunity` ("Topluluk sunucusu · görünürlük yönetim ekibi tarafından yönetilir") gösteriyor; dokunma denemesi mutasyonu hiç tetiklemiyor (guard, handler'ın en başında).
- Optimistik anahtar + hata durumunda geri alma, ekranın zaten kullandığı desenle birebir (`saveEditor`/`uploadIcon` ile aynı try/catch iskeleti).
- Başarılı bir görünürlük mutasyonundan sonra `mobileQueryKeys.aboutServerProfile(serverId)` de invalidate ediliyor — aksi halde S2 `ServerProfile` ekranı eski değeri göstermeye devam ederdi (`updateServer`'ın kendi `onSettled`'ı yalnız `workspace`/`bootstrap`'i invalidate ediyor, bu ayrı cache girişine dokunmuyor).

**Kritik, kendi başıma düzeltemediğim bir sözleşme kusuru bulundu — bkz. "Kaygılar" bölümü. UI doğru ve eksiksiz, ama yazma isteği bugünkü haliyle sunucudan 400 dönüyor.**

### Bölüm D — Keşif ekranı

Yeni dosyalar:

- `apps/mobile/src/workspace/mobile-server-discovery-client.ts` — `buildMobileServerDiscoveryPath`/`fetchMobileServerDiscovery`, `ServerDiscoveryQuerySchema`/`ServerDiscoveryPageSchema` (S3 Section A, hazır sözleşme) ile.
- `apps/mobile/src/workspace/mobile-server-discovery-screen.tsx` — `MobileServerDiscoveryScreen` + memo'lu `MobileServerDiscoveryCard`.
- `apps/mobile/src/workspace/mobile-server-discovery-screen.styles.ts` — geometri tamamen `mobile-server-members-screen.styles.ts` (header/kart kabuğu) ve `workspace-browser.tsx`'in `mobileWorkspaceSearchBox`'ından (arama kutusu) kopyalandı; yeni renk/gölge/yarıçap yok.
- `apps/mobile/component-tests/mobile-server-discovery.test.tsx` — 5 test (kart render + tıklama, boş durum, arama boş sonucu, yükleme hatası + retry, geri tuşu).

Liste performansı:

- `FlashList`, `getItemType={() => "server-card"}` (tek satır şekli).
- `MobileServerDiscoveryCard` `memo()` ile sarılı; `renderItem` ekranda `useCallback` ile.
- **"Sorgu sonucuna memoize etme" tuzağı:** `rows` `data.pages.flatMap((page) => page.servers)` — `.map()` ile yeniden sarmıyor, react-query'nin structural-sharing'i korunan referansları memo'lu karta olduğu gibi taşıyor. Formatlama (`formatServerProfileCount`) kartın İÇİNDE yapılıyor, listenin `useMemo`'sunda değil — aksi halde her fetch'te yeni obje üretilip memo'yu sessizce öldürürdü.
- Arama: `useDebouncedValue` (mevcut, `about/mobile-about-queries.ts`, 300ms) — yeni bir debounce yazılmadı.

Giriş noktası:

- `mobile-server-create-join-sheet.tsx`'in "menu" adımına üçüncü kart: **"Sunucu keşfet"** (`mobile-server-mode-discover`), `Ionicons compass-outline`. Basınca `onOpenDiscover()` + `onClose()`.
- `workspace-browser.tsx`, `MobileServerCreateJoinSheet`'e `onOpenDiscover={() => mobileNavigationRef.navigate("Discover")}` bağladı (sunucu ayarlarına giden `mobileNavigationRef.navigate(...)` deseniyle aynı).
- Karta tıklama → `navigation.navigate("ServerProfile", { serverId })` (`DiscoverScreenContainer`, `mobile-screen-containers.tsx`). S2 ekranı **değiştirilmedi**.

### Bölüm E — TR + EN kopya (`mobile-copy.ts`)

Her ikisi de ayrı, dürüst string — genel "bir şeyler ters gitti" yok:

| Anahtar                                       | TR                                                           | EN                                                  |
| --------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `discoverEmptyTitle`                          | "Henüz keşfedilecek sunucu yok"                              | "No servers to discover yet"                        |
| `discoverSearchEmptyTitle` + `...Description` | "Sonuç bulunamadı" / `"{query}" ile eşleşen bir sunucu yok.` | "No results found" / `No server matches "{query}".` |
| `discoverLoadError`                           | "Sunucular yüklenemedi. Lütfen tekrar dene."                 | "Servers could not load. Please try again."         |
| `discoverJoinBanned`                          | "Bu sunucudan yasaklandın."                                  | "You've been banned from this server."              |
| `discoverJoinFull`                            | "Bu sunucu üye kapasitesine ulaştı."                         | "This server has reached its member limit."         |
| `discoverJoinUnavailable`                     | "Bu sunucu şu anda kullanılamıyor."                          | "This server isn't available right now."            |

`discoverJoin*` üçlüsü `POST .../servers/[serverId]/join`'ün üç hata koduna (`SERVER_BANNED`/`SERVER_FULL`/`SERVER_NOT_FOUND`) bire bir karşılık geliyor. `SERVER_NOT_FOUND` bilinçli olarak "kullanılamıyor" diyor, "özel" ya da "yok" demiyor — görevin notu ve `03ab-rapor.md` bunu böyle istiyor (dolu+özel karışımı 404 yerine 403 sızdırabiliyor; ayırt etmemek varlık sızıntısını mobilde de tekrarlamıyor).

Ayrıca: `serverSettingsDiscoverable(Hint)`, `serverSettingsPublic(Hint)`, `serverSettingsVisibility(ManagedByCommunity)`, `discoverTitle/Back/SearchPlaceholder/MembersCount/OnlineCount`, `workspaceServerDiscoverAction/OptionDescription` (sheet kartı). Tam liste `mobile-copy.ts`'te `serverSettings*` ve yeni `discover*`/`workspaceServerDiscover*` bloklarında, TR/EN birebir eşleşiyor.

**Not — bu üç string bugün hiçbir çağıran tarafından tüketilmiyor.** Karttan çıkan tek eylem S2 profiline gitmek; profildeki "Sunucuya katıl" hâlâ `about-community-invite-screen.tsx`'in S2 yorumunda yazdığı gibi `onBack()`'e düşüyor ("davetsiz katılım S3'ün işi" notuyla). Görevimin sınırı ("Bölüm D... karta tıklama ServerProfile'a gider") bu dosyaya dokunmamı istemiyor; bkz. Kaygılar.

---

## Üç navigasyon dosyası — kanıt

**`apps/mobile/src/navigation/mobile-navigation-types.ts`** (`MobileRootStackParamList`'e eklendi):

```ts
ServerProfile: { readonly serverId: string };
/** S3 Section D: browse public, discoverable servers. Cards route to `ServerProfile`. */
Discover: undefined;
```

**`apps/mobile/src/navigation/mobile-navigator.tsx`** (import + `RootStack.Screen`):

```ts
import {
  ...
  ServerProfileScreenContainer,
  DiscoverScreenContainer,
} from "../app/screens/mobile-screen-containers";
...
<RootStack.Screen name="ServerProfile">
  {(props) => <ServerProfileScreenContainer {...props} />}
</RootStack.Screen>
<RootStack.Screen name="Discover">
  {(props) => <DiscoverScreenContainer {...props} />}
</RootStack.Screen>
```

**`apps/mobile/src/navigation/mobile-linking.ts`** (`config.screens`'e path):

```ts
CommunityInvite: "invite/:slug",
DirectMessage: "channels/@me/:conversationId",
Discover: "discover",
GroupCreate: "channels/@me/new-group",
```

Dördüncü, "nav dosyası" sayılmayan ama aynı zincirin parçası olan kayıt — `mobile-screen-containers.tsx`:

```ts
export function DiscoverScreenContainer({
  navigation,
}: NativeStackScreenProps<MobileRootStackParamList, "Discover">) {
  return (
    <MobileServerDiscoveryScreen
      onBack={() => navigation.goBack()}
      onOpenServer={(serverId) => navigation.navigate("ServerProfile", { serverId })}
    />
  );
}
```

`resolveMobileRoutePathIntent` (derin bağlantı komut ayrıştırıcısı) ve `MobileNavigationRouteIntent` union'ına kasıtlı olarak eklenmedi — `ServerSettings`/`ServerMembers`/`ServerInvites` gibi kardeş "iç" rotalar da orada değil; `Discover`'ın bir push bildirimi/harici derin bağlantı hedefi olması istenmedi (promptta da yok).

---

## Doğrulama — gerçek komut çıktısı

```
$ pnpm --filter @wizards/mobile typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=mobile --mode=check
EXIT_CODE=0
```

```
$ pnpm --filter @wizards/mobile test
...
ℹ tests 1667
ℹ suites 282
ℹ pass 1667
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Taban 1667/1667 idi — düşmedi (yeni node testi eklemedim, mobil node süiti benim değişikliklerimden etkilenmiyor).

```
$ pnpm --filter @wizards/mobile test:components
...
Test Suites: 128 passed, 128 total
Tests:       1169 passed, 1169 total
Snapshots:   0 total
```

Taban 1160/127 idi → **1169/128** (+9 test, +1 suite: yeni `mobile-server-discovery.test.tsx` + `mobile-server-management.test.tsx`'e eklenen 2 yeni test + var olan bir teste 2 yeni assertion). 0 fail.

Odaklı koşum (değişiklik sırasında, `00 §5`'in izin verdiği doğrudan `npx jest <dosya adları>` ile):

```
$ cd apps/mobile && npx jest mobile-server-discovery mobile-server-management mobile-screen-containers mobile-server-create-join mobile-server-icon-upload
Test Suites: 5 passed, 5 total
Tests:       37 passed, 37 total
```

`mobile-server-create-join.test.tsx` ve `mobile-server-icon-upload.test.tsx` **hiç değiştirilmedi** — `MobileServerCreateJoinSheetProps.onOpenDiscover` zorunlu alan olarak eklendi ama (a) `component-tests/**` `apps/mobile/tsconfig.json`'ın `include`'unda yok (typecheck dokunmuyor), (b) jest tip silme (babel) yapıyor, tip kontrolü yok, (c) hiçbir mevcut test `mobile-server-mode-discover` kartına basmıyor, yani `onOpenDiscover` hiç `undefined` olarak çağrılmıyor. Doğrulandı, iki dosya da hâlâ yeşil.

---

## Sapmalar

1. **Görünürlük durumu ayrı bir `useQuery` ile okunuyor, workspace detail payload'ından değil.** `WorkspaceServerDetailSchema`/`MobileWorkspaceServerDetailSchema`'nın `server` nesnesi `isPublic`/`discoverable`/`type` taşımıyor (doğrulandı, `packages/types/src/mobile.ts:813-844` ve `packages/types/src/workspace.ts:158-174`). `packages/types/**`'e dokunma yasağı olduğu için bu alanları oraya ekleyemedim; onun yerine zaten var olan, zaten test edilmiş S2 sunucu profili okuma yolunu (`fetchMobileServerProfile`) ikinci bir çağıran olarak kullandım. Gerekçe ve tam iz `mobile-server-settings-screen.tsx`'teki yorumda.
2. **`isPublic` kapatma isteği `discoverable:false`'u aynı payload'da taşıyor**, ayrı bir sunucu-taraflı "cascade" kuralına güvenmiyor — çünkü öyle bir kural **yok** (bkz. Kaygılar #1). Bu, promptun "sunucu tarafında zorla" talimatını mobil istemcinin sağlayabileceği en güçlü şekilde karşılıyor.
3. **Keşif kartının satır/kart geometrisi `mobile-server-members-screen.styles.ts`'ten harfi harfine kopyalandı** (18 radius, 10 marginBottom, 20 marginHorizontal, vb.) — S3 Section D için ayrı bir tasarım kaynağı (handoff HTML) yok; `00 §4`'ün "uydurma yasak" kuralı gereği yeni bir dil icat etmek yerine en yakın kardeş yüzeyin değerlerini yeniden kullandım.
4. **`workspaceServerDiscoverAction`/`OptionDescription` yeni kopya anahtarları** (create/join sheet'in üçüncü kartı) promptta adı geçmiyordu ama Section D'nin "giriş noktası" gereksinimi metin gerektiriyordu; `mobile-copy.ts`'e, sheet'in kendi bloğuna eklendi.
5. `mobile-server-management.test.tsx`'in `@tanstack/react-query` mock'una `useQuery` eklendi (yalnızca `useQueryClient` vardı) — bu olmadan `MobileServerSettingsScreen` her render'da "useQuery is not a function" ile çöküyordu. Mekanik bir zorunluluk, gevşetme değil.

## Eklenmeyenler

1. **`MobileServerProfileScreen`'in ("Sunucuya katıl" düğmesi) gerçek katılma mutasyonuna bağlanması.** Görevin Section D tanımı yalnız "karta tıklama ServerProfile'a gider" diyor; profildeki join düğmesini `POST .../servers/[serverId]/join`'e bağlamak `about-community-invite-screen.tsx`'e dokunmayı gerektirirdi — o dosya bu görevin dosya listesinde hiç geçmiyor, S2'nin parçası ve "byte-for-byte preserved" diye pinlenmiş bir regresyon testi var. `discoverJoinBanned/Full/Unavailable` kopyası hazır ama bugün hiçbir çağıran tarafından tüketilmiyor — bir sonraki geçişin işi.
2. **`packages/types/src/mobile-workspace-management.ts`'teki `hasMobileServerUpdate` düzeltmesi** — kanıtlanmış blocker (Kaygılar #1), ama `packages/types/**` yasak listemde. Düzeltmedim.
3. `graphify update .` — kök `CLAUDE.md` istiyor ama `graphify-out/**` yasağıyla çelişiyor; `02-rapor.md`/`03ab-rapor.md`'nin de bildirdiği aynı çelişki. Yasağa uydum, koşmadım.
4. `Invoke-LocalGate.ps1 -Profile Mobile` — orijinal `03-S3-kesif-ve-katilim.md`'nin "Kapı" bölümü bunu istiyor, ama bana verilen görev talimatının kendi "Verify" bölümü yalnız üç komutu (typecheck, `test`, `test:components`) sayıyor. Görevimin kendi, daha dar talimatını izledim; hepsi geçti.
5. `discoverable`/`isPublic` için web tarafı — kapsamım değil, ayrı bir geçiş.

## Kaygılar

1. **Kritik — Bölüm C'nin yazma isteği bugün 400 dönüyor.** `packages/types/src/mobile-workspace-management.ts:212-224`'teki `hasMobileServerUpdate` (mobil `MobileServerUpdateRequestSchema`'nın `.refine()` yüklemi) `isPublic`/`discoverable`'ı hiç kontrol etmiyor:
   ```ts
   const hasMobileServerUpdate = (value: ...) =>
     value.name !== undefined || value.shortName !== undefined || value.description !== undefined ||
     value.messageCharacterLimit !== undefined || value.deletedMessageNoticeMinutes !== undefined ||
     value.allowGifs !== undefined || value.allowFileUploads !== undefined || value.allowMemberAdds !== undefined;
   ```
   Şema alanı olarak `isPublic`/`discoverable` mevcut (`UpdateServerFieldsSchema`'dan miras), ama bu predicate'te yok. Kanıt — gerçek şema üzerinde çalıştırdım (`node --import tsx`, `packages/types/src/index.ts` doğrudan import):
   ```
   isPublic only: false [{"code":"custom","path":[],"message":"validation.form.atLeastOne"}]
   discoverable only: false [{"code":"custom","path":[],"message":"validation.form.atLeastOne"}]
   both: false [{"code":"custom","path":[],"message":"validation.form.atLeastOne"}]
   isPublic + name: true
   ```
   Sonuç: `updateMobileServer` (`apps/mobile/src/workspace/mobile-server-management-client.ts`) `MobileServerUpdateRequestSchema.parse(fields)`'i **istemci tarafında, ağ isteğinden önce** çalıştırıyor — yani bugün bir kullanıcı ayarlar ekranında görünürlük anahtarına dokunursa, çağrı sunucuya hiç gitmeden, doğrudan istemcide ZodError ile patlar. Web tarafının aynı alanı zaten doğru kontrol ettiğini doğruladım (`packages/types/src/workspace.ts:260-276`, `UpdateServerSchema.refine()` `isPublic`/`discoverable`'ı sayıyor) — yalnız mobile'a özel bu ikinci, elle yazılmış predicate S1/S2'de güncellenmemiş. Tek satırlık düzeltme: `hasMobileServerUpdate`'e `|| value.isPublic !== undefined || value.discoverable !== undefined` eklemek. `packages/types/**` yasağım olduğu için bunu yapamadım; UI'ı doğru sözleşmeye göre tam ve doğru kurdum, ama gerçek cihazda uçtan uca doğrulanamaz durumda kilitli. Bunu ayrı bir arka plan görevi olarak işaretledim (bkz. altta).
2. **Yukarıdaki kusur düzeltilene kadar Bölüm C'nin component testleri "doğru UI davranışı"nı kanıtlıyor, "gerçek API çağrısı başarılı olur"u değil** — testler `useMobileServerManagementMutations`'ı mock'luyor (`mockMutations.updateServer.mutateAsync`), gerçek `MobileServerUpdateRequestSchema.parse` yolundan geçmiyor. Bu, dosyadaki HER mutasyon testi için zaten geçerli bir sınırlama (server icon, delete, vb. de aynı mock'u kullanıyor) — yeni bir zaaf değil, ama Bölüm C özelinde daha çok önemli çünkü tam da kırılan yer orası.
3. **Görsel parite hâlâ doğrulanmadı** (S2'den devralınan, `03-S3-kesif-ve-katilim.md`'nin kendi "Açık boşluk" notu) — keşif kartının geometrisi kardeş ekranlardan alındı ama hiçbir tasarım dokümanıyla yan yana konmadı, çünkü S3 Section D için tasarım kaynağı hiç verilmedi.
4. **`MobileServerProfileScreen`'in "Sunucuya katıl" düğmesi keşif akışını uçtan uca kırık bırakıyor** (Eklenmeyenler #1) — bir kullanıcı Keşfet'te bir sunucu bulup karta dokunur, profili görür, "Sunucuya katıl"a basar ve hiçbir şey olmaz (ekran geri gider). Ürün açısından gözle görülür bir boşluk; benim dosya sınırlarımın dışında ama biri bunu kapatmalı.

---

## Bilinen boşluklar

1. Web `app/(main)/discover/` rotası — bu görevin kapsamı değil, ayrı geçiş.
2. `packages/types/src/mobile-workspace-management.ts`'teki `hasMobileServerUpdate` düzeltmesi (Kaygı #1) — S3 Section C'yi uçtan uca çalışır hale getirmenin tek eksik parçası.
3. `MobileServerProfileScreen`'in davetsiz katılma mutasyonuna bağlanması (Kaygı #4).
4. Görsel parite doğrulaması (Kaygı #3).
