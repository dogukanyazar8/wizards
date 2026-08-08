# 03c — S3 Bölüm C/D/E (web yarısı): kapanış raporu

Tarih: 2026-08-08
Dal: `uat`, uncommitted
Kapsam: **yalnız Bölüm C, D, E'nin web yarısı.** Mobil yarı bu turda hiç açılmadı (`apps/mobile/**` ve `packages/types/**`'e dokunulmadı — ayrı bir eşzamanlı geçişin sahipliğinde).

---

## Teslim edilenler

### Bölüm C — Görünürlük ayarları (web)

- `apps/web/src/components/shell/server-settings-overlay.tsx`: "Genel Bakış" sekmesine yeni bir "Görünürlük" paneli. İki `ServerFeatureToggle`: **Herkese açık** (`isPublic`) ve **Keşfet'te listele** (`discoverable`).
  - `discoverable`, `isPublic` kapalıyken devre dışı; açıklaması "önce Herkese açık'ı aç" mesajına döner.
  - `isPublic` kapatıldığında `discoverable` **hemen, istemci tarafında da** kapanır (`onChange` içinde `setDiscoverable(false)`), ayrıca sunucu tarafında da zorlanır (aşağıya bakın).
  - COMMUNITY sunucularda iki anahtar da her zaman devre dışı, üstlerinde `serverSettings.visibility.communityLocked` metni görünür ("topluluk sunucusu, yönetim ekibi tarafından yönetilir"). Anahtarlar hâlâ görünür ve gerçek değerlerini gösterir (salt okunur = devre dışı, gizli değil).
  - "Kaydet" tek buton, mevcut deseni değiştirmedi — iki anahtar da diğer genel bakış alanlarıyla (`ad`, `açıklama`, medya anahtarları…) aynı `updateMutation`'a katılıyor.
