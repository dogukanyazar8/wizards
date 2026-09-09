"use client";

import React from "react";

import { useI18n } from "@/components/providers/locale-provider";
import { DiscoveryTagPicker } from "@/components/servers/shared/discovery-tag-picker";
import { SettingsToggleRow } from "@/components/shell/server-settings/settings-primitives";
import type { ServerSettingsSectionProps } from "@/components/shell/server-settings/section-props";
import { SERVER_METRICS, pxToRem } from "@/lib/servers/metrics";
import { canListInDiscovery } from "@/lib/servers/server-settings-model";

/**
 * SPEC-SUNUCU §8.2 — `Görünürlük ve Keşfet`.
 *
 * Üç satır ve bir kart. Üçüncü satır (`Keşfet'te listele`) 00 §6'nın kuralını taşır:
 * herkese açık olmayan sunucuda **açılamaz**, ve `Herkese açık` kapatıldığında kendiliğinden
 * kapanır. Kural bileşende değil `applyServerVisibilityPatch`'te; buradaki tek iş kapalı
 * anahtarın **nedenini** yazmak (00 §8: `aria-disabled` + görünür sebep, `disabled` değil).
 *
 * Topluluk sunucusunda görünürlük yönetim ekibinindir; iki anahtar da aynı mekanizmayla
 * kapalı gelir ve nedeni yazılır. Alan gövdeye hiç konmaz (`stripAdminOwnedFields`).
 */

const HOME_PATH = "M3 9.6 12 3l9 6.6V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z";
const GLOBE_PATH =
  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18";
const COMPASS_PATH = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm3.5-12.5-2 5.5-5.5 2 2-5.5z";

const { settingsSections } = SERVER_METRICS;

export function VisibilitySection({ detail, draft, patch }: ServerSettingsSectionProps) {
  const { t } = useI18n();
  const isCommunity = detail.server.type === "COMMUNITY";
  const canDiscover = canListInDiscovery(draft);
  const communityReason = t("server.settings.visibility.communityLocked");

  return (
    <div data-testid="server-settings-visibility">
      <div className="flex flex-col" style={{ gap: pxToRem(settingsSections.visibilityRowsGap) }}>
        <SettingsToggleRow
          chip={t("server.settings.visibility.typeChip")}
          description={t("server.settings.visibility.typeDescription")}
          iconPath={HOME_PATH}
          testId="server-settings-server-type-row"
          title={t("server.settings.visibility.typeTitle", {
            type: t(`server.settings.visibility.type.${detail.server.type}`),
          })}
          tone="primary"
        />

        <SettingsToggleRow
          checked={draft.isPublic}
          description={t("server.settings.visibility.publicDescription")}
          disabled={isCommunity}
          iconPath={GLOBE_PATH}
          onChange={(checked) => patch({ isPublic: checked })}
          testId="server-settings-is-public-toggle"
          title={t("server.settings.visibility.publicTitle")}
          tone="success"
        />

        <SettingsToggleRow
          checked={draft.discoverable}
          description={
            isCommunity
              ? communityReason
              : canDiscover
                ? t("server.settings.visibility.discoverableDescription")
                : t("server.settings.visibility.discoverableRequiresPublic")
          }
          disabled={isCommunity || !canDiscover}
          iconPath={COMPASS_PATH}
          onChange={(checked) => patch({ discoverable: checked })}
          testId="server-settings-discoverable-toggle"
          title={t("server.settings.visibility.discoverableTitle")}
          tone="primary"
        />
      </div>

      {isCommunity ? (
        <p
          className="text-pretty text-[hsl(var(--text-muted))]"
          data-testid="server-settings-visibility-community-notice"
          style={{
            fontSize: pxToRem(settingsSections.visibilityDescriptionFontSize),
            lineHeight: settingsSections.visibilityDescriptionLineHeight,
            marginTop: pxToRem(settingsSections.visibilityRowsGap),
          }}
        >
          {communityReason}
        </p>
      ) : null}

      <div style={{ marginTop: pxToRem(settingsSections.discoveryCardMarginTop) }}>
        <DiscoveryTagPicker
          onChange={(tags) => patch({ tags })}
          tags={draft.tags}
          testId="server-settings-discovery-tags"
          variant="settings"
        />
      </div>
    </div>
  );
}

export default VisibilitySection;
