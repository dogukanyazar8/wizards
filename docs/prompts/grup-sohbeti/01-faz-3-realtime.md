# Faz 3 — Realtime (Görev 8)

> **Önce oku:** `docs/prompts/grup-sohbeti/00-ortak-baglam.md`. Oradaki sözleşmeler,
> çalışma kuralları ve "bizim olmayan kırıklar" listesi bu promptun parçasıdır.

Tek görev, ama planın **en kritik güvenlik kalemi** burada.

---

## Neden

Grup üyeliği değiştiğinde üç şeyin olması gerekir:

1. Gruba yeni alınan kişinin gelen kutusunda satır **refetch olmadan** belirmeli.
2. Odadaki herkes üye listesinin değiştiğini öğrenmeli.
3. Gruptan çıkarılan kişi hem satırı düşürmeli **hem de artık mesaj almamalı**.

Üçüncüsü sessizce kırılıyor: `dm:join` handler'ı katılımı kapıda `isDMParticipant`
ile kontrol ediyor (`apps/web/src/lib/socket/handlers/dm.ts:179`), ama **zaten
katılmış bir soketi odadan atmıyor**. Çıkarılan üyenin soketi `dm:<id>` odasında
kalırsa gruptan sonraki tüm mesajları almaya devam eder. Bu bir veri sızıntısıdır.

---

## Görev 8 — Grup olayları ve çıkarılan üyenin tahliyesi

### Dosyalar

- **Değiştir:** `apps/web/src/lib/socket/events.ts` (mevcut `"dm:conversation:updated"` tanımının hemen altı)
- **Oluştur:** `apps/web/src/lib/dm/group-realtime.ts`
- **Oluştur:** `apps/web/src/lib/dm/group-realtime.test.ts`

### 8.1 Üç yeni olay

`apps/web/src/lib/socket/events.ts`:

```ts
  /** A group the viewer is now in. Lands in their inbox without a refetch. */
  "dm:conversation:created": (data: { conversation: DMConversationDTO }) => void;
  "dm:conversation:members_changed": (data: {
    conversationId: string;
    conversation: DMConversationDTO;
  }) => void;
  /** The viewer is no longer a participant. Drop the row, close the chat. */
  "dm:conversation:removed": (data: { conversationId: string }) => void;
```

Mevcut `"dm:conversation:updated"` ad/foto değişimi için yeniden kullanılır — yeni
olay eklenmez.

### 8.2 Yayın modülü

`apps/web/src/lib/dm/group-realtime.ts` üç fonksiyon export eder:

```ts
export type GroupRealtimeServer = {
  in(room: string): { socketsLeave(room: string): void };
  to(rooms: string | string[]): { emit(event: string, ...args: unknown[]): void };
};

export function emitGroupConversationCreated(
  io: GroupRealtimeServer,
  conversation: DMConversationDTO,
): void;
export function emitGroupMembersChanged(
  io: GroupRealtimeServer,
  input: { addedUserIds?: readonly string[]; conversation: DMConversationDTO },
): void;
export function evictRemovedGroupMember(
  io: GroupRealtimeServer,
  input: { conversationId: string; userId: string },
): void;
```

Oda hedefleri:

| Fonksiyon                      | Odalar                                                               |
| ------------------------------ | -------------------------------------------------------------------- |
| `emitGroupConversationCreated` | her katılımcının `user:<id>` odası                                   |
| `emitGroupMembersChanged`      | `dm:<conversationId>` **artı** `addedUserIds`'in `user:<id>` odaları |
| `evictRemovedGroupMember`      | yalnızca çıkarılanın `user:<id>` odası                               |

`GroupRealtimeServer` tipi `io`'nun bu modülde kullanılan minimum yüzeyidir —
Socket.IO'nun tam tipine bağlanma, testin sahte `io` üretebilmesi buna bağlı.

### 8.3 Tahliye — bu görevin asıl işi

`evictRemovedGroupMember` iki şey yapar, ikisi de zorunlu:

```ts
io.to(`user:${input.userId}`).emit("dm:conversation:removed", {
  conversationId: input.conversationId,
});

// `dm:join` gates entry but never removes a socket that is already inside, so
// an un-evicted socket would keep receiving this group's messages.
io.in(`user:${input.userId}`).socketsLeave(`dm:${input.conversationId}`);
```

`socketsLeave` çağrısı olmadan bu görev **tamamlanmamış** sayılır.

### 8.4 Testler

`apps/web/src/lib/dm/group-realtime.test.ts`, sahte `io` ile (gerçek soket yok):

1. Yeni grup her katılımcının `user:<id>` odasına duyurulur.
2. Üyelik değişimi hem `dm:<id>` odasına hem eklenen üyelerin `user:<id>` odalarına gider.
3. Çıkarılan üyeye `dm:conversation:removed` gider **ve** soketleri `dm:<id>`
   odasından çıkarılır.

Sahte `io`, `to()` çağrılarının aldığı oda listesini ve `in().socketsLeave()`
çağrılarını kaydeder; testler kaydedilen çağrıları `assert.deepEqual` ile doğrular.

---

## Kabul kriterleri

- [ ] `events.ts`'te üç yeni olay tanımlı, `DMConversationDTO` tipiyle
- [ ] `group-realtime.ts` üç fonksiyonu ve `GroupRealtimeServer` tipini export ediyor
- [ ] `evictRemovedGroupMember` hem emit hem `socketsLeave` yapıyor
- [ ] `group-realtime.test.ts` üç testi geçiyor, hiçbiri gerçek soket açmıyor
- [ ] Tahliye testi için deliberate-failure kanıtı: `socketsLeave` satırını sil,
      tam o testin düştüğünü göster, geri al, `md5sum` ile doğrula
- [ ] `pnpm --filter @wizards/web test` → 1843'ten 1846'ya çıkmış, 0 fail
      (ortak bağlam §4'teki bizim olmayan kırıklar hariç)
- [ ] `pnpm --filter @wizards/web typecheck` → bilinen e2e hatası dışında 0

## Rapor

`.superpowers/sdd/groupdm/task-8-report.md` — dosyalar, komutlar ve gerçek çıktıları,
mutation kanıtı, kendi incelemende bulduğun sorunlar.
