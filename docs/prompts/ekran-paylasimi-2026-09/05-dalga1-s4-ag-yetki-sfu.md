# Dalga 1 · Ş4 — Ağ, yetki, SFU

> **Başlatma prompt'u.** Aşağıdaki bloğun tamamını yeni bir Claude Code oturumuna ver.
> **Ön koşul:** Dalga 0 kapısı geçti.

---

Whispr monorepo, `uat` dalı. Görev: ekran paylaşımının **ağ ve yetki** zemini. LiveKit
**Cloud** kullanılıyor (kullanıcı, 2026-09-17 — K21): TURN dahili ama doğrulanmamış, `emptyTimeout`
yok, Cloud projesi/bölgesi/env yeri belgeli değil, token herkese
SCREEN_SHARE veriyor (gerçek #14). 4K/24 Mbps yayın bu zemin olmadan kurumsal ağlarda kopar.

Önce oku: `00-ortak-baglam.md` §4 #14, #32, §5 K2, K6; `docs/prompts/denetim-2026-08/04-ses-ve-livekit-yetkisi.md`
(yetki kaldırma deseni); `docs/operations/container-runtime-transition.md:21`.
Kod için `graphify query "livekit token grant createRoom canPublishSources permission stream"`.

## Sahiplenilen dosyalar

- `docs/operations/livekit-hosting.md` (yeni)
- `apps/web/src/lib/livekit/server.ts` + `.test.ts`
- `apps/web/src/app/api/v1/livekit/token/route.ts`, `apps/web/src/app/api/v1/mobile/voice/token/route-logic.ts` (+ testleri)
- `apps/web/src/lib/voice/service.ts` — **yalnız** yetki değişince `updateParticipant` çağrısı
  (Ş3 aynı dosyada ayrılma temizliği yazıyor: **farklı fonksiyon**, aynı satırlara dokunma; çakışma
  olursa rapora yaz, Ş3 bitince tekrar uygula)
- `docker-compose.yml` (LiveKit `LIVEKIT_CONFIG` genişlemesi), `apps/web/.env.example`
- `apps/web/src/lib/livekit/rtc-regions.ts` (yalnız doküman yorumu)

**Yazma:** istemci voice kodu, `handlers/voice.ts` (Ş3), mobil.

## Ne yapılacak

### 1. Hosting belgesi — önce bu

`docs/operations/livekit-hosting.md`: LiveKit **Cloud** (kullanıcı doğruladı, 2026-09-17). Yazılacaklar:
Cloud proje adı ve bölge(ler), UAT/prod `NEXT_PUBLIC_LIVEKIT_URL` / `LIVEKIT_URL` / API key'lerin
**nerede** tanımlı olduğu (Railway servis env'i), key rotasyon adımı, bölge uçları
(`LIVEKIT_RTC_REGION_ENDPOINTS`), TURN/TLS durumu, `audio` observer ayarının (gerçek #32) Cloud'da
**uygulanamadığı** ve speaking ring'in istemci ölçümüne dayandığı, Ş3'ün Redis anahtar şeması,
Cloud egress hesabı (§5). Bilinmeyen her şey "BİLİNMİYOR — kullanıcı doğrulayacak" olarak yazılır;
uydurulmaz.

### 2. TURN doğrulaması (Cloud)

- TURN/TLS 443 Cloud'da dahili; **config yazılmaz**. Doğrulama: UDP kapalı ağdan (Windows
  Defender kuralıyla giden UDP bloklanmış) web + masaüstü bağlanır, paylaşım açılır, `getStats`
  `candidate-pair` `relay`/`tcp` gösterir; sonuç ve süre rapora + belgeye.
- Self-host dalı yok. docker-compose yerel `--dev` kalır; yorum satırıyla "prod Cloud, buradaki
  `LIVEKIT_CONFIG` yalnız yerel" yazılır.
- İstemcide değişiklik yok (LiveKit ICE sunucularını token yanıtıyla dağıtır).

### 3. Oda seçenekleri

`createRoom({ name, maxParticipants, emptyTimeout: 300, departureTimeout: 20 })`; test.
`ensureVoiceRoomParticipantLimit` imzası korunur.

### 4. Rol bazlı grant

- `buildLiveKitParticipantGrant`: kanal odası (`voice:<channelId>`) için `canPublishSources`
  SCREEN_SHARE + SCREEN_SHARE_AUDIO'yu yalnız `requireChannelPermissionForUser(..., STREAM)`
  geçerse içerir; DM odası (`dm:<conversationId>`) her zaman içerir. Token ucu oda hedefini zaten
  çözüyor (`resolveLiveKitRoomTarget`); permission cache üzerinden okunur, yeni sorgu eklenmez.
- Yetki düşünce: `RoomServiceClient.updateParticipant(room, identity, { permission })` ile
  kaynak listesi daraltılır (denetim 04'teki "tek çıkarma fonksiyonu" deseninin yanına).
- Socket handler'daki `PermissionBits.STREAM` kontrolü **kalır** (iki katman).

### 5. 4K bant genişliği politikası (belge + yorum)

LiveKit'te oda/track başına bitrate tavanı yok; tavan istemci merdivenidir (K5). Cloud'da sunucu
config'i yok; belgeye egress formülü: `GB/saat ≈ (yayın Mbps × izleyici sayısı × 3600) / 8000`
(4K60 akıcı: 24 Mbps × 5 izleyici ≈ 54 GB/saat). Cloud birim fiyatı yazılmaz; kullanıcı doldurur.
`screenShare4k` flag'i prod'da bu hesap görülmeden açılmaz (README karar 1).

## Test

- `server.test.ts`: `createRoom` seçenekleri; grant matrisi (STREAM var/yok × kanal/DM);
  `updateParticipant` çağrısı sahte client ile.
- Token route testleri: grant değişimi yansır; mobil aynı.
- Belge lint: `livekit-hosting.md` "BİLİNMİYOR" satırları raporda listelenir.

## Kapı

```bash
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web test
```

Rapor: `raporlar/05-rapor.md` — hosting gerçeği (Cloud/self-host), TURN testi sonucu, açık sorular.
