"use client";

import React from "react";
import { Pin } from "lucide-react";
import type { PinnedMessageDTO } from "@wizards/types";

import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useAccountPreferenceRuntime } from "@/components/providers/account-preference-provider";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { jumpToMessageInDocument } from "@/lib/messages/jump-to-message";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";

/**
 * `SABİTLENEN MESAJLAR` — SPEC-MESAJLAR §15.3.6, yalnız grup kolunda.
 *
 * Kart tıklanınca mesaja gider ve bunu **mevcut yol** ile yapar:
 * `jumpToMessageInDocument` adres çubuğuna `?message=<id>` yazıp mesaj listesinin kendi
 * `popstate` dinleyicisini uyandırır (`chat-area.tsx` ve `server-member-panel.tsx` aynı
 * çağrıyı kullanıyor). Yeni bir gezinme icat etmek, aynı hedefe giden üçüncü bir yol ve
 * üçüncü bir vurgulama süresi demekti.
 *
 * Sabitlenen yoksa bölüm **hiç çizilmez**.
 */

const { profilePanel } = MESSAGES_METRICS;

/** Başlık satırının kutusu — raptiye ikonu bu yüksekliğe ortalanır. */
const PIN_TITLE_LINE_HEIGHT = profilePanel.pinTitleFontSize * profilePanel.pinTitleLineHeight;

/** İki satırlık gövde: başlık + boşluk + alıntı. İskelet yüksekliği buradan gelir. */
const PIN_TEXT_BLOCK_HEIGHT =
  PIN_TITLE_LINE_HEIGHT +
  profilePanel.pinExcerptMarginTop +
  profilePanel.pinExcerptFontSize * profilePanel.pinExcerptLineHeight;

export type ProfilePinnedListProps = {
  readonly failed?: boolean | undefined;
  readonly loading?: boolean | undefined;
  /** Testin ve panelin dışarıdan değiştirebilmesi için; varsayılan mevcut atlama yoludur. */
  readonly onJump?: ((messageId: string) => void) | undefined;
  readonly pins: readonly PinnedMessageDTO[];
};

export function ProfilePinnedList({
  failed = false,
  loading = false,
  onJump,
  pins,
}: ProfilePinnedListProps) {
  const { t } = useI18n();
  const { formatDate } = useAccountPreferenceRuntime();
  const jump = onJump ?? jumpToMessageInDocument;

  if (failed) {
    return (
      <p
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-pinned-error"
        style={{ fontSize: pxToRem(profilePanel.pinExcerptFontSize) }}
      >
        {t("messages.profile.error.load")}
      </p>
    );
  }

  if (loading) {
    return (
      <section data-testid="profile-pinned">
        <ProfileSectionLabel>{t("messages.profile.section.pinnedMessages")}</ProfileSectionLabel>
        <div
          className="flex flex-col"
          style={{
            gap: pxToRem(profilePanel.pinListGap),
            marginTop: pxToRem(profilePanel.sectionContentMarginTop),
          }}
        >
          {[0, 1].map((index) => (
            <Skeleton
              key={index}
              style={{
                borderRadius: pxToRem(profilePanel.pinCardRadius),
                height: pxToRem(profilePanel.pinCardPadding * 2 + PIN_TEXT_BLOCK_HEIGHT),
              }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (pins.length === 0) {
    return null;
  }

  return (
    <section data-testid="profile-pinned">
      <ProfileSectionLabel>{t("messages.profile.section.pinnedMessages")}</ProfileSectionLabel>
      <div
        className="flex flex-col"
        style={{
          gap: pxToRem(profilePanel.pinListGap),
          marginTop: pxToRem(profilePanel.sectionContentMarginTop),
        }}
      >
        {pins.map((pin) => (
          <button
            className="flex w-full min-w-0 text-left outline-hidden transition-colors hover:border-[hsl(var(--primary)/0.45)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid={`profile-pinned-${pin.messageId}`}
            key={pin.messageId}
            onClick={() => jump(pin.messageId)}
            style={{
              background: "hsl(var(--surface-card))",
              border: `${hairline()} solid hsl(var(--border)/0.6)`,
              borderRadius: pxToRem(profilePanel.pinCardRadius),
              gap: pxToRem(profilePanel.pinCardGap),
              padding: pxToRem(profilePanel.pinCardPadding),
            }}
            type="button"
          >
            {/* İkon başlık satırının kutusuna ortalanır; HTML'in 2px'lik optik itmesi
                sözlükte bir ölçü olarak yok ve satır yüksekliğinden türetmek aynı hizayı
                ölçek değişince de korur. */}
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center text-[hsl(var(--warning))]"
              style={{ height: pxToRem(PIN_TITLE_LINE_HEIGHT) }}
            >
              <Pin
                style={{
                  height: pxToRem(profilePanel.pinIconSize),
                  width: pxToRem(profilePanel.pinIconSize),
                }}
              />
            </span>
            <span className="min-w-0">
              <span
                className="block truncate text-[hsl(var(--foreground))]"
                style={{
                  fontSize: pxToRem(profilePanel.pinTitleFontSize),
                  fontWeight: 600,
                  lineHeight: profilePanel.pinTitleLineHeight,
                }}
              >
                {`${pin.authorName} · ${formatDate(pin.pinnedAt)}`}
              </span>
              <span
                className="block text-[hsl(var(--text-muted))]"
                style={{
                  fontSize: pxToRem(profilePanel.pinExcerptFontSize),
                  lineHeight: profilePanel.pinExcerptLineHeight,
                  marginTop: pxToRem(profilePanel.pinExcerptMarginTop),
                }}
              >
                {pin.excerpt}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
