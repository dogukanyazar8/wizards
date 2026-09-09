"use client";

import React from "react";
import { BellOff, Crown, MessageSquare, Phone, Settings, UserPlus, Video } from "lucide-react";
import type {
  DMParticipantRole,
  GroupProfilePanelDTO,
  MessagesPresence,
  UserProfilePanelDTO,
} from "@wizards/types";

import { DISPLAY_FONT } from "@/components/home/home-primitives";
import { useI18n } from "@/components/providers/locale-provider";
import { getGroupSwatchBackground, getGroupSwatchInk } from "@/lib/messages/group-swatch";
import { MESSAGES_METRICS, hairline, pxToEm, pxToRem } from "@/lib/messages/metrics";
import { profileTintForeground, profileTintSurface } from "@/lib/messages/profile-tint";
import { cn } from "@/lib/utils";

/**
 * Profil panelinin kimlik bloğu — SPEC-MESAJLAR §15.1.
 *
 * İki kol tek dosyada: DM 72px daire harf karosu + presence halkası, grup 66px
 * köşeli tile + rol pill'i. Ortak olan **kabuk** — ortalanmış kolon, ölçüleri,
 * zemini, alt kenarı ve üç düğmelik aksiyon satırı; ayrı iki dosya olsalardı o
 * kabuk iki kez yazılır ve biri zamanla diğerinden kayardı.
 *
 * **Gri DS avatarı yok** (kural 5). Karo rengi kişinin tintinden gelir ve tint'i
 * seçen taraf **sunucu**dur (`resolveProfileTint`, `@wizards/types`): DTO onu
 * damgalayıp gönderiyor, istemci yalnız boyuyor. İstemcide ikinci bir hash
 * kurulsaydı aynı kişi rayda bir renk, panelde başka bir renk olurdu — tam olarak
 * §15.1'in "aynı kaynaktan gelir" cümlesinin yasakladığı şey.
 */

const { profilePanel } = MESSAGES_METRICS;

/**
 * Kimlik bloğunun kenar opaklığı (§15.1 · `Mesajlar.dc.html` L957). Zemin
 * (`--surface-secondary/0.55`) Tailwind sınıfında duruyor: arbitrary sınıf derleme
 * anında okunur, bir JS sabitini oraya taşımak sınıfı sessizce üretilmez yapardı.
 */
const BORDER_ALPHA = 0.4;
/**
 * `letter-spacing: var(--w-track)` = `-0.02em` (SPEC-ANA-SAYFA §1 display kuralı).
 * Sözlük harf aralığı **taşımıyor** ve renk gibi bir token da değil; değer
 * `lib/discover/metrics.ts` ile aynı gerekçeyle burada yazılı.
 */
const DISPLAY_TRACKING = "-0.02em";
/** Presence halkasının iki katmanı: içteki dolu, dıştaki sönük. */
const RING_INNER_ALPHA = 0.55;
const RING_OUTER_ALPHA = 0.14;
/** Durum ve rol pill'lerinin tint zemini. */
const PILL_SURFACE_ALPHA = 0.14;

/**
 * Presence → renk token'ı. `offline` bir durum rengi değil: `--text-soft` sessiz
 * kalır, çünkü çevrimdışı bir uyarı değildir.
 */
const PRESENCE_TOKEN: Readonly<Record<MessagesPresence, string>> = Object.freeze({
  dnd: "--danger",
  idle: "--warning",
  offline: "--text-soft",
  online: "--success",
});

/**
 * Presence → sözlük anahtarı. Ana Sayfa'nın etiketleri yeniden kullanılıyor;
 * `messages.profile.*` ağacında presence adı **yok** ve Dalga 0 sözlüğü dondurdu.
 */
const PRESENCE_LABEL_KEY: Readonly<Record<MessagesPresence, string>> = Object.freeze({
  dnd: "home.presence.dnd",
  idle: "home.presence.idle",
  offline: "home.friends.offline",
  online: "home.presence.online",
});

export function presenceColor(presence: MessagesPresence, alpha?: number): string {
  const token = PRESENCE_TOKEN[presence];

  return alpha === undefined ? `hsl(var(${token}))` : `hsl(var(${token})/${alpha})`;
}

