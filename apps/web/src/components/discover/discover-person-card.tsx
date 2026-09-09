"use client";

import React, { memo, type CSSProperties } from "react";
import { ExternalLink, UserPlus } from "lucide-react";
import type { DiscoverPerson } from "@wizards/types";

import { DiscoverPresenceDot } from "@/components/discover/discover-presence-dot";
import { useI18n } from "@/components/providers/locale-provider";
import { Avatar } from "@/components/ui/avatar";
import { DISCOVER_METRICS, hairline, pxToEm, pxToRem } from "@/lib/discover/metrics";

export type DiscoverPersonCardProps = {
  readonly onAddFriend: (person: DiscoverPerson) => void;
  readonly onOpen: (person: DiscoverPerson) => void;
  readonly onOpenProfile: (person: DiscoverPerson) => void;
  readonly person: DiscoverPerson;
  readonly reason?: string;
};

function DiscoverPersonCardComponent({
  onAddFriend,
  onOpen,
  onOpenProfile,
  person,
  reason,
}: DiscoverPersonCardProps) {
  const { t } = useI18n();
  const metrics = DISCOVER_METRICS.personCard;
  const titleId = `discover-person-card-title-${person.id}`;
  const mutualLabel =
    person.mutualServerCount > 0 && person.mutualServerName
      ? t("discover.person.mutualServers", {
          count: person.mutualServerCount,
          server: person.mutualServerName,
        })
      : reason;
  const articleStyle: CSSProperties = {
    background: "hsl(var(--surface-card)/0.6)",
    border: `${hairline(metrics.borderWidth)} solid hsl(var(--border)/0.6)`,
    borderRadius: pxToRem(metrics.radius),
    contentVisibility: "auto",
    fontFamily: "var(--font-sans)",
    gap: pxToRem(metrics.gap),
    padding: `${pxToRem(metrics.paddingTop)} ${pxToRem(metrics.paddingX)} ${pxToRem(
      metrics.paddingBottom,
    )}`,
    transition: `border-color ${DISCOVER_METRICS.transitions.hover}ms, transform ${DISCOVER_METRICS.transitions.hover}ms`,
  };

  return (
    <article
      aria-labelledby={titleId}
      className="relative flex cursor-pointer flex-col hover:-translate-y-0.5 hover:border-[hsl(var(--primary)/0.45)] motion-reduce:hover:translate-y-0"
      data-testid="discover-person-card"
      style={articleStyle}
    >
      <div className="flex min-w-0 items-center" style={{ gap: pxToRem(metrics.headGap) }}>
        <div className="relative shrink-0">
          <Avatar
            alt={person.name}
            fallback={person.initials}
            src={person.avatarUrl}
            style={{ height: pxToRem(metrics.avatarSize), width: pxToRem(metrics.avatarSize) }}
          />
          <DiscoverPresenceDot
            className="absolute"
            presence={person.presence}
            ringWidth={metrics.presenceDotRingWidth}
            size={metrics.presenceDotSize}
            style={{ bottom: pxToRem(-1), right: pxToRem(-1) }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <button
            className="block w-full truncate text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-[hsl(var(--ring))] focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-[hsl(var(--surface-card))]"
            data-testid="discover-person-card-open"
            id={titleId}
            onClick={() => onOpen(person)}
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(metrics.nameFontSize),
              fontWeight: metrics.nameWeight,
              lineHeight: metrics.nameLineHeight,
            }}
            type="button"
          >
            {person.name}
          </button>
          <div
            className="truncate text-[hsl(var(--text-muted))]"
            style={{
              fontSize: pxToRem(metrics.handleFontSize),
              fontWeight: metrics.handleWeight,
              lineHeight: metrics.handleLineHeight,
              marginTop: pxToRem(metrics.handleMarginTop),
            }}
          >
            @{person.handle.replace(/^@/u, "")}
          </div>
        </div>
      </div>

      {mutualLabel ? (
        <div
          className="flex items-center bg-[hsl(var(--surface-soft)/0.6)]"
          data-testid="discover-person-card-mutual"
          style={{
            borderRadius: pxToRem(metrics.mutualRadius),
            gap: pxToRem(metrics.mutualGap),
            padding: `${pxToRem(metrics.mutualPaddingY)} ${pxToRem(metrics.mutualPaddingX)}`,
          }}
        >
          <UserPlus
            aria-hidden="true"
            className="shrink-0 text-[hsl(var(--text-muted))]"
            style={{
              height: pxToEm(metrics.mutualIconSize, metrics.mutualFontSize),
              width: pxToEm(metrics.mutualIconSize, metrics.mutualFontSize),
            }}
          />
          <span
            className="min-w-0 flex-1 truncate text-[hsl(var(--text-secondary))]"
            style={{
              fontSize: pxToRem(metrics.mutualFontSize),
              fontWeight: metrics.mutualWeight,
              lineHeight: metrics.mutualLineHeight,
            }}
          >
            {mutualLabel}
          </span>
        </div>
      ) : null}

      {person.interestTags.length > 0 ? (
        <div
          className="flex flex-wrap"
          data-testid="discover-person-card-tags"
          style={{ gap: pxToRem(metrics.tagRowGap) }}
        >
          {person.interestTags.map((tag) => (
            <span
              className="whitespace-nowrap bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-muted))]"
              key={tag}
              style={{
                borderRadius: pxToRem(metrics.tagRadius),
                fontSize: pxToRem(metrics.tagFontSize),
                fontWeight: metrics.tagWeight,
                lineHeight: 1,
                padding: `${pxToRem(metrics.tagPaddingY)} ${pxToRem(metrics.tagPaddingX)}`,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <div
        className="relative z-10 mt-auto flex items-center"
        style={{ gap: pxToRem(metrics.actionRowGap) }}
      >
        <button
          className="flex flex-1 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-default"
          disabled={person.requestSent}
          onClick={() => onAddFriend(person)}
          style={{
            background: person.requestSent ? "hsl(var(--surface-tertiary))" : "hsl(var(--primary))",
            border: `${hairline(metrics.addButtonBorderWidth)} solid ${
              person.requestSent ? "hsl(var(--border))" : "hsl(var(--primary))"
            }`,
            borderRadius: pxToRem(metrics.addButtonRadius),
            color: person.requestSent
              ? "hsl(var(--text-secondary))"
              : "hsl(var(--primary-foreground))",
            fontSize: pxToRem(metrics.addButtonFontSize),
            fontWeight: metrics.addButtonWeight,
            gap: pxToRem(metrics.addButtonGap),
            height: pxToRem(metrics.addButtonHeight),
            lineHeight: 1,
          }}
          type="button"
        >
          {t(person.requestSent ? "discover.person.requested" : "discover.person.add")}
        </button>
        <button
          aria-label={t("discover.person.openProfile")}
          className="relative grid shrink-0 place-items-center border-[hsl(var(--border)/0.7)] bg-transparent text-[hsl(var(--text-muted))] before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--surface-hover)] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          onClick={() => onOpenProfile(person)}
          style={{
            borderRadius: pxToRem(metrics.profileButtonRadius),
            borderStyle: "solid",
            borderWidth: hairline(),
            height: pxToRem(metrics.profileButtonSize),
            width: pxToRem(metrics.profileButtonSize),
          }}
          type="button"
        >
          <ExternalLink
            aria-hidden="true"
            style={{
              height: pxToEm(metrics.profileButtonIconSize, metrics.profileButtonSize),
              width: pxToEm(metrics.profileButtonIconSize, metrics.profileButtonSize),
            }}
          />
        </button>
      </div>
    </article>
  );
}

export const DiscoverPersonCard = memo(DiscoverPersonCardComponent);
