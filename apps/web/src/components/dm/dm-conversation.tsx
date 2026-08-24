"use client";

import type { ReactNode } from "react";
import type { DMParticipantDTO } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";

export function getDmStatusDotClass(status: DMParticipantDTO["status"] | undefined) {
  if (status === "ONLINE") {
    return "bg-[hsl(var(--success))]";
  }

  if (status === "IDLE") {
    // Boşta tonu artık paletin `--warning` token'ı. Sabit bir renk üçlüsü
    // kullanıcının temasıyla birlikte değişmiyordu ve koyu temada kendi başına
    // parlıyordu. (Token denetimi yorumları elemez; bu yüzden burada renk
    // fonksiyonunun adı yazılı **değil**.)
    return "bg-[hsl(var(--warning))]";
  }

  if (status === "DND") {
    return "bg-[hsl(var(--danger))]";
  }

  return "bg-[hsl(var(--text-soft))]";
}

export function getDmStatusKey(status: DMParticipantDTO["status"] | undefined) {
  if (status === "ONLINE") {
    return "friends.status.online";
  }

  if (status === "IDLE") {
    return "friends.status.idle";
  }

  if (status === "DND") {
    return "friends.status.dnd";
  }

  return "friends.status.offline";
}

/**
 * `DmConversationHeader`, `DmGroupConversationHeader` ve `DmConversationToolbar`
 * Mesajlar Ş5'te kaldırıldı: sohbet başlığı artık tek bir bileşen
 * (`components/messages/conversation-header.tsx`) ve iki varyantı da o çiziyor.
 * Kalan üç dışa açık ad hâlâ kullanılıyor: durum noktası/etiketi
 * `dm-details-panel`'de, yüzey ve bestekâr sarmalayıcıları `chat-area`'da.
 */

export function DmMessageSurface({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("dm.header.directMessage")}
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent"
      data-testid="dm-message-surface"
    >
      {children}
    </section>
  );
}

export function DmComposer({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0" data-testid="dm-composer">
      {children}
    </div>
  );
}