/** §15.1'in rol pill'i iki hâl tanır: `Yönetici` ve `Üye`. Sahip de yöneticidir. */
export function isProfileAdminRole(role: DMParticipantRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export type ProfilePanelIdentityProps =
  | {
      onSendMessage?: (() => void) | undefined;
      onStartVideoCall?: (() => void) | undefined;
      onStartVoiceCall?: (() => void) | undefined;
      profile: UserProfilePanelDTO;
      variant: "dm";
    }
  | {
      onAddMembers?: (() => void) | undefined;
      onOpenSettings?: (() => void) | undefined;
      onToggleMute?: (() => void) | undefined;
      profile: GroupProfilePanelDTO;
      variant: "group";
    };

function IdentityShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center bg-[hsl(var(--surface-secondary)/0.55)]"
      data-testid="profile-panel-identity"
      style={{
        borderBottom: `${hairline()} solid hsl(var(--border)/${BORDER_ALPHA})`,
        gap: pxToRem(profilePanel.identityGap),
        padding: `${pxToRem(profilePanel.identityPaddingTop)} ${pxToRem(profilePanel.identityPaddingX)} ${pxToRem(profilePanel.identityPaddingBottom)}`,
      }}
    >
      {children}
    </div>
  );
}

function IdentityName({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn("min-w-0 truncate text-[hsl(var(--foreground))]", DISPLAY_FONT)}
      data-testid="profile-panel-name"
      style={{
        fontSize: pxToRem(profilePanel.nameFontSize),
        fontWeight: 600,
        letterSpacing: DISPLAY_TRACKING,
        lineHeight: profilePanel.nameLineHeight,
      }}
    >
      {children}
    </div>
  );
}

/** Aksiyon satırının 36×36 ikon düğmesi — sesli/görüntülü arama, sessize al, ayarlar. */
function IdentityIconAction({
  hoverClassName,
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  hoverClassName: string;
  icon: typeof Phone;
  label: string;
  onClick: (() => void) | undefined;
  testId: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "grid shrink-0 place-items-center border border-[hsl(var(--border))] bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45",
        hoverClassName,
      )}
      data-testid={testId}
      disabled={!onClick}
      onClick={onClick}
      style={{
        borderRadius: pxToRem(profilePanel.actionRadius),
        height: pxToRem(profilePanel.actionIconButtonSize),
        width: pxToRem(profilePanel.actionIconButtonSize),
      }}
      title={label}
      type="button"
    >
      <Icon
        aria-hidden="true"
        style={{
          height: pxToRem(profilePanel.actionIconButtonIconSize),
          width: pxToRem(profilePanel.actionIconButtonIconSize),
        }}
      />
    </button>
  );
}

/** Aksiyon satırının birincil düğmesi: `Mesaj gönder` / `Üye ekle`. */
function IdentityPrimaryAction({
  icon: Icon,
  label,
  onClick,
  testId,
}: {
  icon: typeof Phone;
  label: string;
  onClick: (() => void) | undefined;
  testId: string;
}) {
  return (
    <button
      className="flex flex-1 items-center justify-center bg-[hsl(var(--primary))] text-white transition hover:brightness-110 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-45"
      data-testid={testId}
      disabled={!onClick}
      onClick={onClick}
      style={{
        borderRadius: pxToRem(profilePanel.actionRadius),
        fontSize: pxToRem(profilePanel.actionFontSize),
        fontWeight: 600,
        gap: pxToRem(profilePanel.actionGap),
        height: pxToRem(profilePanel.actionHeight),
        lineHeight: 1,
      }}
      type="button"
    >
      <Icon
        aria-hidden="true"
        style={{
          height: pxToEm(profilePanel.actionIconSize, profilePanel.actionFontSize),
          width: pxToEm(profilePanel.actionIconSize, profilePanel.actionFontSize),
        }}
      />
      {label}
    </button>
  );
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex w-full"
      data-testid="profile-panel-actions"
      style={{
        gap: pxToRem(profilePanel.actionsGap),
        marginTop: pxToRem(profilePanel.actionsMarginTop),
      }}
    >
      {children}
    </div>
  );
}

