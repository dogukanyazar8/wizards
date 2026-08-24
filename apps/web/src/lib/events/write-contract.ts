import { EventCountsSchema } from "@wizards/types";
import { z } from "zod";

import { EventDetailResponseSchema } from "@/lib/events/detail-contract";

/**
 * Etkinlikler Ş3 — yazma yanıtlarının şeması.
 *
 * `detail-contract.ts` ile aynı gerekçe: **iki tarafın** ortak sözleşmesi. Sunucu
 * (`lib/events/mutations.ts`) yazarken, istemci (`client.ts`) okurken aynı şemadan geçer;
 * istemcinin servis modülünü içeri alması Prisma'yı tarayıcı paketine taşımak olurdu.
 *
 * Üç yazma ucu da (`POST /events`, `PUT .../rsvp`, `PUT .../reminder`) aynı gövdeyi döner:
 * güncel etkinlik **ve** güncel sayaçlar. İstemcinin ikinci istek atmasına gerek kalmaz —
 * kart kenarı, buton metni, sağ ray listesi ve başlık sayacı aynı anda tazelenir (SPEC §8
 * "sayaçlar tek kaynaktan gelir").
 */
export const EventWriteResponseSchema = z.object({
  counts: EventCountsSchema,
  event: EventDetailResponseSchema,
  /**
   * K5 / tuzak #8 — hatırlatma işi gerçekten kuyruğa yazıldı mı. `availableAt` geçmişte
   * kaldıysa (etkinlik 5 dk sonra, tercih 10 dk) iş **yazılmaz** ve bu alan `false` döner;
   * panel "etkinlik çok yakın" durumunu gösterebilir. `true` dönüp iş yazmamak, gelmeyecek
   * bir bildirimin sözünü vermek olurdu.
   */
  scheduled: z.boolean(),
});
export type EventWriteResponsePayload = z.infer<typeof EventWriteResponseSchema>;
