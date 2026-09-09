"use client";

import React, { useMemo } from "react";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { useDesktopSettings } from "@/components/settings/sections/desktop/desktop-settings-context";
import { Avatar } from "@/components/ui/avatar";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";

/**
 * Katkıda bulunanlar (`o6`) — SPEC §5.6, rol pilleriyle.
 *
 * Adlar `Contributor` tablosundan geliyor (`getSettingsBootstrapPayload`). **Rol bilgisi tabloda
 * yok**: satır `userId` taşıyor ama bir rol kolonu yok, o yüzden roller türetilir —
 * `developerName` geliştirici, `FEATURED_CONTRIBUTOR_NAME` öne çıkan katkıcı, kalan herkes
 * katkıcı.
 *
 * TODO(api): `Contributor` tablosuna rol kolonu eklendiğinde `resolveContributorRole` silinir ve
 * rol veriden okunur. Türetme bir yer tutucu değil — bugünkü panel de aynı üç rolü aynı iki
 * kaynaktan çıkarıyor — ama veriden gelen bir rol, adı değişen bir katkıcıyı takip edebilir.
 */

const { contributors } = SETTINGS_METRICS.blocks;

export type ContributorRole = "developer" | "featured" | "contributor";

export function resolveContributorRole(
  name: string,
  developerName: string | null,
  featuredContributor: string | null,
): ContributorRole {
  if (developerName && name === developerName) {
    return "developer";
  }

  if (featuredContributor && name === featuredContributor) {
    return "featured";
  }

  return "contributor";
}

const ROLE_LABEL_KEYS: Readonly<Record<ContributorRole, string>> = {
  contributor: "settings.block.contributors.role.contributor",
  developer: "settings.block.contributors.role.developer",
  featured: "settings.block.contributors.role.featured",
};

export function ContributorsBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  const desktop = useDesktopSettings();

  const developerName = desktop.buildInfo?.developerName ?? null;

  /**
   * Geliştirici listenin **başında** durur.
   *
   * `Contributor` tablosu yalnız katkıcıları taşıyor; geliştirici adı `buildInfo.developerName`
   * ile ayrı geliyordu ve hiçbir yerde çizilmiyordu. Sonuç iki kat yanlıştı: tasarımın ilk
   * satırı (`Doğukan Yazar · Geliştirici`) eksikti ve `resolveContributorRole`'ün `developer`
   * dalı hiç çalışmayan ölü koddu.
   *
   * Tabloya bir gün geliştirici satırı da eklenirse iki kez çizilmesin diye ad zaten listedeyse
   * eklenmiyor.
   */
  const names = useMemo(() => {
    const rows = desktop.buildInfo?.contributors ?? [];

    if (!developerName || rows.includes(developerName)) {
      return rows;
    }

    return [developerName, ...rows];
  }, [desktop.buildInfo?.contributors, developerName]);

  if (names.length === 0) {
    return (
      <div
        className="text-[hsl(var(--text-muted))]"
        data-block="contributors"
        data-testid={`settings-block-${rowDef.key}`}
        style={{
          fontSize: pxToRem(contributors.nameFontSize),
          padding: `${pxToRem(contributors.rowPaddingY)} ${pxToRem(contributors.rowPaddingX)}`,
        }}
      >
        {t("settings.block.contributors.empty")}
      </div>
    );
  }

  return (
    <div data-block="contributors" data-testid={`settings-block-${rowDef.key}`} role="list">
      {names.map((name, index) => {
        const role = resolveContributorRole(name, developerName, desktop.featuredContributor);

        return (
          <div
            className="flex items-center"
            data-contributor-role={role}
            key={name}
            role="listitem"
            style={{
              ...(index > 0
                ? {
                    borderTop: `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`,
                  }
                : {}),
              gap: pxToRem(contributors.rowGap),
              padding: `${pxToRem(contributors.rowPaddingY)} ${pxToRem(contributors.rowPaddingX)}`,
            }}
          >
            <Avatar
              alt={name}
              fallback={name}
              style={{
                height: pxToRem(contributors.avatarSize),
                width: pxToRem(contributors.avatarSize),
              }}
            />
            <span
              className="min-w-0 flex-1 truncate text-[hsl(var(--foreground))]"
              style={{
                fontSize: pxToRem(contributors.nameFontSize),
                fontWeight: contributors.nameWeight,
                lineHeight: 1.2,
              }}
            >
              {name}
            </span>
            <span
              className="flex-none rounded-full text-[hsl(var(--text-muted))]"
              style={{
                background: "hsl(var(--surface-soft))",
                fontSize: pxToRem(contributors.roleFontSize),
                fontWeight: contributors.roleWeight,
                lineHeight: 1,
                padding: `${pxToRem(contributors.rolePaddingY)} ${pxToRem(contributors.rolePaddingX)}`,
              }}
            >
              {t(ROLE_LABEL_KEYS[role])}
            </span>
          </div>
        );
      })}
    </div>
  );
}