- `apps/web/src/lib/workspace/server-service.ts`: yeni saf fonksiyon `resolveVisibilityUpdateData(currentIsPublic, input)` — `updateWorkspaceServer` içine kablolandı. **Bağlayıcı kural burada uygulanıyor:** `isPublic` etkin olarak `false` ise (bu istekte kapatıldı ya da zaten kapalıydı), `discoverable` sonuç `data` nesnesinde **her zaman** `false`'a zorlanır — istemci ne gönderirse göndersin. Bu, "yalnız UI'da değil, sunucu tarafında da zorla" gereksinimini tek noktada (mutasyonun kendisinde) karşılıyor.
- `apps/web/src/lib/workspace/client.ts`: `updateServerRequest`'in `input` tipi `isPublic?`/`discoverable?` taşıyacak şekilde genişletildi (sunucu tarafı şeması zaten S1'den beri bu alanları kabul ediyordu, yalnız istemci tipi eksikti).
- **Okuma kaynağı kararı (aşağıda Sapmalar'da detaylı):** `WorkspaceServerDetailSchema` hiç `isPublic`/`discoverable`/`type` taşımıyor ve `packages/types/**`'e dokunmam yasaktı. Ayar katmanı bu üç alanı zaten var olan `GET /api/v1/servers/[serverId]/profile` (S2, `fetchServerPublicProfile`) ucundan okuyor — sahip her zaman kendi sunucusunun üyesi olduğundan `getVisibleServerPublicProfile`'ın görünürlük kapısını koşulsuz geçiyor.

### Bölüm D — Keşif ekranı (web)

- Rota: `apps/web/src/app/(main)/discover/page.tsx` → `ServerDiscoveryScreen` bileşenini render eden ince bir sunucu bileşeni (deseni `servers/[serverId]/about/page.tsx` ile birebir aynı).
- `apps/web/src/components/servers/server-discovery-screen.tsx` (yeni): başlık + arama kutusu + kart ızgarası.
  - Arama: 500ms debounce (`friends-view.tsx`'teki mevcut desenle aynı), debounce'lanmış değer `useInfiniteQuery`'nin `queryKey`'ine giriyor — arama değişince sayfalama kendiliğinden sıfırlanıyor.
  - Sonsuz kaydırma: `useInfiniteQuery` + `IntersectionObserver` sentinel (`message-list.tsx`'teki mevcut desenle aynı yaklaşım). Uygulama katmanında sıralama yok — sıralama tamamen backend'in `memberCount desc` index taramasından geliyor.
  - Kart: banner + ikon (S2 profil kartıyla **aynı** fallback gradyanı — `FALLBACK_BANNER_STYLE`/`FALLBACK_ICON_STYLE` `server-profile-card.tsx`'ten export edilip yeniden kullanıldı, yeni renk icat edilmedi), ad + doğrulama rozeti, çevrimiçi/üye sayısı (`formatServerProfileCount` — `packages/types`'ten, ikinci bir formatlayıcı yazılmadı), açıklama. Karta tıklama `/servers/[serverId]/about`'a gidiyor (Next `Link`).
  - Yükleniyor: `ServerDiscoveryGridSkeleton` (yeni, `shell-skeletons.tsx`'e eklendi, `ServerProfileCardSkeleton`'la aynı üslupta).
  - Boş durum / boş arama sonucu / yükleme hatası: aşağıda Bölüm E.
- `apps/web/src/lib/servers/client.ts`: `fetchServerDiscoveryPage`, `serverDiscoveryQueryKeys`, `ServerDiscoveryClientError`, `joinPublicServerRequest` eklendi — S3 Bölüm A/B'nin zaten landed uçlarının (`GET /api/v1/servers/discover`, `POST /api/v1/servers/[serverId]/join`) istemci karşılığı.
- **Kapsam dışı bırakılan ama mantıken zorunlu olan bir parça eklendi:** `apps/web/src/components/servers/server-profile-card.tsx`'teki katılma butonu artık **gerçek** `joinPublicServerRequest` mutasyonunu çağırıyor. S2 bunu bilerek `/invite/{serverId}`'ye yönlendiren bir yer tutucu bırakmıştı (kendi yorumunda: "instead of a join mutation, which ships in S3"). Bu olmadan Bölüm E'nin "banlı/dolu/kapalı" metinlerinin hiç çağırıcısı olmazdı. Detay ve gerekçe Sapmalar'da.

### Bölüm E — Kopya metinleri (TR + EN)

`apps/web/src/lib/locale/messages/tr.ts` ve `en.ts`'e eklenen anahtarlar (ikisi de güncellendi, aynı sırada):

- Görünürlük paneli: `serverSettings.visibility.{title,description,isPublicTitle,isPublicDescription,discoverableTitle,discoverableDescription,discoverableRequiresPublic,communityLocked}`
- Keşif ekranı: `discover.{title,subtitle,searchLabel,searchPlaceholder,online,members,loadingMore,joining}`
- Boş durum (hiç keşfedilecek sunucu yok): `discover.emptyState.{title,description}`
- Boş arama sonucu (ayrı, dürüst): `discover.emptySearch.{title,description}` — arama terimini `{query}` ile geri yansıtıyor
- Katılma hataları — **üçü ayrı**: `discover.joinError.banned.*`, `discover.joinError.full.*`, `discover.joinError.unavailable.*` (404 = yok ya da özel, ayırt edilmiyor — kontrat böyle), artı gerçekten bilinmeyen hatalar için `discover.joinError.generic.*`
- Liste yükleme hatası mevcut `errors.genericTitle`/`errors.genericDescription`/`errors.retry` anahtarlarını yeniden kullanıyor (yeni anahtar icat edilmedi) — bu bir "katılma hatası" değil, listenin kendisinin ağ hatası, yasak kapsamına girmiyor.
- `resolveServerJoinErrorMessageKey(code)` — `apps/web/src/lib/servers/discovery-presentation.ts` (yeni, saf fonksiyon): `SERVER_BANNED`/`SERVER_FULL`/`SERVER_NOT_FOUND` kodunu ilgili anahtara çeviriyor, tanımadığı her şeyi (ör. `RATE_LIMITED`, ağ hatası, kod yok) `generic`'e düşürüyor. Test: `apps/web/src/lib/servers/discovery-presentation.test.ts`, 5 senaryo.

---

## Doğrulama — gerçek komut çıktısı

```
$ pnpm --filter @wizards/web typecheck
$ node ../../scripts/quality/typescript-project-runner.mjs --project=web --mode=check
EXIT_CODE=0
```

```
$ pnpm --filter @wizards/web test
...
ℹ tests 2032
ℹ suites 455
ℹ pass 2032
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 24056.7854
```

Bu, benim değişikliklerimin **tamamı** (son JSX düzenlemesi dahil) tamamlandıktan sonra alınan taze, komple bir koşum. Bana verilen taban **2018 geçen / 0 başarısız**'dı. Benim turum iki yeni test dosyası/bloğu ekledi: `resolveVisibilityUpdateData` için 6 test + `resolveServerJoinErrorMessageKey` için 5 test = **+11**. Toplam fark +14 (2018→2032); kalan +3, ağaçtaki başka eşzamanlı işlerin kendi testleri (görev tanımının da beklediği gibi: "A concurrent pass may add a few"). Sıfır başarısız — bar karşılandı.

Odaklı koşumlar (hepsi taze, tüm düzenlemelerden sonra):

```
$ node --import tsx --test --test-force-exit src/lib/workspace/server-service.test.ts src/lib/servers/discovery-presentation.test.ts
ℹ tests 19
ℹ suites 4
ℹ pass 19
ℹ fail 0
```

`00 §5`'in belirttiği tuzağa göre bu odaklı koşum `node --import tsx --test` ile doğrudan çağrıldı (paket `test` betiği dosya argümanını yok sayıyor); köşeli parantezli dizin bu iki dosyanın yolunda yok, kaçış gerekmedi.

**Kapı notu:** `Invoke-LocalGate.ps1` (Standard/Mobile) ve mobil `pnpm --filter @wizards/mobile test[:components]` komutlarını **koşmadım.** Bana verilen "Doğrula" bölümü yalnız web typecheck + web test suite'i listeliyor; mobil hem kapsam dışı (`apps/mobile/**`'e dokunma yasağı) hem de ayrı bir eşzamanlı geçişin sorumluluğunda. Tam dalga kapısı muhtemelen web+mobil+backend'i birleştiren son bir turda koşulacak.

---

## Ekran görüntüsü

**Alınamadı — dürüstçe.** İki bağımsız engel var:

1. `apps/web/.env` bu sandbox'ta `DATABASE_URL=` dahil tüm gerçek gizli değerleri **boş** bırakıyor (iskelet dosya). `wizards-web` dev sunucusunu (`.claude/launch.json`) başlattığımda `packages/db/src/pool-options.ts` "DATABASE_URL is required" ile çöktü — doğruladım, log'u gördüm. `apps/web/.env`'i değiştirmedim (görevim değil, gerçek bir çalışan Postgres URL'i bilmiyorum, ve dosyayı sahte bir değerle doldurmak yanıltıcı/istenmeyen bir yan etki olurdu).
2. Bu engeli aşsam bile `/discover` rotası `app/(main)/layout.tsx` → `requireAuth()` arkasında — gerçek bir NextAuth oturumu gerektiriyor. Güvenlik kurallarım "Creating accounts, or entering passwords to authenticate" eylemini **yasaklıyor**; bu sandbox'ta kullanabileceğim, izin verilen bir test oturumu yok. Bu engel, birinci engel çözülse bile kalıcı.

Bu yüzden ne kod derleme hatası maskeleniyor ne de görsel iddia uyduruluyor: doğrulama tamamen typecheck + gerçek test koşumlarına dayanıyor, görsel değil. `preview_start`/`preview_logs` ile denemeyi gerçekten yaptım (yalnız iddia etmiyorum) — sunucu 3000 portunda başladı, hemen çöktü, log'u okudum, durdurdum.

---

## Sapmalar

1. **Görünürlük okuma kaynağı S2'nin profil ucuna kaydırıldı.** Beklenen/doğal yol `WorkspaceServerDetailSchema`'ya `isPublic`/`discoverable`/`type` eklemekti, ama bu `packages/types/**`'e dokunmayı gerektirirdi (yasak — "mobil geçiş ve backend geçişi sahibi"). Bunun yerine ayar katmanı, sahibin zaten koşulsuz görebildiği `GET /api/v1/servers/[serverId]/profile`'ı (`fetchServerPublicProfile`) ikinci bir sorgu olarak çağırıyor. Maliyeti: ayarlar açıldığında bir ekstra ağ isteği (kanal listesi + arkadaş kesişimi dahil, kullanılmayan alanlarla birlikte gelir); kazancı: sözleşme sınırına dokunmadan çalışıyor, tek kaynak (`ServerPublicProfileSchema`) iki yüzeyde (profil kartı + ayarlar) aynı gerçeği söylüyor.
2. **`server-profile-card.tsx`'e gerçek katılma mutasyonu kablolandı** — bu dosya benim açık "ne inşa edilecek" listemde yoktu (yalnız C: ayarlar, D: keşif rotası, E: kopya). Ekledim çünkü: (a) Bölüm E'nin "banlı/dolu/kapalı ayrı dürüst metin" gereksinimi gerçek bir çağıran olmadan anlamsız kalırdı, (b) S2'nin kendi kod yorumu bu işi açıkça S3'e devretmişti ("instead of a join mutation, which ships in S3"), (c) olmadan keşif akışı uçtan uca çalışmazdı — kart tıkla → profil → "Sunucuya katıl" hâlâ bozuk `/invite/{serverId}` bağlantısına giderdi. Diff küçük ve izole: yalnız "go" olmayan dal değişti, "zaten üye" dalı (mevcut `Link`) dokunulmadan kaldı.
3. **`ServerDiscoveryClientError` tek sınıf, iki çağıran için** (`fetchServerDiscoveryPage` + `joinPublicServerRequest`) — üçüncü, neredeyse aynı bir hata sınıfı yazmak yerine. `ServerProfileClientError` (S2'nin) dokunulmadan ayrı kaldı.
4. **Liste yükleme hatası için yeni anahtar yazılmadı** — mevcut `errors.genericTitle`/`errors.genericDescription`/`errors.retry` yeniden kullanıldı. Bu bir "katılma hatası" değil (o üçü ayrı, dürüst metinler aldı), sıradan bir ağ/yükleme arızası; mevcut örnek (`ServerProfileError`) de aynı tonu kullanıyor.
5. **COMMUNITY sunucuda anahtarlar metinle değiştirilmedi, disabled + metin birlikte gösterildi.** İlk taslağım "salt okunur" ifadesini "anahtarları gizle, yalnız sebep metni göster" olarak okumuştu; ikinci geçişte "ikisi de salt okunur" ifadesinin daha doğal okunuşunun "anahtarlar görünür kalır, disabled olur, üstünde sebep yazar" olduğuna karar verdim (bir COMMUNITY sahibi kendi sunucusunun şu an public/keşfedilebilir olup olmadığını hâlâ görebilmeli). Kod ve rapor bu ikinci kararı yansıtıyor.
6. **Web'de `/discover`'a kabuk içi bir giriş noktası eklenmedi** (bkz. Eklenmeyenler) — bana verilen Bölüm D tarifi yalnız rotanın kendisini, kart ızgarasını, aramayı ve sonsuz kaydırmayı listeliyordu; mobil tarafın aksine ("üç navigasyon kaydı") web için açık bir gezinme kaydı istenmedi.

## Eklenmeyenler

- **Mobil (Bölüm C/D/E'nin mobil yarısı)** — açıkça kapsam dışı, hiç açılmadı.
- **`apps/web/src/components/shell/server-rail.tsx` / `workspace-modals.tsx`'e keşif giriş noktası** — "+" akışına ya da sunucu oluştur/katıl modalına bir "Keşfet" bağlantısı eklemeyi değerlendirdim (mobilin `mobile-server-create-join-sheet.tsx`'teki doğal yerine web analoğu olurdu), ama bana verilen Bölüm D tarifinde yoktu ve `server-rail.tsx`/`workspace-modals.tsx` her ikisi de büyük, başka işlerin de dokunduğu dosyalar — gereksiz risk. Rota şu an yalnız doğrudan URL ile ya da programatik `Link` ile erişilebilir. Bu gerçek bir boşluk, bilerek bırakıldı.
- **Görsel doğrulama / ekran görüntüsü** — yukarıda gerekçelendirildi (env + auth engeli).
- **Bileşen (`.test.tsx`) testleri** yeni UI için (görünürlük paneli, keşif ekranı, katılma butonu) — bu kod tabanında `components/shell/` ve `components/servers/` altında **hiç** emsal yok (sıfır `.test.tsx` dosyası, `git grep` ile doğrulandı); tüm örnekler `components/admin/sections/` altında. Mevcut deseni takip ettim: bu iki dizin test edilmiyor. Saf mantığı (`resolveVisibilityUpdateData`, `resolveServerJoinErrorMessageKey`) ayrı fonksiyonlara çıkarıp `node:test` ile test ettim — kod tabanının "saf yarı + DB/DOM'suz test edilebilir" ilkesini React'e taşıyan tek makul karşılık buydu.
- **ESLint** — ayrı bir lint koşumu yapmadım; bana verilen "Doğrula" listesi yalnız typecheck + test suite'i istiyordu.
- **`graphify update .`** — kök `CLAUDE.md` bunu her kod değişikliğinden sonra istiyor, ama `graphify-out/**` bana açıkça yasaktı. AB raporunun da işaret ettiği aynı çelişki; yasağa uydum, koşmadım.
- **Eski `[type, discoverable, memberCount]` index'i / EXPLAIN kanıtı** — Bölüm A'nın (AB turu) sorumluluğu, zaten kapandı, benim turumda tekrar açılmadı.

## Kaygılar

1. **Görsel parite hâlâ doğrulanmadı** — S2'den devralınan bilinen boşluk artık keşif kartı için de geçerli: tasarım kaynağı yalnız 2g profil kartı için var (`design_handoff_whispr_hakkinda`), keşif kartı için ayrı bir tasarım dokümanı yoktu; profil kartının kurulu görsel dilini (aynı gradyan, aynı yarıçap ölçeği, küçültülmüş) birebir yeniden kullandım ama hiçbir tasarımcı onayından geçmedi.
2. **Ayarlar paneli her açıldığında ekstra bir ağ isteği** (`fetchServerPublicProfile`) — bkz. Sapma 1. Ölçülmüş bir yavaşlık değil, mimari bir sınır kısıtının sonucu; önbelleğe alma eklemedim (`00 §2` yasağı: ölçülmemiş yavaşlık için önbellek katmanı yok).
3. **`resolveVisibilityUpdateData` yalnız `updateWorkspaceServer`'ın tek yazma noktasında zorunlu kılınıyor.** Bugün `isPublic`/`discoverable`'a yazan tek yol bu (tüketici PATCH ucu). İleride ikinci bir yazma yolu (ör. bir admin toplu düzenleme ucu) eklenirse bu kuralı ya tekrar yazmalı ya da `resolveVisibilityUpdateData`'yı içe aktarmalı — kendiliğinden miras alınmıyor.
4. **`joinPublicServerRequest` sonrası "zaten üye" (`alreadyMember: true`) yanıtı istemcide özel olarak ele alınmıyor** — `{success:true}` her iki durumda da aynı, buton aynı şekilde `/channels/{id}`'e yönlendiriyor. Backend'in kendi idempotency kararıyla (200, hata değil) tutarlı, ayrı bir dal gerektirmedi.
5. Arka planda aynı makinede birçok başka ajan oturumu eşzamanlı çalışıyordu (Get-Process ile 30+ node süreci gördüm) — bu, ilk arka plan test koşumumu anormal derecede yavaşlattı (hiç çıktı üretmeden uzun süre asılı kaldı). Ön planda tekrar koşturunca 24 saniyede temiz sonuç aldım. Bu benim kodumdan kaynaklanan bir sorun değildi, ama makinenin şu an ağır yük altında olduğunu not ediyorum.

---

## Değiştirilen / eklenen dosyalar

**Değiştirildi:**

- `apps/web/src/lib/workspace/server-service.ts`
- `apps/web/src/lib/workspace/server-service.test.ts`
- `apps/web/src/lib/workspace/client.ts`
- `apps/web/src/components/shell/server-settings-overlay.tsx`
- `apps/web/src/components/shell/shell-skeletons.tsx`
- `apps/web/src/components/servers/server-profile-card.tsx`
- `apps/web/src/lib/servers/client.ts`
- `apps/web/src/lib/locale/messages/tr.ts`
- `apps/web/src/lib/locale/messages/en.ts`

**Yeni:**

- `apps/web/src/app/(main)/discover/page.tsx`
- `apps/web/src/components/servers/server-discovery-screen.tsx`
- `apps/web/src/lib/servers/discovery-presentation.ts`
- `apps/web/src/lib/servers/discovery-presentation.test.ts`

Hiçbiri commit edilmedi (`git add`/`git commit` hiç koşulmadı, iş çalışma ağacında bırakıldı).
