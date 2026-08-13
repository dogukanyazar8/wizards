# 04 — Ses ve LiveKit yetkisi: çıkarılan kullanıcı gerçekten çıksın

`00-ortak-baglam.md` oku. Caveman ultra. `uat`. Commit yok.

**Ön koşul:** yok.

## Sorun

Yetkisi kaldırılan, sunucudan atılan veya gruptan çıkarılan kullanıcı ses/çağrı yüzeyinde kalmaya devam ediyor — üç ayrı yoldan. Ayrıca çağrıdaki herkes başkasının kimliğine bürünebiliyor.

Ortak kök neden: **üyelik sonlandırma tek bir yerde tanımlı değil.** Soket odası, LiveKit odası, `VoiceState` satırı ve token'ın hepsi ayrı ayrı yönetiliyor ve biri unutuluyor. SRP ile çözülür: "kullanıcıyı ses yüzeyinden çıkar" tek bir fonksiyon olsun, üç çağıran onu çağırsın.

## Kapsam

### 1. Yetki düşünce soket odasından atılmıyor

`apps/web/src/lib/voice/service.ts:666`, `:598` · `apps/web/src/lib/socket/handlers/voice.ts:106`, `:119`

Yetki kaldırılan kullanıcı LiveKit'ten ve DB'den atılıyor; `pruneUnauthorizedVoiceStateViewers` **farklı** bir odaya bakıyor. Kullanıcı `voice:<channelId>` katılımcı odasında kalıyor: canlı listeyi ve konuşma göstergelerini alıyor, kendi ses seviyesini yayınlamaya devam ediyor (yayın kapısı yalnız katılım anında bakıyor).

Yap: `disconnectUnauthorizedVoiceParticipants` içinde ilgili soketleri çekip `socket.leave(getVoiceParticipantRoomName(channelId))` yap ve `socket.data.voiceRooms`'tan sil.

### 2. Sunucudan atılan kullanıcı sesten düşmüyor

`apps/web/src/lib/voice/service.ts:1000` · `apps/web/src/lib/workspace/workspace-events.ts:81`

`heartbeatVoiceState` yalnız `sessionId` eşliyor. Kick/ban yolunda `clearVoiceState`/`removeLiveKitVoiceParticipant` hiç çağrılmıyor. Banlanan kişinin medyası akmaya devam ediyor ve heartbeat `VoiceState` satırını taze tuttuğu için bayat-heartbeat süpürücüsü de toplamıyor.

Yap:

- `detachUserFromServerSocketRoom`'dan ses çıkarma fonksiyonunu çağır.
- `heartbeatVoiceState` yetkiyi yeniden kontrol etsin (izin cache'i üzerinden — yeni sorgu ekleme).

### 3. Gruptan çıkarılan üye grup çağrısında kalıyor

`apps/web/src/lib/dm/group-realtime.ts:157` · `apps/web/src/lib/livekit/server.ts:13`, `:215`

Soket odasından atılıyor, LiveKit `dm:<conversationId>` odasından çıkarılmıyor. `LIVEKIT_TOKEN_TTL = "1h"` — sekmeyi kapatsa bile geri bağlanabiliyor.

Yap:

- Çıkarma/ayrılma yolunda `removeParticipant('dm:<id>', userId)` + `leaveGroupCall(conversationId, userId)`.
- Token TTL'ini birkaç dakikaya indir ve istemci tarafı yenileme ekle. **Yenileme mekanizması yoksa** TTL'i düşürme — kullanıcıya söyle, ayrı iş olarak planlansın. Yarım bırakılmış TTL düşürmesi çağrıları kopartır.

### 4. LiveKit metadata ile kimlik taklidi

`apps/web/src/lib/livekit/server.ts:278`, `:263` · `apps/web/src/lib/voice/participant-mapping.ts:83`

Token `canUpdateOwnMetadata: true` veriyor; sunucu kimliği o metadata'ya koyuyor; istemci doğrudan oradan okuyor. Çağrıdaki herkes `setMetadata` ile başkası gibi görünebiliyor, seçtiği avatar URL'i tüm izleyicilerce çekiliyor.

Yap:

- `canUpdateOwnMetadata`'yı kaldır.
- Metadata'yla taşınan tek meşru değişken durumu (`isDeafened`) soket roster'ına veya ayrı bir data-channel mesajına taşı.
- İstemcide eş profillerini sunucunun `voice:state:update` listesinden `participant.identity` ile çöz. `participant-mapping.ts` bunun tek yeri olsun.

### 5. Ses soket handler'larında rate limit yok

`apps/web/src/lib/socket/handlers/voice.ts:78`, `:245`

`voice:states:watch` her çağrıda tüm görünür ses kanallarının izleyici odalarını bırakıp yeniden katılıyor (60 kanal = 120 adaptör mutasyonu), limit yok. `voice:screenshare:update` limitsiz ve her olay `MediaUsageSession` yazması yapıyor.

Yap:

- İkisine de mevcut `checkRateLimit` desenini uygula.
- `voice:states:watch`: çözülen kanal id kümesi değişmemişse bırak/katıl döngüsünü atla.
- `voice:screenshare:update`: değer değişmemişse olayı düşür.

## Yapılmayacak

- LiveKit sürüm yükseltmesi, SFU yapılandırması.
- Ses kalitesi / codec / bitrate ayarları.
- Yeni "ses yetki servisi" katmanı. Var olan `voice/service.ts` içinde tek bir çıkarma fonksiyonu yeterli.
- İstemci ses UI'ına dokunma — 20 no'lu promptun işi.

## Kabul kriterleri

1. Kanal yetkisi kaldırılan kullanıcı `voice:<channelId>` odasında değil ve `voice:audio-level:update` yayınlayamıyor.
2. Sunucudan atılan kullanıcının `VoiceState` satırı temizleniyor ve LiveKit katılımcısı kaldırılıyor; heartbeat onu diriltemiyor.
3. Gruptan çıkarılan üye LiveKit `dm:` odasında değil.
4. Token `canUpdateOwnMetadata` taşımıyor; istemci eş adını/avatarını sunucu roster'ından okuyor.
5. İki ses soket olayı da rate limit'li ve no-op durumunda erken dönüyor.

## Testler

- Çıkarma fonksiyonu: enjekte edilmiş io/LiveKit sahtelerinin üçünün de çağrıldığı (oda, LiveKit, DB).
- `heartbeatVoiceState`: yetkisiz kullanıcı için reddediliyor.
- `participant-mapping`: metadata'daki `username` yok sayılıyor, roster kazanıyor.
- Rate limit: aynı değerle ikinci olay düşüyor.

## Doğrulama

```bash
pnpm --filter @wizards/web typecheck
```

```bash
pnpm --filter @wizards/web test
```
