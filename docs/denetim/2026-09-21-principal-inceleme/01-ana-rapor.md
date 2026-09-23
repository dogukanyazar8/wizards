# Whispr — Principal inceleme (2026-09-21)

Rol: principal SWE + güvenlik + performans + ürün mimarisi. Tek ajan. Analiz; kod düzeltmesi yok.

## 0. Sabitlenen durum

| Alan                               | Değer                                                                                                                                                                                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                             | `main` (yerel)                                                                                                                                                                                                                                                                                        |
| HEAD                               | `95493d2815b6f2439d79ccf3071380f673860c45` (2026-09-18, "chore(graph): refresh desktop and release map")                                                                                                                                                                                              |
| `main` / `origin/main` (yerel ref) | ikisi de HEAD ile aynı. Uzak ref `git fetch` ile tazelenmedi — uzak durum yalnız `gh` üzerinden okundu (bkz. F-06, 02-kanıt matrisi).                                                                                                                                                                 |
| Staged                             | 0                                                                                                                                                                                                                                                                                                     |
| Unstaged                           | 123 dosya: 114 `M`, 9 `D` (web 71, mobile 25, types 20, db 3, graphify-out 4)                                                                                                                                                                                                                         |
| Untracked                          | 0                                                                                                                                                                                                                                                                                                     |
| WIP niteliği                       | Ölü kod temizliği (kullanılmayan export/dosya silme; ör. `requireServerPermissionForUser`, `listUserIdsWithChannelPermission`, `use-login-theme`, `side-screens`, `backfill-mention-kind`, `seed-uat-test-users`). Davranış değişikliği görülmedi; typecheck + tüm birim paketleri WIP üstünde yeşil. |
| WIP gürültüsü                      | `packages/db/package.json` CRLF→LF tüm dosya (gerçek fark 1 satır: test listesinden silinen seed testi). `apps/web/next-env.d.ts` `.next/dev/types` yolu (dev sunucusu üretir).                                                                                                                       |
| Graphify                           | `graph.json` 2026-09-20 23:31, commit `95493d28`'den üretilmiş; hiçbir kaynak dosya grafikten yeni değil → `graphify update` gerekmedi. 44 304 düğüm, 106 910 kenar.                                                                                                                                  |

İnceleme hedefi = HEAD + WIP birleşik dosyalar. Bulgu satırlarında "main" = HEAD'de mevcut, WIP'e dokunulmamış dosya.