function DmIdentity({
  onSendMessage,
  onStartVideoCall,
  onStartVoiceCall,
  profile,
}: Extract<ProfilePanelIdentityProps, { variant: "dm" }>) {
  const { t } = useI18n();
  const presenceLabel = t(PRESENCE_LABEL_KEY[profile.presence]);
  const statusLine = profile.statusText
    ? `${presenceLabel} · ${profile.statusText}`
    : presenceLabel;

  return (
    <IdentityShell>
      <div className="relative">
        <div
          aria-hidden="true"
          className={cn("grid place-items-center rounded-full", DISPLAY_FONT)}
          data-testid="profile-panel-tile"
          style={{
            background: profileTintSurface(profile.tint),
            /*
              Halka presence rengiyle sürülür, sabit `--success` ile değil: tasarım
              örneği çevrimiçi bir kişiyi gösterdiği için yeşil görünüyor, ama
              çevrimdışı birinin etrafında yeşil bir halka doğrudan yalan söylerdi.
            */
            boxShadow: `0 0 0 ${pxToRem(profilePanel.dmRingInnerWidth)} ${presenceColor(profile.presence, RING_INNER_ALPHA)}, 0 0 0 ${pxToRem(profilePanel.dmRingOuterWidth)} ${presenceColor(profile.presence, RING_OUTER_ALPHA)}`,
            color: profileTintForeground(profile.tint),
            fontSize: pxToRem(profilePanel.dmTileFontSize),
            fontWeight: 600,
            height: pxToRem(profilePanel.dmTileSize),
            letterSpacing: profilePanel.dmTileTracking,
            lineHeight: 1,
            width: pxToRem(profilePanel.dmTileSize),
          }}
        >
          {profile.initials}
        </div>

        <span
          className="absolute"
          style={{
            bottom: pxToRem(profilePanel.dmStatusDotOffset),
            right: pxToRem(profilePanel.dmStatusDotOffset),
          }}
        >
          {/*
            Renk tek taşıyıcı değil (kural 6): noktanın görsel katmanı gizli,
            metin karşılığı `sr-only` satırda. Durum pill'i aynı cümleyi görsel
            olarak da yazıyor, ama pill kişinin kendi durum metnini taşıdığında
            presence adı onun içinde kaybolabilir — nokta kendi adını taşımalı.
          */}
          <span
            aria-hidden="true"
            className="block rounded-full"
            data-testid="profile-panel-presence-dot"
            style={{
              background: presenceColor(profile.presence),
              border: `${pxToRem(profilePanel.dmStatusDotBorderWidth)} solid hsl(var(--surface-secondary))`,
              height: pxToRem(profilePanel.dmStatusDotSize),
              width: pxToRem(profilePanel.dmStatusDotSize),
            }}
          />
          <span className="sr-only" data-testid="profile-panel-presence-label">
            {t("messages.profile.a11y.presence", { status: presenceLabel })}
          </span>
        </span>
      </div>

      <div className="min-w-0 text-center">
        <IdentityName>{profile.name}</IdentityName>
        <div
          className="min-w-0 truncate text-[hsl(var(--text-muted))]"
          data-testid="profile-panel-handle"
          style={{
            fontSize: pxToRem(profilePanel.handleFontSize),
            fontWeight: 500,
            lineHeight: 1,
            marginTop: pxToRem(profilePanel.handleMarginTop),
          }}
        >
          @{profile.handle}
        </div>
      </div>

      <div
        className="flex max-w-full items-center rounded-full"
        data-testid="profile-panel-status-pill"
        style={{
          background: presenceColor(profile.presence, PILL_SURFACE_ALPHA),
          color: presenceColor(profile.presence),
          fontSize: pxToRem(profilePanel.statusPillFontSize),
          fontWeight: 600,
          gap: pxToRem(profilePanel.statusPillGap),
          lineHeight: 1,
          padding: `${pxToRem(profilePanel.statusPillPaddingY)} ${pxToRem(profilePanel.statusPillPaddingX)}`,
        }}
      >
        <span
          aria-hidden="true"
          className="shrink-0 rounded-full"
          style={{
            background: "currentColor",
            height: pxToRem(profilePanel.statusPillDotSize),
            width: pxToRem(profilePanel.statusPillDotSize),
          }}
        />
        <span className="min-w-0 truncate">{statusLine}</span>
      </div>

      <ActionRow>
        <IdentityPrimaryAction
          icon={MessageSquare}
          label={t("messages.profile.action.message")}
          onClick={onSendMessage}
          testId="profile-panel-send-message"
        />
        <IdentityIconAction
          hoverClassName="hover:bg-[hsl(var(--success)/0.14)] hover:text-[hsl(var(--success))]"
          icon={Phone}
          label={t("messages.profile.action.voiceCall")}
          onClick={onStartVoiceCall}
          testId="profile-panel-voice-call"
        />
        <IdentityIconAction
          hoverClassName="hover:bg-[hsl(var(--primary)/0.14)] hover:text-[var(--primary-readable)]"
          icon={Video}
          label={t("messages.profile.action.videoCall")}
          onClick={onStartVideoCall}
          testId="profile-panel-video-call"
        />
      </ActionRow>
    </IdentityShell>
  );
}

