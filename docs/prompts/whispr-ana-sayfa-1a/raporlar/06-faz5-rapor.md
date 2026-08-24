# Faz 5 raporu — Etkileşimler, odak modu ve komut paleti

Tarih: 2026-08-19 · Branch: `uat` · Commit: yok (izin bekliyor)

Kartlar çalışır hâle geldi. SPEC §4'ün 17 satırının hepsi bağlı, odak modu üç yüzeyde tek
kaynaktan okuyor, ⌘K paleti açılıyor. Ön koşul kontrolü: Faz 3'ün `PATCH /users/me/presence` ve
`GET /search/command` uçları **çalışıyor** ve iki migration geliştirme veritabanına uygulanmış
(04-faz3-rapor §7.3, `prisma migrate status` "up to date"), o yüzden başlamadan soru sorulmadı.
`/mentions` ve `/events` için Faz 2'nin kararı (gerçek rotaya bağla, kısa süre 404 kabul) palet
komutlarında ve `Takvim` butonunda aynen izlendi.

Dört karar başlamadan soruldu; cevaplar §8'de.

---

## 1. Yapıldı

### A. Etkileşim envanteri (SPEC §4 · 06 §1)

17 satırın hepsi çalışıyor. Faz 5'te bağlananlar:

| Öğe                     | Ne yapıldı                                                |
| ----------------------- | --------------------------------------------------------- |
| Arama alanı / `⌘K`      | Komut paletini açar (§E)                                  |
| "Kaldığın yer" satırı   | Gezinmeden önce rozet yerel sıfırlanır (§B.4)             |
| Oda kartı `Katıl`       | Mevcut ses akışını çağırır, `Ayrıl`'a döner (§D)          |
| İstek satırı `Yanıtla`  | Hedefe `?compose=1` ile gider, besteci odaklanır          |
| İstek satırı `Kabul et` | İyimser kabul, hata olursa satır geri gelir (§B.2)        |
| Durum çipleri           | İyimser presence yazımı (§B.1)                            |
| `Rahatsız etmeyin`      | Odak modu toggle'ı + geri sayım (§C)                      |
| `Hatırlat`              | `interested` alanından okunan kalıcı durum (§B.3)         |
| `Takvim`                | `/events`                                                 |
| Arkadaş kartı           | Sol tık DM açar, sağ tık / `Shift+F10` bağlam menüsü (§F) |

Kalan yedi satır (ray ikonu, ray `+`, nav satırları, sunucu listesi satırı, kullanıcı ayağı
ikonları, bildirim butonu, dalga formu) **mevcut davranışlarıyla** zaten çalışıyordu; bu fazda
yeniden yazılmadılar.

### B. İyimser güncellemeler (06 §2)

Ortak kural üç parçaya bölündü ve **hepsi saf**: cache dönüşümleri `lib/home/optimistic.ts`,
`onMutate`/`onError`/`onSettled` üçlüleri `lib/home/mutations.ts`, React bağlantısı hook'ta.
Fabrikalar hook değil düz fonksiyon: `QueryClient` + `MutationObserver` React olmadan da koşuyor,
bu yüzden **"uç 500 dönünce satır geri gelir"** bir yorum değil, bir birim testi
(`mutations.test.ts`).

- **Presence çipi.** Tık anında çip değişir → `PATCH` → hata olursa eski değere döner + kartın
  içinde tek satır uyarı. `presence:update` geldiğinde sunucu değeri kazanır (Faz 3'ün hedefli
  yamalaması korunuyor). Aynı çipe ikinci tık `planPresencePick` `null` döndürdüğü için **istek
  üretmez**.
- **Kabul et.** Satır hemen çıkar, `newCount` ve `total` birer azalır (sıfırın altına inmez).
  Arkadaşlık isteği mevcut `friends/request/[id]` ucuna gider. Sunucu daveti için web'de bir uç
  **yoktu**; kullanıcı kararıyla yazıldı (§1.G). Hata → satır **kendi yerine** geri döner
  (sayaçlar okunan değere döner, "mevcut + 1"e değil: soket olayı arada sayacı oynatmış olabilir).
  Uçuştaki satırın butonu `disabled`; aynı satır iki kez kabul edilemez. Başarıda `app/awaiting` +
  `app/summary` invalidate.
- **Hatırlat.** Buton metni `interested` alanından okunuyor ve **öyle kalıyor**; ikinci basış
  ilgiyi kaldırıyor. İyimser sayaç yalnız bayrak gerçekten değiştiğinde oynuyor, yani ikinci tık
  katılımcı sayısını şişirmiyor (`ScheduledEventInterest` zaten idempotent).
- **Kaldığın yer.** Satıra tıklayınca `unreadCount` ve `mentioned` yerel olarak sıfırlanıyor.
  **İkinci bir "read" çağrısı yok** — gerçek işaretleme hedef ekranın mevcut davranışı.
- Hata yolunun tamamı **hedefli cache yazımı**; hiçbir `onError` `refetch` çağırmıyor.

### C. Odak modu (06 §3, karar #4)

- **Durum makinesi saf** (`lib/home/focus-machine.ts`), dört geçiş testli: kapalı→açık,
  açık→kapalı (toggle), açık→kapalı (süre dolumu), ve çip seçimi. Süre **sabit 25 dk**.
