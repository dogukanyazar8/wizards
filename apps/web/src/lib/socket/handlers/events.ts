import { EVENTS_PUBLIC_ROOM } from "@/lib/events/realtime";
import type { HandlerContext } from "../context";
import type { SocketHandlerRegistration } from ".";

/**
 * Etkinlikler Ş4 — herkese açık etkinlik odası.
 *
 * Sunucu odalarına (`server:<id>`) üyelik zaten var; burada açılan tek şey `events:public`.
 * Odanın içeriği tanım gereği herkese açık (`ScheduledEvent.isPublic`), o yüzden yetki kapısı
 * yok — ama abonelik **kalıcı değil**: `/events` yüzeyinden çıkan istemci odayı bırakır,
 * aksi hâlde her kullanıcı bütün herkese açık etkinlik trafiğini ömür boyu taşırdı.
 */
export function registerEventHandlers(ctx: HandlerContext): SocketHandlerRegistration {
  ctx.socket.on("events:public:watch", () => {
    ctx.socket.join(EVENTS_PUBLIC_ROOM);
  });

  ctx.socket.on("events:public:unwatch", () => {
    ctx.socket.leave(EVENTS_PUBLIC_ROOM);
  });

  return {};
}