function GroupIdentity({
  onAddMembers,
  onOpenSettings,
  onToggleMute,
  profile,
}: Extract<ProfilePanelIdentityProps, { variant: "group" }>) {
  const { t } = useI18n();
  const isAdmin = isProfileAdminRole(profile.viewerRole);
  const tileBackground = getGroupSwatchBackground(profile.avatarColor);
  const tileInk = getGroupSwatchInk(profile.avatarColor);

  return (
    <IdentityShell>
      <div
        aria-hidden="true"
        className={cn("grid place-items-center", DISPLAY_FONT, tileInk ? undefined : "text-white")}
        data-testid="profile-panel-tile"
        style={{
          background: tileBackground,
          /*
            Gölge karonun **kendi** rengini alır. Tasarımda `--primary` yazıyor
            çünkü örnek grup primary swatch'ında; sabitlenseydi turuncu bir grubun
            altında mor bir hâle kalırdı.
          */
          boxShadow: `0 ${pxToRem(MESSAGES_METRICS.shadow.profileGroupTile.offsetY)} ${pxToRem(MESSAGES_METRICS.shadow.profileGroupTile.blur)} ${pxToRem(MESSAGES_METRICS.shadow.profileGroupTile.spread)} ${tileBackground}`,
          borderRadius: pxToRem(profilePanel.groupTileRadius),
          ...(tileInk ? { color: tileInk } : {}),
          fontSize: pxToRem(profilePanel.groupTileFontSize),
          fontWeight: 600,
          height: pxToRem(profilePanel.groupTileSize),
          lineHeight: 1,
          width: pxToRem(profilePanel.groupTileSize),
        }}
      >
        {profile.initials}
      </div>

      <div className="min-w-0 text-center">
        <IdentityName>{profile.name}</IdentityName>
        <div
          className="flex items-center justify-center text-[hsl(var(--text-muted))]"
          data-testid="profile-panel-meta"
          style={{
            fontSize: pxToRem(profilePanel.handleFontSize),
            fontWeight: 500,
            gap: pxToRem(profilePanel.groupMetaGap),
            lineHeight: 1,
            marginTop: pxToRem(profilePanel.handleMarginTop),
          }}
        >
          <span>{t("messages.conversation.memberCount", { count: profile.memberCount })}</span>
          <span
            aria-hidden="true"
            className="shrink-0 rounded-full bg-[hsl(var(--text-muted))]"
            style={{
              height: pxToRem(profilePanel.groupMetaDotSize),
              width: pxToRem(profilePanel.groupMetaDotSize),
            }}
          />
          <span className="text-[hsl(var(--success))]">
            {t("messages.conversation.onlineCount", { count: profile.onlineCount })}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "flex items-center rounded-full",
          isAdmin
            ? "bg-[hsl(var(--primary)/0.14)] text-[var(--primary-readable)]"
            : "bg-[hsl(var(--surface-soft))] text-[hsl(var(--text-secondary))]",
        )}
        data-testid="profile-panel-role-pill"
        style={{
          fontSize: pxToRem(profilePanel.statusPillFontSize),
          fontWeight: 600,
          gap: pxToRem(profilePanel.statusPillGap),
          lineHeight: 1,
          padding: `${pxToRem(profilePanel.statusPillPaddingY)} ${pxToRem(profilePanel.statusPillPaddingX)}`,
        }}
      >
        {/* İkon satırın kendi boyutunda: §8.2.3 ikonu metinle birlikte büyütür. */}
        <Crown aria-hidden="true" style={{ height: "1em", width: "1em" }} />
        {t(isAdmin ? "messages.profile.role.admin" : "messages.profile.role.member")}
      </div>

      <ActionRow>
        <IdentityPrimaryAction
          icon={UserPlus}
          label={t("messages.profile.action.addMember")}
          onClick={onAddMembers}
          testId="profile-panel-add-members"
        />
        <IdentityIconAction
          hoverClassName="hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]"
          icon={BellOff}
          label={t(
            profile.muted ? "messages.profile.action.unmute" : "messages.profile.action.mute",
          )}
          onClick={onToggleMute}
          testId="profile-panel-mute"
        />
        <IdentityIconAction
          hoverClassName="hover:bg-[hsl(var(--surface-soft))] hover:text-[hsl(var(--foreground))]"
          icon={Settings}
          label={t("messages.profile.action.groupSettings")}
          onClick={onOpenSettings}
          testId="profile-panel-group-settings"
        />
      </ActionRow>
    </IdentityShell>
  );
}

export function ProfilePanelIdentity(props: ProfilePanelIdentityProps) {
  return props.variant === "dm" ? <DmIdentity {...props} /> : <GroupIdentity {...props} />;
}
