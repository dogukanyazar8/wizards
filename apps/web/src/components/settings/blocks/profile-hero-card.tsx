"use client";

import React, { useState } from "react";
import { Camera, X } from "lucide-react";

import { useI18n } from "@/components/providers/locale-provider";
import { UserProfilePopover } from "@/components/shared/user-profile-popover";
import { ProfileBannerField } from "@/components/settings/profile-banner-field";
import { ProfileAvatarField } from "@/components/settings/profile-avatar-field";
import { useAccountSurface } from "@/components/settings/sections/account/account-context";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { findSettingsTab } from "@/lib/settings/tree";
import { useSettingValue } from "@/lib/settings/use-setting-value";

/**
 * Profil hero kartı (`hero`) — SPEC-AYARLAR §5.1, Ş7 §1.
 *
 * **Kart canlıdır.** Ad, kullanıcı adı, durum, özel durum, emoji ve süre satır motorunun
 * *taslak* değerinden okunur (`useSettingValue`), sunucu yanıtından değil: kirli profil alanları
 * kaydet şeridini bekliyor ve kullanıcının yazdığı adı ancak kaydettikten sonra görmesi,
 * "kaydetmeden önce nasıl görünecek" sorusunu cevapsız bırakırdı.
 *
 * **`Kırp / Yakınlaştır / Sıfırla` dizisi burada yok** (PROMPT §5). Kırpma dosya seçildikten
 * sonraki ayrı adımda, korunan `ProfileAvatarField`'in kendi penceresinde yapılır.
 */

const { hero } = SETTINGS_METRICS.blocks;

/**
 * `pp` seçeneklerinin **token adları** — renk değil (00 §6).
 *
 * Sıra `settings.option.pp.1…4` sırasıdır: Çevrimiçi · Boşta · Rahatsız Etmeyin · Görünmez.
 * Motor aynı listeyi menü noktası için taşıyor; hero pili aynı kaynağa bakmak zorunda, yoksa
 * menüdeki nokta ile pildeki nokta ayrı renklere ayrışır.
 */
const PRESENCE_TONE_TOKENS = ["--success", "--warning", "--danger", "--text-muted"] as const;

function optionLabels(rowKey: string): readonly string[] {
  const tab = findSettingsTab("account", "profile");

  for (const group of tab?.groups ?? []) {
    for (const row of group.rows) {
      if (row.key === rowKey) {
        return row.options ?? [];
      }
    }
  }

  return [];
}

