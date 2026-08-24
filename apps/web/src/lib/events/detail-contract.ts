import { EventDetailSchema } from "@wizards/types";
import { z } from "zod";

/**
 * Etkinlikler Ş2 — detay yanıtının şeması.
 *
 * Kendi dosyasında duruyor çünkü **iki tarafın** ortak sözleşmesi: sunucu (`detail-service.ts`)
 * yazarken, istemci (`client.ts`) okurken aynı şemadan geçer. İstemcinin servis modülünü
 * içeri alması, `Buffer` kullanan imleç kodunu ve yetki matematiğini tarayıcı paketine
 * taşımak demekti.
 *
 * Dalga 0'ın `EventDetailSchema`sı aşağıdaki iki alanı taşımıyor; ikisi de Ş2'nin ürettiği
 * bayraklar ve `packages/types` bu şeridin sahiplendiği dosyalar arasında değil.
 */
export const EventDetailResponseSchema = EventDetailSchema.extend({
  /** `{count} kişi daha` bağlantısının ikinci sayfası; sonu gelmişse `null`. */
  attendeeNextCursor: z.string().nullable(),
  /**
   * K7 — `UserNotificationSettings.eventNotifications = false`. Hatırlatma satırı **gerçek**
   * döner; panel "Hatırlatma açık" yerine bildirimlerin kapalı olduğunu söyleyebilsin diye
   * ayrı bir bayrak. Satırı gizlemek, kullanıcının kaydettiği tercihi kaybetmek olurdu.
   */
  reminderSuppressed: z.boolean(),
});
export type EventDetailResponse = z.infer<typeof EventDetailResponseSchema>;
