import {
  AppNotificationGroupSchema,
  NotifPanelTabSchema,
  NotifUnreadCountsSchema,
  type NotifUnreadCounts,
} from "@wizards/types";
import { z } from "zod";

export interface NotificationActorDTO {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface NotificationDTO {
  id: string;
  type:
    | "BADGE"
    | "FEEDBACK"
    | "FRIEND_REQUEST"
    | "FRIEND_ACCEPTED"
    | "DM"
    | "MENTION"
    | "MODERATION"
    | "SERVER_INVITE"
    | "SYSTEM";
  actor: NotificationActorDTO | null;
  message: string;
  actionUrl: string | null;
  readAt: string | null;
  createdAt: string;
  meta?: Record<string, string>;
}

export const NotificationIdParamsSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Bildirim merkezi — Dalga 1 / Ş2
// ---------------------------------------------------------------------------

/** §7 imzalarının adı; şema Ş0'da (`packages/types`) tanımlı, burada yalnız takma ad. */
export type NotificationCounts = NotifUnreadCounts;

/**
 * §3 — panelin sayfası. Varsayılan **6** (tasarımın panel örneği), üst sınır 50.
 *
 * `tab` **opsiyonel ve varsayılansız**: verilmediğinde uç eski dizi yanıtını döndürür, çünkü
 * `notification-bell.tsx` Ş11'e kadar onu okuyor (03 §7). Varsayılan `all` konsaydı, tek bir
 * istemci güncellemesi olmadan zil menüsü kırılırdı.
 */
export const NotificationPanelQuerySchema = z.object({
  cursor: z.string().min(1).max(400).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(6),
  tab: NotifPanelTabSchema,
});

export type NotificationPanelQuery = z.infer<typeof NotificationPanelQuerySchema>;

/**
 * §3 sayfanın yanıtı. Sayaçlar yanıtın içinde geliyor — panelin sekme pilleri sayfayla aynı
 * anda güncellenmezse, pil bir sayı listenin kendisi başka bir sayı gösterir.
 */
export const NotificationPageSchema = z.object({
  counts: NotifUnreadCountsSchema,
  groups: z.array(AppNotificationGroupSchema),
  nextCursor: z.string().nullable(),
  tab: NotifPanelTabSchema,
});

export type NotificationPageDTO = z.infer<typeof NotificationPageSchema>;

/**
 * §4 çevirme kipi. Gövde yoksa `{ read: true }` varsayılır — `parseJsonBody` boş gövdeyi `{}`
 * olarak veriyor ve `.default(true)` orada devreye giriyor. Eski istemci (gövdesiz `PATCH`)
 * bu yüzden kırılmaz.
 */
export const NotificationReadBodySchema = z.object({
  read: z.boolean().default(true),
});

/** §5 — `GET /unread-count` yanıtı. `count` geriye uyumluluk için duruyor. */
export const NotificationUnreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
  counts: NotifUnreadCountsSchema,
});