export function ProfileHeroCard({ data, row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const surface = useAccountSurface();
  const [photoOpen, setPhotoOpen] = useState(false);

  const displayName = useSettingValue<string>("pn").value;
  const username = useSettingValue<string>("pu").value;
  const presence = useSettingValue<number>("pp").value;
  const customStatus = useSettingValue<string>("ps").value;
  const emoji = useSettingValue<string>("pe").value;
  const expiry = useSettingValue<number>("px").value;

  const clearCustomStatus = useSettingValue<string>("ps").setValue;
  const clearEmoji = useSettingValue<string>("pe").setValue;
  const clearExpiry = useSettingValue<number>("px").setValue;

  const toneToken = PRESENCE_TONE_TOKENS[presence] ?? "--text-muted";
  const presenceLabelKey = optionLabels("pp")[presence];
  const expiryLabelKey = optionLabels("px")[expiry];

  const name = displayName || data.displayName || "";
  const handle = username || data.username || "";

  const viewProfileControl = (
    <span
      className="flex items-center whitespace-nowrap focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      style={{
        background: "hsl(var(--surface-base))",
        border: `${hairline()} solid hsl(var(--border) / 0.75)`,
        borderRadius: pxToRem(hero.viewProfileRadius),
        color: "hsl(var(--text-secondary))",
        fontSize: pxToRem(hero.viewProfileFontSize),
        fontWeight: 600,
        height: pxToRem(hero.viewProfileHeight),
        lineHeight: 1,
        padding: `0 ${pxToRem(hero.viewProfilePaddingX)}`,
      }}
    >
      {t("settings.block.hero.viewProfile")}
    </span>
  );

  return (
    <div
      // The group owns the border; match its inner clipping radius without adding a second frame.
      className="overflow-hidden rounded-[inherit] bg-[hsl(var(--surface-card))]"
      data-block="hero"
      data-testid={`settings-block-${rowDef.key}`}
    >
      <ProfileBannerField
        key={surface.account?.id ?? "anonymous"}
        accountId={surface.account?.id}
        uploadthingEnabled={surface.uploadthingEnabled}
      />
      <div
        data-testid="settings-hero-avatar-row"
        style={{
          marginTop: pxToRem(hero.avatarRowMarginTop),
          padding: `0 ${pxToRem(hero.avatarRowPaddingX)}`,
        }}
      >
        <div className="relative w-fit shrink-0" data-testid="settings-hero-avatar-anchor">
          <span
            className="inline-flex rounded-full"
            style={{
              boxShadow: `0 0 0 ${pxToRem(hero.avatarRing)} hsl(var(--surface-card)), ${pxToRem(
                hero.avatarShadow.x,
              )} ${pxToRem(hero.avatarShadow.y)} ${pxToRem(hero.avatarShadow.blur)} ${pxToRem(
                hero.avatarShadow.spread,
              )} hsl(var(--shadow-color))`,
            }}
          >
            <Avatar
              className="bg-[hsl(var(--surface-soft))]"
              alt={name}
              fallback={name || handle}
              src={data.avatarUrl || null}
              style={{ height: pxToRem(hero.avatarSize), width: pxToRem(hero.avatarSize) }}
            />
          </span>
          {/* Durum noktası renk **ve** metin taşır: pil aynı durumu yazıyor (00 §6). */}
          <span
            aria-hidden="true"
            className="absolute rounded-full"
            data-testid="settings-hero-status-dot"
            style={{
              background: `hsl(var(${toneToken}))`,
              border: `${pxToRem(hero.statusDotRing)} solid hsl(var(--surface-card))`,
              bottom: pxToRem(hero.statusDotOffset),
              height: pxToRem(hero.statusDotSize),
              right: pxToRem(hero.statusDotOffset),
              width: pxToRem(hero.statusDotSize),
            }}
          />
          <button
            aria-label={t("settings.block.hero.changePhoto")}
            className="absolute grid place-items-center rounded-full disabled:cursor-not-allowed disabled:opacity-55"
            data-testid="settings-hero-change-photo"
            disabled={!surface.account}
            onClick={() => setPhotoOpen(true)}
            style={{
              background: "hsl(var(--primary))",
              border: `${pxToRem(hero.cameraButtonRing)} solid hsl(var(--surface-card))`,
              bottom: pxToRem(-2),
              boxShadow: `0 ${pxToRem(4)} ${pxToRem(12)} ${pxToRem(-4)} hsl(var(--primary))`,
              color: "#fff",
              height: pxToRem(hero.cameraButtonSize),
              left: pxToRem(-2),
              width: pxToRem(hero.cameraButtonSize),
            }}
            title={t("settings.block.hero.changePhoto")}
            type="button"
          >
            <Camera aria-hidden="true" style={{ height: pxToRem(13), width: pxToRem(13) }} />
          </button>
        </div>
      </div>

      <div
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        style={{ padding: `0 ${pxToRem(hero.avatarRowPaddingX)}` }}
      >
        <div className="min-w-0 flex-1" style={{ paddingBottom: pxToRem(8) }}>
          <div
            className="truncate"
            data-testid="settings-hero-name"
            style={{
              color: "hsl(var(--foreground))",
              fontFamily: "var(--font-display)",
              fontSize: pxToRem(hero.nameFontSize),
              fontWeight: hero.nameWeight,
              lineHeight: 1.2,
            }}
          >
            {name}
          </div>
          <div
            className="flex min-w-0 flex-wrap items-center"
            style={{ gap: pxToRem(hero.handleGap), marginTop: pxToRem(hero.handleMarginTop) }}
          >
            <span
              className="shrink-0"
              data-testid="settings-hero-handle"
              style={{
                color: "hsl(var(--text-secondary))",
                fontSize: pxToRem(hero.handleFontSize),
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {`@${handle}`}
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{
                background: "hsl(var(--border))",
                height: pxToRem(hero.handleSeparatorSize),
                width: pxToRem(hero.handleSeparatorSize),
              }}
            />
            <span
              className="min-w-0 break-all"
              style={{
                color: "hsl(var(--text-muted))",
                fontSize: pxToRem(hero.handleFontSize),
                fontWeight: 500,
                lineHeight: 1.2,
              }}
            >
              {data.email ?? ""}
            </span>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center"
          style={{ gap: pxToRem(7), paddingBottom: pxToRem(8) }}
        >
          <span
            className="flex items-center whitespace-nowrap rounded-full"
            data-testid="settings-hero-presence"
            style={{
              background: `hsl(var(${toneToken}) / ${hero.statusPillSurfaceAlpha})`,
              color: `hsl(var(${toneToken}))`,
              fontSize: pxToRem(hero.statusPillFontSize),
              fontWeight: 600,
              gap: pxToRem(6),
              lineHeight: 1,
              padding: `${pxToRem(hero.statusPillPaddingY)} ${pxToRem(hero.statusPillPaddingX)}`,
            }}
          >
            <span
              aria-hidden="true"
              className="rounded-full"
              style={{
                background: `hsl(var(${toneToken}))`,
                height: pxToRem(hero.statusPillDotSize),
                width: pxToRem(hero.statusPillDotSize),
              }}
            />
            {presenceLabelKey ? t(presenceLabelKey) : ""}
          </span>
          {surface.account ? (
            <UserProfilePopover
              currentUserId={surface.account.id}
              testId="settings-hero-view-profile"
              userId={surface.account.id}
            >
              {viewProfileControl}
            </UserProfilePopover>
          ) : (
            <span aria-disabled="true" data-testid="settings-hero-view-profile">
              {viewProfileControl}
            </span>
          )}
        </div>
      </div>

      {customStatus ? (
        <div
          className="flex items-center"
          data-testid="settings-hero-custom-status"
          style={{
            background: "hsl(var(--surface-soft)/.6)",
            border: `${hairline()} solid hsl(var(--border) / 0.5)`,
            borderRadius: pxToRem(12),
            gap: pxToRem(10),
            margin: `${pxToRem(14)} ${pxToRem(18)} ${pxToRem(16)}`,
            padding: `${pxToRem(10)} ${pxToRem(13)}`,
          }}
        >
          <span aria-hidden="true" className="shrink-0" style={{ fontSize: pxToRem(15) }}>
            {emoji || ""}
          </span>
          <span
            className="min-w-0 flex-1 truncate"
            style={{
              color: "hsl(var(--text-secondary))",
              fontSize: pxToRem(12),
              fontWeight: 500,
              lineHeight: 1.35,
            }}
          >
            {customStatus}
          </span>
          <span
            className="shrink-0 whitespace-nowrap rounded-full"
            style={{
              background: "hsl(var(--surface-card))",
              color: "hsl(var(--text-muted))",
              fontSize: pxToRem(10),
              fontWeight: 600,
              lineHeight: 1.4,
              padding: `${pxToRem(3)} ${pxToRem(8)}`,
            }}
          >
            {expiryLabelKey ? t(expiryLabelKey) : ""}
          </span>
          <button
            aria-label={t("settings.block.hero.clearStatus")}
            className="grid shrink-0 place-items-center transition-[filter] hover:brightness-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            data-testid="settings-hero-clear-status"
            onClick={() => {
              clearCustomStatus("");
              clearEmoji("");
              clearExpiry(3);
            }}
            style={{
              background: "hsl(var(--primary))",
              border: 0,
              borderRadius: pxToRem(7),
              color: "#fff",
              height: pxToRem(24),
              width: pxToRem(24),
            }}
            title={t("settings.block.hero.clearStatus")}
            type="button"
          >
            <X aria-hidden="true" style={{ height: pxToRem(12), width: pxToRem(12) }} />
          </button>
        </div>
      ) : null}

      {surface.account ? (
        <Modal
          overlayClassName="z-[110]"
          onClose={() => setPhotoOpen(false)}
          open={photoOpen}
          title={t("settings.block.hero.changePhoto")}
        >
          <ProfileAvatarField
            account={surface.account}
            onAvatarUpdated={(next) => {
              surface.onAccountUpdated(next);
              setPhotoOpen(false);
            }}
            uploadthingEnabled={surface.uploadthingEnabled}
          />
        </Modal>
      ) : null}
    </div>
  );
}