**Analiz sırasında yan etki (düzeltildi):** `next build`, izlenen `apps/web/next-env.d.ts`'yi yeniden yazdı (WIP'teki `.next/dev/types` satırları HEAD haline döndü). Dosya WIP içeriğine birebir geri yüklendi (blob `a419cbe4` = başlangıçtaki WIP blob'u); `git status` başlangıçla aynı.

Oluşturulan dosyalar: yalnız bu klasördeki 4 rapor. Gitignored üretim artefaktları: `apps/web/.next/` (prod build), `artifacts/typescript/main-typecheck.json`.

## 1. Mimari harita

```
                ┌───────────── apps/web (Next 16.3.5 + özel server.ts) ─────────────┐
 Browser ──HTTP─┤ proxy.ts (CSP nonce, CSRF origin, auth redirect)                   │
 Desktop(Tauri)─┤ app/ (RSC sayfalar) · app/api/** 339 route.ts → route-logic (DI)    │
   WebView      │ Socket.IO (Redis adapter) · auth: NextAuth v5 beta (JWT+AuthSession)│
 Mobile(Expo)───┤ /api/v1/mobile/* Bearer (15 dk access + refresh family)            │
                │ in-process: disappearing-message worker (Redis kilidi)             │
                └────┬───────────────┬──────────────────┬──────────────────────────┘
                     │ Prisma 7/pg   │ ioredis          │ livekit-server-sdk (token, room svc)
                PostgreSQL 18     Redis 8           LiveKit SFU (ses/video/ekran)
                     ▲               ▲
                ┌────┴───────────────┴───┐     Üçüncü taraf: UploadThing (dosya), Resend (e-posta),
                │ outbox worker (ayrı    │     FCM/Expo push, Sentry, Giphy, Google/GitHub OAuth,
                │ Railway servisi; SKIP  │     Cloudflare Turnstile, R2 (masaüstü güncelleme dağıtımı)
                │ LOCKED, headless io)   │
                └────────────────────────┘
packages/types: web↔mobile sözleşmeleri (zod) · packages/db: Prisma şema (86 model, 52 rebaseline migration) · packages/ui: 147 satır (fiilen boş)
```

Kod hacmi (izlenen, test hariç): web ~309k satır, mobile ~166k, types ~12.5k. Test dosyası: web 995, mobile 386, types 37, db 18.

### Kritik akışlar (sınırlar)

| Akış                            | İstemci                                                    | API/Event                                                 | DB/Cache                                          | İşçi/3. taraf                            | Durum                            |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| Web giriş                       | login form → NextAuth Credentials/OAuth                    | `auth.ts` authorize/jwt/session                           | `AuthSession`, `User.sessionsRevokedAfter`        | Google/GitHub, Turnstile                 | okundu (örneklem)                |
| Mobil giriş/yenileme            | SecureStore                                                | `/api/v1/mobile/auth/*`                                   | refresh family (Redis) + AuthSession              | —                                        | okundu (örneklem)                |
| Masaüstü handoff                | Tauri main pencere → OAuth host izinli navigasyon          | `desktop/oauth/*`                                         | —                                                 | —                                        | okundu (navigasyon/origin guard) |
| Yetkilendirme                   | —                                                          | `permission-service` + revizyonlu Redis izin cache        | `authorizationRevision`                           | —                                        | okundu                           |
| Kanal mesajı gönder             | web: `socket.emit("message:send")` (ack'siz) · mobil: REST | `handlers/message.ts` / `channel-message-send-service.ts` | `Message` (+nonce unique), read-state             | fan-out: `user:` odalarına izin filtreli | okundu                           |
| Yeniden bağlanma / geçmiş senk. | `getSocket()` (5 deneme)                                   | `drain.ts`, `session-revalidation.ts`                     | —                                                 | —                                        | **kusurlu (F-01, F-02)**         |
| Bildirim                        | socket `user:` odası + push                                | `notifications/service`                                   | `Notification` dedupeKey                          | outbox → FCM/Expo                        | yüzeysel                         |
| Dosya                           | UploadThing React                                          | `api/uploadthing/core.ts` (auth + rate limit)             | `Attachment.scanStatus`                           | tarayıcı (scanner) outbox'ta             | okundu                           |
| Arama                           | —                                                          | `search-service.ts` raw SQL                               | tsvector(`english`) GIN + trgm (yalnız `Message`) | —                                        | okundu                           |
| Ses/video/ekran                 | livekit-client, Krisp WASM lazy                            | `/api/v1/livekit/token`                                   | `voiceState`                                      | LiveKit SFU                              | token yolu okundu                |
| Güncelleme                      | Tauri updater (minisign), Expo OTA (kod imzalı)            | release center                                            | `download catalog`                                | R2, GitHub OIDC publish                  | workflow okundu                  |

## 2. Güçlü yönler (korunmalı)

- **Realtime yetki modeli:** mesaj/edit/silme olayları `user:<id>` odalarına, gönderim anında `VIEW_CHANNEL` filtresiyle gidiyor (`channel-message-send-service.ts:129-178`); kanal odasında kalan yetkisiz soket mesaj almıyor (yalnız typing). Ban/kick'te oda+cache temizliği (`workspace-events.ts:64-109`).
- **Soket kimliği:** origin allowlist + `allowRequest`, per-socket AuthSession/global revocation kontrolü, `auth-session:<sha256>` odasıyla cluster-genel iptal (`socket/server.ts`, `runtime.ts:39-56`).
- **Web güvenlik başlıkları:** nonce + `strict-dynamic` CSP, `frame-ancestors 'none'`, prod HSTS preload, `/api/v1` mutasyonlarında Origin/Referer/Sec-Fetch-Site CSRF kontrolü (`proxy.ts`).
- **SSRF:** link önizleme DNS sonucu pinli `lookup`, özel ağ blokları, yönlendirme başına yeniden doğrulama, 256 KB tavan, zaman aşımı (`messages/link-preview.ts`).
- **OAuth bağlama:** Google e-postası `email_verified` zorunlu; mevcut hesap `emailVerified` değilse bağlama reddi (ön-hesap ele geçirmeye karşı), GitHub otomatik bağlama kapalı (`auth.ts:304-359`, `oauth-email.ts`).
- **E2E yardımcıları:** prod + E2E modu + yerel host + yapılandırılmış URL dört katmanlı kilit (`e2e/route-guard.ts`).
- **Outbox:** `FOR UPDATE SKIP LOCKED`, bayat kilit kurtarma, üstel backoff, `FAILED` saklama, ayrı Railway servisi, idempotencyKey unique.
- **İstemci IP:** `TRUSTED_PROXY_HOPS` tabanlı XFF çözümü (spoof'a dayanıklı).
- **Mobil:** token SecureStore'da; deep link ayrıştırıcı hassas query/yabancı origin reddi; perf otomasyonu yalnız UAT; OTA kod imzası.
- **Masaüstü:** `withGlobalTauri:false`, per-komut pencere+origin doğrulaması, navigasyon origin guard'ı, updater imzası.
- **CI tedarik zinciri:** SHA-pinli action'lar, en az yetki `permissions`, semgrep, secret scan, `pnpm audit`, cargo-audit, actionlint, Dependabot.
- **Kod düzeni:** ince `route.ts` + DI'li `route-logic` deseni tutarlı; `jsonError`/`enforceApiRateLimit`/`parseJsonBody` graph'ta god node → ortak sözleşme gerçekten kullanılıyor.
- **Test hacmi ve hızı:** 8 775 web birim testi 94 sn, typecheck (tsgo 7) 5 proje 18 sn.

## 3. Bulgular

Önem = etki; kanıt durumu ayrı; uygulama sırası yol haritasında.

### F-01 — Web/masaüstü realtime, sunucu kaynaklı kopmadan sonra hiç toparlanmıyor · **HIGH**

- **Alan:** web + Tauri masaüstü (aynı frontend). Mobil etkilenmiyor (`AppState`/`reconnect()` var).
- **Etki:** Her rolling deploy'da (SIGTERM → `drainSocketServer` → `socket.disconnect(true)`) ve oturum revalidasyonu DB hatasında tüm web/masaüstü kullanıcıları realtime'ı kaybeder: yeni mesaj, typing, presence, okunmamış güncellemesi gelmez; `socket.emit("message:send")` çağrıları tamponda kalır, balonlar "gönderiliyor"da takılır. Sayfa yenilenene kadar sürer. Ağ kesintisi ~20 sn'yi aşarsa (`reconnectionAttempts: 5`, delay 1→5 sn) aynı kalıcı kopukluk.
- **Kanıt:**
  - `apps/web/src/lib/socket/client.ts:31-36` — `reconnectionAttempts: 5`.
  - `apps/web/src/components/providers/socket-provider.tsx:16-21` — `connect()` yalnız mount'ta; `disconnect`/`reconnect_failed` sonrası manuel yeniden bağlanma yok (tüm `apps/web/src` içinde başka `.connect()` yok).
  - `apps/web/src/lib/socket/drain.ts:44-46` — yorum "client ... reconnects on its own backoff" diyor; Socket.IO sözleşmesi tersidir.
  - `node_modules/.../socket.io-client/build/cjs/socket.js:639-643` (`ondisconnect → destroy() → onclose("io server disconnect")`), `manager.js:281-291` (aktif soket kalmayınca manager kapanır).
  - Yerel deney (scratchpad `reconnect-probe.mjs`, socket.io 4.8.3, aynı seçenekler): sunucu `disconnect(true)` → `reason: io server disconnect, active: false`; 8 sn sonunda bağlantı sayısı 1, `connected: false`. Sunucusuz senaryoda 5 deneme sonrası `reconnect_failed: true`.
  - Graphify: `SocketProvider() → getSocket()` tek kenar; `drainSocketServer` etkilenenleri yalnız sunucu tarafı.
- **Kök neden:** sunucu tarafı drain "istemci kendisi bağlanır" varsayımıyla yazılmış; istemcide bu varsayımı karşılayan kod yok. Test yok (e2e'de reconnect senaryosu bulunamadı).
- **Kanıt durumu:** doğrulandı (kod + kütüphane + yerel deney). Gerçek tarayıcıda deploy altında gözlem: yapılmadı.
- **main/WIP:** main.
- **En küçük güvenilir çözüm:** `SocketProvider` içinde (1) `disconnect` nedeni `io server disconnect` ise jitter'lı (ör. 0.5–3 sn) `socket.connect()`; (2) `reconnectionAttempts` varsayılan (∞) + `randomizationFactor` korunur; (3) `online` ve `visibilitychange→visible` olaylarında `!socket.connected` ise `connect()`. `drain.ts` yorumunu düzelt.
- **Risk/efor:** düşük risk (reconnect fırtınasını jitter + F-04 sınırlar). 0.5–1 gün + test.
- **Kabul:** birim testi (sahte soket: `io server disconnect` → `connect` çağrılır); Playwright: sunucu drain tetiklenince istemci ≤10 sn içinde `connected` ve yeni mesaj alır; UAT deploy sonrası aktif soket sayısı metriği deploy öncesine döner.

### F-02 — Yeniden bağlanmada kaçırılan olaylar telafi edilmiyor (sessiz mesaj boşluğu) · **HIGH**

- **Alan:** web/masaüstü mesaj akışı. Mobil: doğrulanamadı.
- **Etki:** Otomatik yeniden bağlanma başarılı olsa bile (ağ dalgalanması, uyku, sekme arka planı) kopukluk süresince gelen mesajlar açık sohbette görünmez; kullanıcı konuşmayı eksik okur, fark etmez.
- **Kanıt:** `apps/web/src/hooks/use-messages.ts:445` `staleTime: Infinity`; `:583-595` `connect` olayında yalnız `channel:join`/`dm:join`; `apps/web/src/lib/query-client.ts:7-9` global `refetchOnWindowFocus: false`. Reconnect'te mesaj sorgusunu geçersizleyen kod bulunamadı (yalnız güvenlik sorguları: `use-account-security-refresh.ts:26-34`).
- **Kök neden:** olay akışının sırası/sürüm numarası yok; istemci "son görülen"den delta istemiyor.
- **Kanıt durumu:** doğrulandı (kod okuma). Runtime gözlem yapılmadı.
- **main/WIP:** main.
- **Çözüm:** ilk bağlantı hariç her `connect`'te aktif mesaj sorgusunu `invalidateQueries({ queryKey, refetchType: "active" })` + okunmamış/sunucu listesi sorgularını geçersizle. Sonraki adım (gerekirse): `after=<lastMessageId>` delta ucu. Discord tarzı sıra numaralı replay **şimdilik gereksiz**.
- **Efor:** 0.5 gün. **Kabul:** e2e: A çevrimdışı (context.setOffline) → B 3 mesaj → A çevrimiçi → 3 mesaj ≤3 sn içinde yenilemesiz görünür.

### F-03 — Web mesaj gönderimi ack/zaman aşımı kullanmıyor; hata yanlış balona bağlanabiliyor · **MEDIUM**

- **Kanıt:** `apps/web/src/components/chat/chat-area.tsx:873-887` ack'siz `emit`; sunucu zaten ack veriyor (`lib/socket/handlers/message.ts:334` `acknowledge({ messageId, ok: true })`). Hata işleyicisi nonce yerine "en son bekleyen" mesajı işaretliyor (`chat-area.tsx:720-731`).
- **Etki:** kopuklukta balon sonsuza dek "gönderiliyor"; art arda iki gönderimde ilki reddedilirse ikincisi "başarısız" görünür, ilki bekler. Başarısız işlemde metin korunuyor (retry balonu) — iyi.
- **Kanıt durumu:** doğrulandı (kod). **main.**
- **Çözüm:** `socket.timeout(10_000).emit("message:send", payload, (err, ack) => …)`; zaman aşımı/`ok:false` → o nonce'lu balonu `failed`. Sunucu hata olayına `clientNonce` ekle. **Efor:** 0.5–1 gün. **Kabul:** birim testi: iki eşzamanlı gönderimde yalnız reddedilen nonce `failed`; bağlantısızken 10 sn'de `failed` + tekrar dene.

### F-04 — Oturum revalidasyonu tek DB hatasında tüm yerel web soketlerini koparıyor · **MEDIUM**

- **Kanıt:** `apps/web/src/lib/socket/session-revalidation.ts:91-96` (`loadSessions` reddi → tüm soketler `disconnect`); 30 sn aralık (`:8`).
- **Etki:** geçici DB/pool hatası = instance'taki tüm web kullanıcıları kopar. F-01 ile birlikte kalıcı; F-01 düzeltilince eşzamanlı reconnect fırtınası (her bağlantı: auth DB sorgusu + `joinServerRooms` + analytics `startAppSession`) zaten zorlanan DB'ye yüklenir.
- **Güvenlik dengesi:** iptal zaten anlık `auth-session` odası ile itiliyor (`auth-session-service.ts:293-305`); revalidasyon yedek. Kısa, sınırlı fail-open kabul edilebilir.
- **Kanıt durumu:** doğrulandı (kod); fırtına etkisi ölçülmedi (hipotez). **main.**
- **Çözüm:** ardışık hata sayacı; yalnız ≥3 ardışık hata (≈90 sn bayatlık) sonrası kopar; hata metriği/Sentry. **Efor:** 2–4 saat. **Kabul:** birim testi: 1 red → kopma yok; 3 ardışık red → kopma.

### F-05 — 15 admin sayfası yetkiyi veri yüklemesiyle paralel çalıştırıyor (anonim sorgu amplifikasyonu) · **MEDIUM (güvenlik/erişilebilirlik)**

- **Giriş noktası:** `GET /admin`, `/admin/analytics`, `/admin/voice`, `/admin/health`, `/admin/servers`, `/admin/users`, `/admin/audit`, `/admin/moderation`, `/admin/releases[/id]`, `/admin/support`, `/admin/help`, `/admin/feedback`, `/admin/flags`, `/admin/notifications`.
- **Önkoşul:** yok (anonim). `proxy.ts:197-207` `isProtectedRoute` `/admin`'i kapsamıyor; sayfa rotalarında oran sınırı yok.
- **Kod yolu:** ör. `apps/web/src/app/admin/voice/page.tsx:7-10`, `app/admin/page.tsx:23` — `Promise.all([requireAdminModule(...), loadAdmin…Snapshot(...)])`; yetki reddi gelse de agregasyon sorguları (voiceState count/groupBy, mediaUsageSession groupBy, analytics metrikleri…) çalışır.
- **Runtime kanıtı:** oturumsuz `next build` prerender'ında 10 `prisma:error` (bugReport.findMany, voiceState.count/groupBy, mediaUsageSession.findMany/groupBy, feedbackClusterSuggestion.findMany …) — yükleyiciler yetki kararından bağımsız tetikleniyor.
- **Eksik kontrol:** yetki → sonra veri sıralaması. Veri sızıntısı yok (render reddediliyor).
- **Etki:** anonim, ucuz GET ile pahalı DB agregasyonu → DB yükü/DoS çarpanı. Büyüklük ölçülmedi.
- **Kanıt durumu:** doğrulandı (kod + build log); maliyet büyüklüğü doğrulanamadı. **main.**
- **Çözüm:** `const admin = await requireAdminModule(...)`; ardından `Promise.all(yükleyiciler)`. Ek ucuz katman: `/admin`'i `isProtectedRoute`'a ekle (JWT yoksa DB'ye inmeden `/login`). **Efor:** 2–4 saat. **Kabul:** her admin sayfası için test: `requireAdminModule` redirect/403 → yükleyici çağrılmaz; `next build` log'unda admin kaynaklı `prisma:error` yok.

### F-06 — `main` korumasız; tam E2E yalnız gece ve son iki gece kırmızı · **MEDIUM (süreç/operasyon)**

- **Kanıt:** `gh api …/branches/main/protection` → 404 "Branch not protected"; rulesets `[]`. CI push'ta E2E alt kümesi (api+smoke+realtime+voice: 86+7 test), tam paket yalnız `schedule` (`.github/workflows/ci.yml:484-536`).
  - Run 35429064447 (2026-09-19, SHA 95493d28): `e2e/specs/design/server-parity.spec.ts:191` "Ş4 · kanal kenar çubuğu" tüm çözünürlük/tema kombinasyonlarında 3 deneme × fail.
  - Run 35497697116 (2026-09-20, aynı SHA): `auth-parity.spec.ts:49,157` forgot-password; sunucu log'u `RESEND_FROM_EMAIL or RESEND_FROM is required for password reset.` (CI E2E env'inde yok). Shard 2 `cancelled`.
  - Aynı SHA push run 35359481032: success → "yeşil main" algısı yalnız alt kümeye dayanıyor.
- **Etki:** kırık kod doğrudan `main`'e girebilir; gece kırmızısı sessiz. Önceki not "prod deploy CI beklemiyor" bugün doğrulanamadı (Railway'e erişilmedi).
- **Çözüm:** branch protection/ruleset: `Verify` required; gece kırmızısında otomatik issue/bildirim; CI E2E env'ine test-modu e-posta taşıyıcısı veya `RESEND_FROM` test değeri; server-parity Ş4 kırığını kök nedenle kapat. **Efor:** 0.5 gün (ayar) + kırık başına 0.5–1 gün. **Kabul:** protection API 200 + required context; 3 ardışık gece yeşil.

### F-07 — Masaüstü 0.9.1 Windows kurulumu Authenticode imzasız yayınlandı · **MEDIUM (dağıtım güveni)**

- **Kanıt:** Desktop Release run 35353429658 (SHA 674907d6): `WHISPR_DESKTOP_WINDOWS_SIGNING_ENABLED: false`, `WHISPR_DESKTOP_UPDATER_ENABLED: true`. İmza iş akışında opsiyonel girdi (`desktop-release.yml:30, 330-345, 445-480`).
- **Etki:** SmartScreen "bilinmeyen yayımcı", ilk kurulumda yayımcı doğrulanamaz, kurumsal AppLocker/Defender politikaları engelleyebilir. Güncelleme bütünlüğü Tauri minisign ile korunuyor (yalnız ilk kurulum/yeniden kurulum riski). Yayın halkası (ring) log'dan belirlenemedi.
- **Çözüm:** OV/EV sertifika veya Azure Trusted Signing; `stable` halkasında imzayı zorunlu kıl (release contract'ta fail). **Efor:** sertifika tedariki + 0.5 gün. **Kabul:** `Get-AuthenticodeSignature` = Valid; stable release imzasız artefaktla fail eder.

### F-08 — Ana rotaların ilk yükleme JS'i ağır; bütçe/ölçüm kapısı yok · **MEDIUM (performans)**

- **Ölçüm yöntemi:** yerel prod build (Next 16.3.5 Turbopack, `next build`, 2026-09-21, Windows); rota `*_client-reference-manifest.js` `entryJSFiles` ∪ `rootMainFiles`; gzip -6 toplamı (brotli değil; ağ/CPU ölçümü değil). Tek örnek.
- **Sonuç (gz):** `/messages/[conversationId]` 1 265 KB (4.35 MB ham, 45 chunk) · `/channels/[serverId]/[channelId]` 1 240 KB · `/home` 1 112 KB · `/settings` ~667 KB · `/login` 472 KB · her sayfanın ortak kökü 313 KB.
  - Kökteki `324a8pwnb-h5z.js` (382 KB ham / 89 KB gz) zod ağırlıklı (≈529 eşleşme) → login dahil her sayfada.
  - `39t7a049eo59l.js` (538 KB ham / 139 KB gz) livekit-client (`RTCPeerConnection` 157, `SignalClient`) → `/home`, `/messages/*` gibi sesle ilgisiz rotalarda eager (`LiveVoiceProvider` kabukta).
  - Krisp gürültü filtresi: 5.26 MB base64 WASM gömülü tek chunk (5.9 MB ham / 1.9 MB gz); `import()` ile lazy (`live-voice-provider.tsx:222-229`) — ilk ses katılımında maliyet (hipotez: katılım gecikmesi).
- **Etki:** düşük donanım/mobil ağda parse/compile maliyeti; LCP/INP etkisi **ölçülmedi** (hipotez).
- **Durum:** boyut ölçüldü; kullanıcı metriği doğrulanamadı. `tests/performance/` boş; bundle bütçe betiği bulunamadı. **main.**
- **Çözüm (sırayla):** (1) bu ölçümü CI'da bütçe testi yap (yeni bağımlılık yok; manifest okuyan betik); (2) `livekit-client`'ı ses katılımına kadar dinamik import; (3) istemciye taşınan zod şemalarını azalt (sunucuda doğrula; gerekirse `zod/mini` — aynı paket). **Efor:** (1) 0.5 gün, (2) 1–2 gün, (3) 1 gün. **Kabul:** bütçe testi CI'da; `/home` gz ilk yükleme hedefi ekip belirler (ör. −150 KB); UAT'te Web Vitals (LCP/INP p75) toplanır.

### F-09 — Kanal mesajı fan-out mantığı iki yolda kopya · **MEDIUM (bakım; güvenlik-kritik mantık)**

- **Kanıt:** `lib/socket/handlers/message.ts:114-139` `deriveMessageSendFanoutTargets` ≡ `lib/workspace/channel-message-send-service.ts:40-65` `deriveChannelMessageFanoutTargets` (birebir); çevresindeki presence + izin filtresi + emit dizisi de iki yerde (`message.ts:343-395`, `channel-message-send-service.ts:129-178`).
- **Etki:** izin filtresi/redaksiyon düzeltmesi yalnız bir yola uygulanırsa web (socket) ve mobil (REST) farklı kişilere mesaj yayar.
- **Çözüm:** tek `fanOutChannelMessage()` servisi; iki yol çağırır; paylaşılan test. **Efor:** 0.5–1 gün. **Kabul:** tek tanım; iki yolun testi aynı fixture ile geçer.

### F-10 — Mesaj başına O(çevrimiçi üye) iş · **LOW (ölçek hipotezi)**

- **Kanıt:** her mesajda `getActiveServerMemberUserIds` (Redis set okuma, `unread-service.ts:629-631`) + `readServerAuthorizationRevisions` DB `userId IN (N)` (`authorization-revision.ts:87-98`) + izin cache okuma + tüm izinli çevrimiçi üyelere `channel:messages:stale`.
- **Mevcut koruma:** `recordMessageSendFanoutMetric` süre/boyut ölçüyor (iyi).
- **Değerlendirme:** Whispr ölçeğinde muhtemelen yeterli; Discord'un "passive session" çözümü bu maliyetin büyük sunucuda patladığını gösteriyor. **Şimdilik yalnız ölç.** Yük testi planı: rakip dosyası §4.

### F-11 — Arama Türkçe öncelikli üründe İngilizce FTS kullanıyor; DM trigram indeksi yok · **LOW**

- **Kanıt:** `messages/search-service.ts:225,332,419` `websearch_to_tsquery('english', …)`; baseline `to_tsvector('english', …)`; trgm indeksi yalnız `Message` (`rebaseline-migrations/20260810180000_message_content_trgm_index`), `DMMessage` yok.
- **Etki:** Türkçe kök/ek eşlemesi yok (ILIKE alt dizgi kolunu kurtarıyor); DM ILIKE kolu indekssiz. Gecikme ölçülmedi.
- **Çözüm:** önce ölç (EXPLAIN ANALYZE, gerçekçi hacim); gerekirse `simple` config (+`unaccent`) ve `DMMessage` trgm indeksi. Arama motoru eklemek **gereksiz**.

### F-12 — LiveKit token'ı kullanılmayan `canPublishData` yetkisi veriyor · **LOW (en az yetki)**

- **Kanıt:** `lib/livekit/server.ts:356,372` `canPublishData: true`; web+mobil kodunda `publishData`/`DataReceived`/text stream kullanımı bulunamadı.
- **Etki:** geçerli token'lı katılımcı odaya keyfi data paketi yayabilir (istemci yok sayar; bant/CPU gürültüsü). **Çözüm:** `false`. **Efor:** <1 saat.

### F-13 — Masaüstü üretim capability'si localhost origin'lerini içeriyor · **LOW (derinlemesine savunma)**

- **Kanıt:** `apps/desktop/src-tauri/capabilities/main.json:12-15` `http://localhost:3000`, `http://127.0.0.1:3000` (IPC izinleri: pano okuma, çalışan uygulama listesi, tanılama paketi, güncelleme kurma dahil). Mevcut koruma: prod'da `configured_app_url` HTTPS zorunlu ve `on_navigation` yalnız yapılandırılmış origin + OAuth host (`lib.rs:1106-1135, 5536-5540`) → bugün sömürülebilir yol bulunamadı.
- **Çözüm:** build-time capability ayrımı (dev capability dosyası yalnız debug'da). **Efor:** 2–4 saat.

### F-14 — Outbox heartbeat drain ilerlemesinden bağımsız · **LOW (operasyon)**

- **Kanıt:** `apps/web/scripts/run-outbox-worker.ts:43-53` saatlik `Sentry.captureCheckIn` yalnız süreç canlılığı; drain döngüsü takılırsa "ok" demeye devam eder. `oldestPendingAgeMs`/`failedJobCount` log'da var (`docs/operations/outbox-worker-monitoring.md`); alarm kuralı repodan doğrulanamaz.
- **Çözüm:** check-in'i başarılı drain sonrasına bağla; `oldestPendingAgeMs` eşiğine alarm. **Efor:** 2–4 saat.

### F-15 — Web süreci kapanışında HTTP/worker drain eksik · **LOW**

- **Kanıt:** `apps/web/server.ts:84` `app.prepare().then(...)` catch yok; `socket/drain-signals.ts:27-35` soket drain sonrası `process.exit(0)` — `httpServer.close()`, disappearing worker durdurma yok.
- **Etki:** deploy'da uçuştaki HTTP istekleri kesilebilir (hipotez; ölçülmedi). **Çözüm:** aynı grace içinde `httpServer.close()` + worker stop. **Efor:** 2–4 saat.

### F-16 — Bakım yükü: dev modüller ve döngüler · **LOW**

- `apps/desktop/src-tauri/src/lib.rs` 6 452 satır; `components/providers/live-voice-provider.tsx` 3 306; `mobile voice-screen.tsx` 2 352; `use-mobile-voice-room.ts` 2 264.
- Import döngüleri (graphify + kaynakta doğrulandı): `analytics/service → badges/badge-triggers → badges/badge-service → workspace/workspace-events → voice/service → analytics/service`; `account/privacy-service → outbox/service → attachments/scanner → account/privacy-service`; (üçüncüsü `socket/context ↔ runtime ↔ rooms` graph'ta, kaynakta doğrulanmadı).
- `packages/ui` 147 satır: fiilen kullanılmayan soyutlama.
- **Öneri:** yeniden yazım değil; dokunulan yerde küçük çıkarımlar (ör. voice provider'dan cihaz/Krisp/PTT alt-hook'ları). Döngüleri kıran tek adım: `extractUploadThingFileKey`'i saf yardımcı modüle taşı.

### F-17 — WIP/test hijyeni · **LOW**

- `packages/db/package.json` tüm dosya CRLF→LF (1 satırlık gerçek fark gizleniyor) → `.gitattributes`'a `*.json text eol=lf` (veya commit öncesi normalize).
- `apps/web/next-env.d.ts` dev/build tarafından sürekli yeniden yazılıyor (bu analizde de) → Next şablonundaki gibi gitignore'a alınmalı; commitlenirse CI tip yoluyla çelişir.
- Jest: 134 `act(...)` uyarısı (FlashList, NavigationContainer) — gerçek zamanlama hatalarını gizleyebilir.

## 4. Bulgu olmayanlar (kontrol edildi, sorun bulunamadı)

Özel kanal mesajının oda üzerinden sızması; E2E uçlarının prod'da açık olması; link önizleme SSRF; Google ile ön-hesap ele geçirme; XFF spoof ile oran sınırı atlatma; mobil token'ın düz depolanması; `whispr://performance` komutunun prod'da çalışması; dependency audit (npm: 0; cargo: 0 açık, 7 izinli bakım/unsound uyarısı — Linux gtk3 zinciri, `docs/operations/desktop-linux-gtk3-rustsec-risk.md`).

## 5. Sınırlamalar

- UI gözlemi yapılmadı (dev sunucusu kapalıydı; başlatılmadı: süreç içi outbox worker yerel `.env`'deki gerçek üçüncü taraf anahtarlarıyla bekleyen işleri gönderebilirdi). Klavye/odak/ekran okuyucu/kontrast runtime'da doğrulanmadı; CI'da Playwright a11y taraması (axe) yeşil (run 35359481032).
- Native masaüstü/mobil cihaz, gerçek ağ koşulu, soğuk açılış, RAM/pil ölçülmedi.
- Railway (deploy CI beklemesi, yedekleme/PITR, alarm kuralları) ve Sentry yapılandırması repodan doğrulanamaz.
- 339 API rotasının tamamı tek tek denetlenmedi: desen + örneklem (auth, DM, events, mentions, admin, uploads, e2e, livekit).
- `discord.com` doğrudan okunamadı (ortam: self-signed sertifika); rakip iddiaları arama özetleri + resmi URL ile, güven "orta".
- `cargo audit --no-fetch` yerel advisory DB ile; DB tazeliği doğrulanmadı.
