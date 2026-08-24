# Dalga 1 · Ş2 — Detay ucu, katılımcı rolleri, hatırlatma okuması

**Ön koşul:** Dalga 0 kapısı yeşil. **Paralel:** Ş1, Ş3, Ş4.

326 px detay panelinin beslendiği tek uç. Panel liste kartından **daha fazlasını** taşır:
açıklama, rol pilli katılımcı listesi, hatırlatma şeridi ve duruma göre değişen CTA.

---

## Sahiplenilen dosyalar

- `apps/web/src/lib/events/detail-service.ts` (yeni) + `.test.ts`
- `apps/web/src/lib/events/attendee-roles.ts` (yeni — saf rol çözümleyici) + `.test.ts`
- `apps/web/src/lib/events/client.ts` — yalnız `// Ş2` sınırı içindeki bölüm
- `apps/web/src/app/api/v1/events/[eventId]/route.ts` + `route-logic.ts` + `route-logic.test.ts` (yeni)

**Okunur, yazılmaz:** `lib/events/events-query.ts` (Ş1), `lib/voice/*` (canlı dinleyici sayımı),
`lib/workspace/access-context.ts`.

---

## İş

### 1. Erişim kuralı

Detay, listenin **aynı** görünürlük kuralını kullanır: izleyici sunucunun üyesiyse **veya**
etkinlik `isPublic` ise görür. Kural `events-query.ts`'in dallarından türetilir; ikinci bir
kontrol yazılmaz. Görmediği bir etkinliğin kimliğiyle istek yaparsa **404** (403 değil —
403 etkinliğin varlığını sızdırır).

### 2. Katılımcı listesi ve roller (`attendee-roles.ts`)

Rol dört değer: `host` · `going` · `maybe` · `listening`.

| Rol         | Kaynak                                                                       |
| ----------- | ---------------------------------------------------------------------------- |
| `host`      | `ScheduledEvent.creatorId`                                                   |
| `going`     | `ScheduledEventInterest.status = 'GOING'`                                    |
| `maybe`     | `ScheduledEventInterest.status = 'MAYBE'`                                    |
| `listening` | Etkinlik `ACTIVE` **ve** bağlı sesli/sahne kanalında `VoiceState` satırı var |

Sıralama: `host` → `listening` → `going` → `maybe`, her grup içinde `createdAt ASC`.
İlk **sayfa 8 kişi** döner; `attendeeMoreCount` kalanı verir (`{count} kişi daha` bağlantısı).

**Bir kişi tek satırda durur.** Hem `going` hem `listening` olan kişi `listening` gösterir
(canlı olan bilgi daha taze). Çözümleyici **saf fonksiyondur** ve bu öncelik sırasını tek
yerde tutar — sunucu ve olası ikinci tüketici (mobil) aynı sırayı okur.

`listening` rolü yalnız `ACTIVE` etkinlikte hesaplanır; `SCHEDULED` etkinlikte `VoiceState`
sorgusu **hiç** açılmaz (boş yere kanal başına sayım yapmamak için).

### 3. Hatırlatma okuması

`ScheduledEventReminder` satırı izleyiciye özeldir. Yoksa `reminder: null` döner; panel o zaman
şeridi "kapalı" durumunda çizer. Yazma yolu Ş3'te.

`UserNotificationSettings.eventNotifications = false` ise `reminder` yine gerçek satırı döner
ama yanıt `reminderSuppressed: true` taşır — panel "Hatırlatma açık" yerine bildirimlerin
kapalı olduğunu söyleyebilsin. (Metin anahtarı Ş0.5'te; şerit yalnız bayrağı üretir.)

### 4. CTA durumu

Yanıt üç alan taşır, **metin taşımaz**:

```ts
canJoinLive: boolean; // status === 'ACTIVE' && bağlı kanal var && izleyici o kanala girebilir
joinHref: string | null; // '/channels/<serverId>/<channelId>' — kanal yoksa null
rsvp: "going" | "maybe" | null;
```

İstemci metni bunlardan kurar: `going` → `Katılımı geri al`, `canJoinLive` → `Yayına katıl`,
diğer → `Katıl` (SPEC §5).

`joinHref` sunucuda üretilir çünkü kanal erişimi (`VIEW_CHANNEL` + `CONNECT_VOICE`) izleyiciye
göre değişir; istemcinin bilmediği bir bilgi.

### 5. Uç

| Uç                             | Girdi             | Çıktı         |
| ------------------------------ | ----------------- | ------------- |
| `GET /api/v1/events/[eventId]` | `attendeeCursor?` | `EventDetail` |

`route-logic.ts` bağımlılık enjeksiyonlu; rate limit anahtarı `events:detail`.
`attendeeCursor` `{count} kişi daha` bağlantısının sayfalaması içindir (8'er).

---

## Kabul

- [ ] Üye olmayan izleyici `isPublic` etkinliğin detayını görüyor; kapalı etkinlikte **404**.
- [ ] Rol öncelik sırası: hem `GOING` hem `VoiceState` olan kişi tek satırda ve `listening`.
- [ ] `SCHEDULED` etkinlikte `VoiceState` sorgusu hiç açılmıyor (test bunu sahte veritabanı
      çağrı sayımıyla doğrular).
- [ ] `attendeeMoreCount` = toplam − dönen; ikinci sayfa aynı kişiyi tekrarlamıyor.
- [ ] `canJoinLive` yalnız `ACTIVE` + bağlı kanal + izleyici kanala girebiliyorken `true`.
- [ ] `joinHref` harici etkinlikte `null`.
- [ ] Hatırlatma satırı yokken `reminder: null`; varken `minutesBefore` doğru.
- [ ] `eventNotifications=false` iken `reminderSuppressed: true`.
- [ ] Yanıt hiçbir görüntülenecek Türkçe metin taşımıyor.

## Kapı

```
pnpm --filter @wizards/web typecheck && pnpm --filter @wizards/web lint && pnpm --filter @wizards/web test
```
