"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import {
  createEventsRealtimeHandlers,
  shouldWatchPublicEvents,
  type EventCreatedPayload,
} from "@/lib/events/realtime";

import { useSocket } from "./use-socket";

/**
 * Etkinlikler — Dalga 1 / Ş4. Ekranın **tek** socket aboneliği.
 *
 * Kanca yalnız iki iş yapıyor: olayları bağlamak ve herkese açık odayı rotaya göre açıp
 * kapatmak. Yamanın kendisi `lib/events/realtime.ts` içinde saf duruyor; burada bir
 * `setQueryData` çağrısı olsaydı yama React olmadan test edilemezdi.
 *
 * **Bir kez** mount edilir (ekranın kökü). İki kopya aynı anda dinlerse `event:live:*`
 * sayaçları iki kez oynar — kart yamaları idempotent ama hafif sayaç anahtarı olayın kendisini
 * tanımıyor.
 */
export type UseEventsRealtimeResult = {
  /** Akış başındaki "yeni etkinlik" sinyali; liste **yeniden sıralanmadığı** için sayı olarak. */
  readonly newEventCount: number;
  readonly resetNewEvents: () => void;
};

export function useEventsRealtime(): UseEventsRealtimeResult {
  const socket = useSocket();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [newEventCount, setNewEventCount] = useState(0);
  const resetNewEvents = useCallback(() => setNewEventCount(0), []);
  const watchPublic = shouldWatchPublicEvents(pathname);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handlers = createEventsRealtimeHandlers({
      onNewEvent: (_payload: EventCreatedPayload) => setNewEventCount((current) => current + 1),
      queryClient,
    });

    socket.on("event:created", handlers.onCreated);
    socket.on("event:updated", handlers.onUpdated);
    socket.on("event:rsvp", handlers.onRsvp);
    socket.on("event:live:started", handlers.onLiveStarted);
    socket.on("event:live:ended", handlers.onLiveEnded);

    return () => {
      socket.off("event:created", handlers.onCreated);
      socket.off("event:updated", handlers.onUpdated);
      socket.off("event:rsvp", handlers.onRsvp);
      socket.off("event:live:started", handlers.onLiveStarted);
      socket.off("event:live:ended", handlers.onLiveEnded);
    };
  }, [queryClient, socket]);

  useEffect(() => {
    if (!socket || !watchPublic) {
      return;
    }

    socket.emit("events:public:watch");

    return () => {
      socket.emit("events:public:unwatch");
    };
  }, [socket, watchPublic]);

  return { newEventCount, resetNewEvents };
}