- **Toggle açıkken çipler kilitlenmiyor**: seçim `statusRestoreTo`'yu değiştiriyor, yayınlanan
  durum `DND` kalıyor. Tasarımdaki "Çevrimiçi seçili + DND açık" görüntüsünün karşılığı bu.
- **Geri sayım mutlak zamandan.** `HomeFocus`'a `expiresAt` eklendi (§1.F); `useFocusCountdown`
  onu okuyor, sayaç tutmuyor. Tik **dakikada bir**, `setInterval` unmount'ta temizleniyor, sekme
  gizliyken interval **duruyor** ve geri gelince değer mutlak tarihten yeniden hesaplanıyor.
  Motor React'tan ayrı bir düz nesne (`lib/home/focus-countdown.ts`): zamanlayıcı, saat ve
  görünürlük kaynağı parametre, bu yüzden sözleşmenin tamamı sahte saatle testli.
- **Süre dolduğunda istemci `PATCH` göndermiyor.** Yalnız kendi görünümünü tazeliyor ve
  `presence:update` bekliyor. Çift kapatma yarışı yok.
- **Tek interval.** Üç yüzey (üst çubuk pill'i, kullanıcı ayağı satırı, `Durumun` kartı) ve palet
  aynı modül seviyesi motora abone; dördüncü okuyucu dördüncü timer açmıyor. Son abone çıkınca
  timer kapanıyor.

### D. Sesli odaya katılma (06 §4)

- `Katıl` **mevcut** akışı çağırıyor: sunucu ses kanalı `joinChannel({channelId, serverId})`,
  grup DM araması ise DM çağrı denetleyicisinin yeni `joinOngoingCall`'ı (§1.G).
- `joinedVoiceRoomId` voice context'ten okunuyor (`activeChannelId ?? activeConversationId`);
  ekran kendi kopyasını tutmuyor.
- Katılınca kart kenarı `--success/0.35`, buton `Ayrıl`.
- **Başka odadayken `Katıl`:** mevcut akışın davranışı — `joinVoiceSession` önce eskisinden
  çıkıyor, sonra yenisine giriyor. Yeni onay diyalogu **uydurulmadı**.
- Çift tık: buton uçuşta `disabled`, `useMutation.isPending` ikinci çağrıyı düşürüyor ve
  `joinVoiceSession`'ın kendi `isAlreadyJoiningTarget` kapısı üçüncü kez engelliyor.

### E. Komut paleti (06 §5)

`components/command/command-palette.tsx` + `command-palette-provider.tsx`.

- `⌘K` / `Ctrl+K`, **tek global dinleyici** (sağlayıcıda). Input içindeyken tetiklenmiyor; tek
  istisna paletin kendi girdisi, çünkü açıkken ikinci basış **kapatmak** zorunda.
- Mevcut portal deseniyle (`createPortal(..., document.body)`) çiziliyor; yeni portal mekanizması
  kurulmadı. `Modal` bileşeni kullanılmadı: paletin gezinmesi `aria-activedescendant` üzerinden,
  `Modal`'ın Tab tuzağıyla aynı anda iki odak modeli olurdu.
- `dynamic(..., { ssr: false })` ile bölünüyor; palet açılmadan ne bileşen ne sorgusu yükleniyor.
- Genişlik **560** (`HOME_METRICS.commandPalette`), kabuk içinde ortalı. Arama debounce **200 ms**.
- Gruplar `Sunucular · Kanallar · Mesajlar · Kişiler · Komutlar` sırasında; komutlar hep sonda.
  Boş sorguda son ziyaretler + komut listesi.
- Klavye: `↑`/`↓` dolanarak gezinme, `Enter` seçim, `Esc` kapatma, Tab tuzağı, açılışta girdiye
  odak, kapanışta **tetikleyiciye dönüş**. `role="listbox"` / `role="option"` +
  `aria-activedescendant`.
- Komutlar istemcide statik (06 §5.3'ün yedi satırı) ve koşullu: `Odak modunu başlat` yalnız odak
  kapalıyken, `Odak modunu bitir` yalnız açıkken. Palet listesi **güvenlik sınırı değil**; hedef
  rota kendi guard'ını uyguluyor.
- Güvenlik: sonuç href'leri `toRelativeAppHref` kapısından geçiyor ve **geçmeyen satır hiç
  çizilmiyor** (tıklanamaz satır klavye listesinde tuzaktır). Arama sorgusu URL'e yazılmıyor.
  429'da sakin bir satır çıkıyor ve `retry: false` ile istek tekrarlanmıyor.

### F. Arkadaş kartı bağlam menüsü (06 §6)

Sağ tık → **mevcut** `ContextMenu`; yeni menü bileşeni yazılmadı. Öğeler `Mesaj gönder`,
`Profili gör`, `Sesli ara`. Klavye karşılığı `Shift+F10` ve `ContextMenu` tuşu (menü kartın alt
kenarına açılıyor). Sağ tık `preventDefault` ile DM'i tetiklemiyor. Palet açıkken overlay
tıklamayı yakaladığı için ikinci menü açılamıyor.

### G. Sözleşmeye dört ekleme

Dördü de ekranın çizemediği ya da yalan söyleyeceği bir boşluğu kapattığı için yapıldı; üçü
kullanıcı onaylı (§8).

1. **`HomeFocus.expiresAt`** — DTO yalnız `minutesLeft` taşıyordu. Geri sayımı ondan türetmek
   06 §9'un yasakladığı sayaç olurdu; alan artık sunucunun mutlak damgasını taşıyor
   (`resolveFocusState`).
2. **`HomeLiveRoom.serverId`** — `joinChannel({channelId, serverId})` id istiyor, DTO'da yalnız
   `serverName` vardı. Grup aramasında `null`.
3. **`HomeNextEvent.serverId`** — ilgi ucu `servers/[serverId]/events/[eventId]` yolunda; id'yi
   `href`'ten regex ile sökmek butonu bir görüntü bağlantısının şekline bağlardı.
4. **`POST /api/v1/servers/join`** (yeni uç, kullanıcı kararı). Web'de davet kodunu kullanan tek
   yol `/invite/[code]` sayfasının **her dalda `redirect()` eden** server action'ıydı; iyimser bir
   satır reddi hiç göremezdi. Uç, `/invite` sayfasının çağırdığı **aynı**
   `joinWorkspaceServerByInvite`'ı çağırıyor — ikinci bir üyelik yazıcısı yok. Davet kodu gövdede,
   yolda değil (erişim kayıtlarına ve referrer'a sızmasın diye).

### H. Erişilebilirlik: ölçülen ve kapatılan altı kontrast ihlali

`e2e:a11y`'e Ana Sayfa ve komut paleti taramaları eklendi. Ana Sayfa taraması **kırmızı geldi**:
koyu temada altı ciddi (serious) WCAG AA renk kontrastı ihlali. Hiçbiri Faz 5'in değil — Faz 2/4
renkleri. Kullanıcı kararı "şimdi düzelt" (§8).

Ölçülen (eşik 4.5:1):

| Yüzey                                  | Ön/arka               | Önce     | Sonra |
| -------------------------------------- | --------------------- | -------- | ----- |
| Nav aktif satırı                       | `#5966f3` / `#34394f` | **2,50** | ≥ 4,5 |
| `Tümünü gör` / `Gelen kutusu` / `Tümü` | `#5966f3` / `#34373d` | **2,62** | ≥ 4,5 |
| Aktif `Çevrimiçi` çipi                 | `#2bab74` / `#334745` | **3,37** | ≥ 4,5 |
| `<n> çevrimiçi` · `<n> oda açık`       | `#2bab74` / `#34373d` | **4,07** | ≥ 4,5 |

Düzeltme **yeni renk eklemiyor**: dört türetilmiş token (`--primary-readable`,
`--success-readable`, `--danger-readable`, `--warning-readable`) mevcut vurgu renklerini o temanın
kendi `--foreground`'ına doğru karıştırıyor (`color-mix(in srgb, … 60%, …)`). Açık temada
koyulaşıyor, koyu temada açılıyor; 23 paletin hepsi elle ayarlanmadan aynı eşiği geçiyor.
**Dolgu ve kenar renkleri hiç değişmedi** — yalnız vurgu renginin _metin_ hâli değişti.

---

## 2. Dokunulan dosyalar

| Dosya                                                           | Yeni / Değişti    | Neden                                                                |
| --------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| `apps/web/src/lib/home/focus-machine.ts`                        | Yeni (171)        | Odak durum makinesi + çip planlaması, saf                            |
| `apps/web/src/lib/home/focus-machine.test.ts`                   | Yeni (11 test)    | Dört geçiş + çip kuralları                                           |
| `apps/web/src/lib/home/focus-countdown.ts`                      | Yeni (108)        | Geri sayım motoru (timer/saat/görünürlük parametre)                  |
| `apps/web/src/lib/home/focus-countdown.test.ts`                 | Yeni (8 test)     | Sahte saat: tik, cleanup, gizli sekme                                |
| `apps/web/src/lib/home/optimistic.ts`                           | Yeni (139)        | Beş saf cache dönüşümü                                               |
| `apps/web/src/lib/home/optimistic.test.ts`                      | Yeni (15 test)    | Çıkarma/geri koyma/sayaç tabanı                                      |
| `apps/web/src/lib/home/mutations.ts`                            | Yeni (221)        | `onMutate`/`onError`/`onSettled` fabrikaları                         |
| `apps/web/src/lib/home/mutations.test.ts`                       | Yeni (15 test)    | Gerçek `QueryClient` ile 500 → geri alma                             |
| `apps/web/src/lib/home/command-palette.ts`                      | Yeni (271)        | Komut listesi, grup sırası, klavye aritmetiği, href kapısı           |
| `apps/web/src/lib/home/command-palette.test.ts`                 | Yeni (16 test)    | Kısayol, süzme, sıra, dış bağlantı                                   |
| `apps/web/src/hooks/use-focus-countdown.ts`                     | Yeni (124)        | Motorun paylaşılan tek örneği                                        |
| `apps/web/src/hooks/use-home-actions.ts`                        | Yeni (247)        | Kabul / hatırlat / katıl / DM / uyarı satırları                      |
| `apps/web/src/components/providers/focus-controls-provider.tsx` | Yeni (184)        | Odak katmanı — üç yüzeyin tek kaynağı                                |
| `apps/web/src/components/command/command-palette.tsx`           | Yeni (445)        | Palet yüzeyi                                                         |
| `apps/web/src/components/command/command-palette-provider.tsx`  | Yeni (115)        | Tek global dinleyici + `dynamic()`                                   |
| `apps/web/src/components/command/command-palette.test.tsx`      | Yeni (13 test)    | Kaynak sözleşmesi: tek dinleyici, kod bölme, URL gizliliği           |
| `apps/web/src/components/home/home-interactions.test.tsx`       | Yeni (17 test)    | Kartların etkileşim markup'ı                                         |
| `apps/web/src/app/api/v1/servers/join/route{,-logic}.ts`        | Yeni (8 + 62)     | Davet koduyla katılma ucu                                            |
| `apps/web/src/app/api/v1/servers/join/route-logic.test.ts`      | Yeni (6 test)     | Kimlik → bütçe → zod → servis sırası                                 |
| `apps/web/e2e/specs/design/home-command-palette.spec.ts`        | Yeni (7 test)     | Gerçek klavye: aç/kapa, gezinme, odak dönüşü                         |
| `apps/web/src/lib/home/types.ts`                                | Değişti           | `focus.expiresAt`, `live.serverId`, `next.serverId`, join sözleşmesi |
| `apps/web/src/lib/home/focus.ts`                                | Değişti           | `resolveFocusState` mutlak damgayı da döndürüyor                     |
| `apps/web/src/lib/home/live-service.ts`                         | Değişti           | `serverId`                                                           |
| `apps/web/src/lib/home/events-service.ts`                       | Değişti           | `serverId`                                                           |
| `apps/web/src/lib/home/client.ts`                               | Değişti           | `joinServerByInvite`, `setHomeEventInterest`                         |
| `apps/web/src/lib/home/href.ts`                                 | Değişti           | `?compose=1` sözleşmesi (yaz + oku)                                  |
| `apps/web/src/lib/home/metrics.ts`                              | Değişti           | `commandPalette` ölçü grubu                                          |
| `apps/web/src/lib/home/metrics.test.ts`                         | Değişti           | Yeni grup                                                            |
| `apps/web/src/lib/api-rate-limit.ts`                            | Değişti           | `server:join` 20/10dk                                                |
| `apps/web/src/app/api/v1/route-contract.test.ts`                | Değişti           | Yeni ucun kaydı                                                      |
| `apps/web/src/app/globals.css`                                  | Değişti (+18)     | Dört `--*-readable` token                                            |
| `apps/web/src/components/home/home-presence-card.tsx`           | Değişti           | Çipler + toggle + geri sayım + uyarı                                 |
| `apps/web/src/components/home/home-awaiting-card.tsx`           | Değişti           | `Kabul et` butonu, `Yanıtla` bağlantısı                              |
| `apps/web/src/components/home/home-live-card.tsx`               | Değişti           | `Katıl`/`Ayrıl`, `--success/0.35` kenar                              |
| `apps/web/src/components/home/home-up-next-card.tsx`            | Değişti           | `Hatırlat` durumu, `Takvim` bağlantısı                               |
| `apps/web/src/components/home/home-continue-card.tsx`           | Değişti           | Rozetin yerel sıfırlanması                                           |
| `apps/web/src/components/home/home-friends-strip.tsx`           | Değişti           | DM + bağlam menüsü                                                   |
| `apps/web/src/components/home/home-top-bar.tsx`                 | Değişti           | Arama paleti açıyor, pill tek kaynaktan                              |
| `apps/web/src/components/home/home-command-center.tsx`          | Değişti           | `useHomeActions` bağlandı                                            |
| `apps/web/src/components/home/home-primitives.tsx`              | Değişti           | `HomeCardNotice` + okunabilir bağlantı rengi                         |
| `apps/web/src/components/home/home-cards.test.tsx`              | Değişti           | Yeni proplar + sağlayıcı sarmalayıcısı                               |
| `apps/web/src/components/shell/wizards-shell.tsx`               | Değişti           | İki sağlayıcı monte edildi                                           |
| `apps/web/src/components/shell/channel-sidebar.tsx`             | Değişti           | Kullanıcı ayağı odak satırı                                          |
| `apps/web/src/components/shell/app-nav-panel.tsx`               | Değişti           | Okunabilir vurgu rengi                                               |
| `apps/web/src/components/chat/chat-area.tsx`                    | Değişti           | `?compose=1` → besteci odağı                                         |
| `apps/web/src/hooks/use-dm-call.ts`                             | Değişti           | `joinOngoingCall`                                                    |
| `apps/web/src/lib/dm/call-state.ts`                             | Değişti           | `createJoiningCall` (saf)                                            |
| `apps/web/src/store/dm-call-store.ts`                           | Değişti           | `startJoining`                                                       |
| `apps/web/src/hooks/use-home-realtime.test.ts`                  | Değişti           | Fikstür alanları                                                     |
| `apps/web/src/lib/home/focus.test.ts`                           | Değişti           | `expiresAt` beklentisi                                               |
| `apps/web/src/app/api/v1/users/me/presence/route-logic.test.ts` | Değişti           | `expiresAt` beklentisi                                               |
| `apps/web/e2e/specs/a11y/a11y.spec.ts`                          | Değişti (+2 test) | Ana Sayfa + palet taraması                                           |
| `graphify-out/**`                                               | Değişti           | `graphify update .`                                                  |

---

## 3. Kapı çıktıları

| Komut                                                              | Sonuç                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `pnpm --filter @wizards/web test`                                  | ✅ exit 0 — **3144 test / 703 suite, 0 fail**, 75,0 sn (Faz 4: 3043/676)    |
| `pnpm typecheck`                                                   | ✅ exit 0 — 5/5 paket                                                       |
| `pnpm lint`                                                        | ✅ exit 0 — 5/5 paket, 0 hata 0 uyarı                                       |
| `pnpm --filter @wizards/web exec playwright test e2e/specs/design` | ✅ **12 passed / 11 skipped / 0 failed**                                    |
| `pnpm --filter @wizards/web e2e:a11y`                              | ✅ **6 passed / 0 failed** (4 mevcut + 2 yeni)                              |
| `pnpm --filter @wizards/db test`                                   | ✅ 31 test / 0 fail                                                         |
| `node scripts/quality/count-arbitrary-px.mjs`                      | ✅ `1190 değer / 120 dosya` (taban 1208/120; **yeni yüzeylerin katkısı 0**) |
| `graphify update .`                                                | ✅ 27549 düğüm, 64927 kenar, 1192 topluluk                                  |

Yeni testler: focus-machine 11 + focus-countdown 8 + optimistic 15 + mutations 15 + palette
model 16 + palette kaynak 13 + etkileşim markup 17 + join ucu 6 = **101**. (3043 + 101 = 3144 ✓.)
E2E tarafında +7 palet klavye testi, +2 a11y taraması.

### Kapının nasıl koşulduğu — dürüst not

Faz 4'ün §3'teki üç nedeni hâlâ geçerli, düzen aynı: dev sunucusu durduruldu → e2e ortamıyla
`pnpm build` → 3000'de `pnpm start` → `PLAYWRIGHT_SKIP_WEB_SERVER=1` ile playwright → sunucu
kapatıldı → **e2e bayrakları olmadan yeniden derlendi** → `next-env.d.ts` `git checkout` ile geri
alındı → `pnpm dev` geri başlatıldı (3000'de doğrulandı, `/login` 200).

`apps/web/.env` **değiştirilmedi**. Geçici ortam katmanı scratchpad'de bir kopya `.env` olarak
kuruldu ve koşu bitince silindi; `E2E_TEST_PASSWORD` yerel rastgele bir değerdi, dosyasıyla
birlikte silindi.

Faz 4'e göre iki ek ortam bulgusu (ikisi de harness farkı, ürün hatası değil):

1. `NEXT_PUBLIC_WHISPR_CHAT_PREVIEW` üretim derlemesinde verilmezse `/design/whispr-chat` 404
   döner ve `whispr-chat-preview.spec.ts`'in dördü de düşer. Playwright'ın kendi `webServer`'ı
   bunu vermiyor; elle koşuda derlemeye eklendi.
2. `UPLOADTHING_TOKEN` boş olunca ayarlar ekranındaki "yüklemeler kapalı" uyarısı çiziliyor ve
   `e2e:a11y`'nin ayarlar taraması kontrast ihlaliyle düşüyor. Playwright config'i normalde sahte
   bir token veriyor (`e2e-uploadthing-token`); elle koşuda aynısı verildi.
   → **Gerçek bir bulgu da var:** uploadthing kapalı yapılandırmada o amber uyarı satırı AA'yı
   geçmiyor. Bu Ana Sayfa'nın değil, ayarlar ekranının borcu (§6.3).

---

## 4. Ölçülen sayılar

| Ölçüm                                     | Değer                                              | Bütçe  | Durum |
| ----------------------------------------- | -------------------------------------------------- | ------ | ----- |
| Odak geri sayımının timer sayısı          | **1** (üç yüzey + palet tek motora abone)          | 1      | ✅    |
| Sekme gizliyken tik                       | **0** (interval kapanıyor)                         | 0      | ✅    |
| Unmount'ta kalan interval / dinleyici     | **0 / 0**                                          | 0      | ✅    |
| Süre dolduğunda istemciden çıkan `PATCH`  | **0**                                              | 0      | ✅    |
| Aynı çipe ikinci tıkta çıkan istek        | **0**                                              | 0      | ✅    |
| Uçuştaki `Kabul et` satırına ikinci istek | **0** (buton `disabled` + `isPending`)             | 0      | ✅    |
| `Katıl` çift tıkta katılma isteği         | **1** (üç ayrı kapı)                               | 1      | ✅    |
| Hata yolunda `refetch`                    | **0** (hepsi hedefli cache yazımı)                 | 0      | ✅    |
| Palet açılmadan çalışan sorgu             | **0** (`dynamic()` + koşullu render)               | 0      | ✅    |
| Palet arama isteği / tuş                  | debounce 200 ms                                    | 200 ms | ✅    |
| ⌘K global dinleyici sayısı                | **1**                                              | 1      | ✅    |
| Palet sonuçlarında dış bağlantı           | **0**                                              | 0      | ✅    |
| Arama sorgusunun URL'e yazılması          | **yok**                                            | yok    | ✅    |
| Ana Sayfa'da ciddi WCAG AA ihlali         | **0** (önce 6)                                     | 0      | ✅    |
| Komut paletinde ciddi WCAG AA ihlali      | **0**                                              | 0      | ✅    |
| Yeni renk / hex                           | **0** (dört token mevcut token'lardan türetiliyor) | 0      | ✅    |
| Yeni yüzeylerde arbitrary px              | **0**                                              | 0      | ✅    |

Kalan arbitrary px: **1190 değer / 120 dosya** (Faz 0 tabanı: 1208 / 120). Bu faz sayıyı
artırmadı.

### 4.1 Odak geri sayımı — ölçülen davranış

Gerçek tarayıcıda (§7.4): pencere açıldı (`25 dk`), sekme gizlendi, gizliyken saat 10 dakika ileri
alındı, sekme geri getirildi. Üç yüzeyin üçü de **15 dk** dedi. Sayaç tabanlı bir geri sayım geri
döndüğünde `25 dk` derdi.

---

## 5. Güvenlik kontrol listesi

`00-ortak-baglam.md` §5.1. Bu faz **bir** yeni uç yazdı (`POST /api/v1/servers/join`); liste onun
ve paletin üzerinden işletildi.

- [x] 1. **Kimlik.** Yeni uç `requireApiUserId()` ile başlıyor; `route-contract.test.ts` guard'ı
      ucun **kendi dosyasında** görüyor. Oturumsuz istek 401 ve davet **harcanmıyor** (testli).
- [x] 2. **Yetki.** Uç kendi üyelik yazıcısını yazmıyor; `/invite/[code]` sayfasının çağırdığı
      `joinWorkspaceServerByInvite`'ı çağırıyor — hedefli davet kontrolü, süre dolumu, kullanım
      sınırı ve ban kontrolü olduğu gibi işliyor. Reddi olduğu gibi yansıtıyor (403
      `INVITE_NOT_FOR_USER` testli).
- [x] 3. **Görünürlük redaksiyonu.** Bu faz presence okuyan yeni bir yol açmadı; palet sonuçları
      Faz 3'ün `search/command` ucundan geliyor ve orada redakte ediliyor.
- [x] 4. **Rate limit.** `server:join` 20/10 dk — mobil ikizinin (`mobile:server:join`) aynı
      tavanı, çünkü harcanan şey sayılabilir bir id değil bir sır. Kimlikten hemen sonra, gövde
      okunmadan uygulanıyor (sıra testli).
- [x] 5. **Zod.** Gövde `ServerJoinByInviteBodySchema` ile `.strict()` parse ediliyor; kod regex'i
      mobil şemayla birebir. Bozuk gövde 400 ve servis hiç çağrılmıyor (testli).
- [x] 6. **Dar DTO.** Yanıt üç alan: `alreadyMember`, `href`, `serverId`. Davet satırı ya da
      sunucu kaydı dökülmüyor.
- [x] 7. **Metadata / `actionUrl`.** Davet kodu satırın `href`'inden okunuyor — o da zaten
      `toRelativeAppHref` kapısından geçmiş. İstemci kodu **yeniden** doğruluyor (bir sonraki
      durağı bir istek gövdesi), sunucu **üçüncü** kez doğruluyor. Palet sonuçlarında aynı kapı:
      göreli olmayan href'li satır listeye hiç girmiyor (testli).
- [x] 8. **Komut yetki kontrolü.** Yedi komut istemcide statik ve koşullu (odak açık/kapalı).
      Palet listesi güvenlik sınırı **değil**; her komut mevcut bir yüzeyi açıyor ve o yüzey kendi
      guard'ını uyguluyor. Kod içinde de yazılı.

Ek: davet kodu **gövdede** taşınıyor, yolda değil — erişim kayıtlarına ve referrer başlığına
sızmasın diye. Arama sorgusu URL'e yazılmıyor (aynı gerekçe: geçmişte kalır).

---

## 6. Açık kalan / devreden

1. **`kind: 'call'` odasına katılma canlı bir aramada denenmedi.** İstemci yolu yazıldı
   (`dm:call:join` yayınla → `joinDirectCall`) ve soket işleyicisi Faz "grup sohbetleri"nden beri
   duruyor, ama yerelde LiveKit ve ikinci bir hesap olmadığı için uçtan uca koşulamadı.
   → **elle doğrulama** (§7.6) ya da realtime paketi.
2. **`Sesli ara` bağlam menüsünden çağrı başlatıyor ama zil karşı tarafta doğrulanmadı** (aynı
   neden). → aynı yer.
3. **Ayarlar ekranındaki "yüklemeler kapalı" uyarısı AA'yı geçmiyor** (`border-amber-400/25` +
   `text-amber-600`). Yalnız `UPLOADTHING_TOKEN` boşken çiziliyor, o yüzden varsayılan kapıda
   görünmüyor. Bu paketin yüzeyi değil. → **ayarlar / a11y borcu**.
4. **Parity matrisinin tema ekseni hâlâ çalışmıyor** (Faz 4 §6.1). 11 kombinasyon `test.skip`.
   → **Faz 8**.
5. **44px tıklama hedefi ↔ tasarım çelişkisi** duruyor (Faz 4 §6.2). → **Faz 8 kararı**.
6. **`e2e/specs/design` yerel olarak yalnız üretim derlemesiyle koşuyor** ve iki ek ortam
   değişkeni istiyor (§3). → **CI / araç borcu**, Faz 8.
7. **Palet "son ziyaretler" listesi boş sorguda ucun döndürdüğü sırayı gösteriyor**; gerçek bir
   "en son ziyaret edilen" sıralaması yok (Faz 3 ucu böyle). → **Faz 6 / arama paketi**.
8. **Odak süresi seçilebilir değil** — 25 dk sabit (06 §3.1 böyle istiyor). Farklı süre ürün
   kararı. → **karar bekliyor**.
9. Faz 1/2/3/4'ten devreden ve bu fazda kapanmayan: linux görsel baseline'ları bayat,
   `Message.replyToId` indeks borcu, `awaiting.newCount` 24 saatlik yaklaşımı (Faz 6), sunucu
   daveti satırının aktörü, `events/upcoming.totalCount` sınırsız `count`, `kind: 'game'` ürüne
   çıkmıyor, arkadaş durum metninde ek uyumu (Faz 7), oda açıklamasının arkadaş sayısını değil
   toplam katılımcıyı sayması.

---

## 7. Kullanıcı doğrulaması gereken maddeler

1. `pnpm --filter @wizards/web test` → **3144 test / 0 fail** (Faz 4: 3043).
2. `pnpm typecheck`, `pnpm lint` → 5/5 paket yeşil, uyarı yok.
3. **Odak modu (elle).** `/home` aç → `Durumun` kartındaki `Rahatsız etmeyin` toggle'ına bas.
   Üç yerin üçü de aynı anda `25 dk` demeli: üst çubuk pill'i (`Odak · 25 dk`), kullanıcı ayağı
   satırı (`Odak modu · 25 dk`), kart altındaki açıklama (`25 dk sonra otomatik kapanır`).
   Ölçülen: `{"pill":"Odak · 25 dk","card":"25 dk sonra otomatik kapanır","footer":"Odak modu · 25 dk"}`.
   Kanıt: `raporlar/kanit/faz5-odak-modu-1360.png`.
4. **Sekme gizlenip açılınca geri sayım (elle doğrulandı).** Gerçek tarayıcıda: odak açıldı,
   sekme gizlendi (`visibilitychange`), gizliyken sayfanın saati 10 dk ileri alındı, sekme geri
   getirildi. Gizliyken pill **`Odak · 25 dk`** kaldı (tik yok); geri dönünce üç yüzey de
   **15 dk** dedi. Mutlak zamandan yeniden hesaplama çalışıyor, uyku sonrası yanlış sayı yok.
5. **Odak açıkken çip seçimi.** Odak açıkken `Çevrimiçi` çipine bas: çip seçili görünür ama
   yayınlanan durum `DND` kalır (pill ve ayak satırı hâlâ odak diyor). Toggle'ı kapat: durum
   `Çevrimiçi`'ye döner.
6. **Sesli odaya katılma (elle, ikinci hesap gerekir).** Bir sunucu ses kanalına başka bir
   hesapla gir; `/home`'daki "Şu an canlı" kartında oda görünmeli. `Katıl` → buton `Ayrıl` olur,
   kart kenarı yeşile döner. Hızlıca iki kez tıkla: ağ sekmesinde **tek** katılma akışı
   görünmeli. Grup DM aramasında da aynısını dene (§6.1'de açık madde).
7. **Komut paleti.** `Ctrl+K` (macOS'ta `⌘K`) → palet açılır, girdi odakta. `↑`/`↓` ile gez,
   `Esc` ile kapat — odak arama alanına döner. Tekrar `Ctrl+K` → kapanır, ikinci palet açılmaz.
   `odak` yaz → yalnız `Odak modunu başlat` kalır; `Enter` odak penceresini açar.
   Kanıt: `raporlar/kanit/faz5-komut-paleti-1360.png`.
8. **Kabul et geri alma (elle).** DevTools'ta `PATCH /api/v1/friends/request/*`'ı 500'e zorla,
   sonra "Yanıt bekliyor" kartında `Kabul et`'e bas: satır önce çıkar, sonra **kendi yerine**
   geri gelir ve kartın altında `Kabul edilemedi, tekrar dene` satırı belirir.
9. **Arkadaş kartı.** Sol tık DM açar; sağ tık (ya da kart odaktayken `Shift+F10`) menüyü açar ve
   **DM'i açmaz**. Menüde üç öğe: `Mesaj gönder`, `Profili gör`, `Sesli ara`.
10. Dev sunucun **geri başlatıldı** (`pnpm dev`, port 3000, `/login` 200 doğrulandı). `.next` ve
    `dist` e2e bayrakları olmadan yeniden derlendi; `next-env.d.ts` geri alındı.
11. `graphify-out/` güncel: 27549 düğüm / 64927 kenar.

### Kasten bozma denemeleri (koşuldu ve geri alındı)

- `optimistic.ts`'te `restoreAwaitingItem`'in sayaçları `removed`'dan değil mevcut değerden
  türetmesini sağla → "satır ve sayaç geri gelir" kırmızı.
- `focus-countdown.ts`'te `destroy`'dan `unsubscribe()` satırını sil →
  "unmount'ta ne interval ne dinleyici bırakır" kırmızı.
- `focus-countdown.ts`'te gizlendiğinde `stop()` çağrısını kaldır →
  "gizli sekmede tik atmaz" kırmızı.
- `command-palette.ts`'te `toRelativeAppHref` kapısını kaldır →
  "göreli olmayan href'li satırı düşürür" kırmızı ve e2e "dış bağlantı yok" kırmızı.
- `focus-machine.ts`'te odak açıkken çip seçimini `status`'a yaz →
  "çip dönüş hedefini değiştirir, görünen durumu değil" kırmızı.
- `command-palette-provider.tsx`'te `isOpen` kontrolünü kaldır →
  e2e "tekrar basmak kapatır, ikinci palet açılmaz" kırmızı.

---

## 8. Sorulan / sorulacak kararlar

| Konu                                                               | Durum                     | Cevap / gerekçe                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| İyimser yazım düşünce hata mesajı nerede görünsün                  | **Soruldu, cevap alındı** | "İlgili kartın içinde şerit". Web'de toast altyapısı yok (`sonner`/`Toaster`/`useToast` yok; hafızadaki toast standardı **mobil**). Mevcut web deseni `friends-view.tsx`'in `role="status" aria-live="polite"` şeridi; `HomeCardNotice` onu kartlara taşıdı, ~5 sn sonra kayboluyor. |
| Sunucu daveti "Kabul et" hangi uca gitsin                          | **Soruldu, cevap alındı** | "Web'e katılma ucu ekle". Var olan tek yol her dalda `redirect()` eden server action'dı; iyimser satır reddi göremezdi. Yeni uç **aynı** `joinWorkspaceServerByInvite`'ı çağırıyor, ikinci üyelik yazıcısı yok (§1.G.4).                                                             |
| `kind:"call"` satırının `Katıl`'ı                                  | **Soruldu, cevap alındı** | "İkisini de uçtan uca geliştirelim". Ses kanalı `joinChannel`, grup araması DM çağrı denetleyicisine eklenen `joinOngoingCall` (mevcut `dm:call:join` soket işleyicisini kullanıyor, yeni sunucu işi yok).                                                                           |
| Üç DTO alanı (`focus.expiresAt`, `live.serverId`, `next.serverId`) | **Soruldu, cevap alındı** | "Üçünü de ekle". Gerekçeler §1.G'de.                                                                                                                                                                                                                                                 |
| Ana Sayfa'daki altı WCAG kontrast ihlali                           | **Soruldu, cevap alındı** | "Şimdi düzelt". Dört türetilmiş token (`--*-readable`), yeni renk yok, dolgular değişmedi (§1.H). Kapı artık 6/6 yeşil ve hiçbir test bastırılmadı.                                                                                                                                  |
| Odak süresi 25 dk sabit                                            | Karar verildi             | 06 §3.1 bu pakette sabit istiyor. Seçilebilir süre ürün kararı (§6.8).                                                                                                                                                                                                               |
| `Profili gör` hedefi `/channels/@me?user=<id>`                     | Karar verildi             | Web'de ayrı profil rotası yok; Faz 3'ün `search/command` ucu **aynı** hedefi üretiyor (`HOME_FRIENDS_HREF`). İkinci bir geçici hedef uydurmak Faz 2 kararıyla çelişirdi.                                                                                                             |
| Palet `Modal` bileşenini kullanmıyor                               | Karar verildi             | Palet `listbox` + `aria-activedescendant` ile geziliyor; `Modal`'ın Tab tuzağıyla aynı anda iki odak modeli olurdu. Portal mekanizması yine de mevcut olan (§1.E).                                                                                                                   |
| Odak katmanı ayrı bir sağlayıcıda                                  | Karar verildi             | Üç yüzeyden ikisi (`kullanıcı ayağı`, üst çubuk) Ana Sayfa'nın dışında; katmanı `useHomeActions` içinde tutmak §3.3'ün "tek kaynak" maddesini imkânsız kılardı. Kullanıcı ayağı ayrıca kabuk dışında da render edildiği için **tolere eden** `useOptionalFocusControls`'u okuyor.    |
| Geri sayım motoru React'tan ayrı                                   | Karar verildi             | Depoda DOM yok; hook olarak yazılsaydı "unmount'ta interval bırakmıyor" maddesi ancak yorumla iddia edilebilirdi. Motor parametreli olduğu için sahte saatle testli (§1.C).                                                                                                          |
| `?compose=1` yeni bir query parametresi                            | Karar verildi             | "Yanıtla besteciyi odaklar" için hedef ekranla paylaşılan bir işaret gerekiyordu; `?message=` zaten aynı yolla taşınıyor. `chat-area` onu `useSyncExternalStore` ile okuyor (sunucu anlık görüntüsü `false`, hidrasyon uyuşmazlığı yok).                                             |
