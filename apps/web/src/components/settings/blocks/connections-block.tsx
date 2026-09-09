"use client";

import React, { useEffect, useState } from "react";
import type { AccountConnection, AccountConnectionService } from "@wizards/types";

import { useI18n } from "@/components/providers/locale-provider";
import type { SettingsBlockProps } from "@/components/settings/rows/setting-custom-block";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import { STATIC_CONNECTIONS, fetchConnections } from "@/lib/settings/security-client";

/**
 * Bağlı hesaplar (`cn`) — SPEC-AYARLAR §5.1, K5.
 *
 * Dört satır da **çizilir** ve dördünün düğmesi de `disabled`: GitHub / Spotify / Steam / Xbox
 * OAuth uygulamaları kurulmadı, `available: false` geliyor. Satırı hiç çizmemek "böyle bir
 * özellik yok" derdi; düğmeyi çalışır çizmek ise olmayan bir uca tıklatırdı.
 *
 * **Uydurma endpoint çağrılmaz:** veri `security-client.ts`'in tipli adapterinden gelir
 * (`TODO(api)` notu orada duruyor), bu dosya hiçbir adres bilmez.
 */

const { connections } = SETTINGS_METRICS.blocks;

/** Servis kimliği → ikon rozeti. Ton **token adıdır**, renk değil (00 §6). */
const SERVICE_PRESENTATION: Readonly<
  Record<AccountConnectionService, { glyph: string; token: string }>
> = {
  github: { glyph: "GH", token: "--primary" },
  google: { glyph: "GG", token: "--text-muted" },
  spotify: { glyph: "SP", token: "--success" },
  steam: { glyph: "ST", token: "--warning" },
  xbox: { glyph: "XB", token: "--info" },
};

const SERVICE_LABEL_KEY: Readonly<Record<AccountConnectionService, string>> = {
  github: "settings.block.connections.service.github",
  google: "settings.block.connections.service.google",
  spotify: "settings.block.connections.service.spotify",
  steam: "settings.block.connections.service.steam",
  xbox: "settings.block.connections.service.xbox",
};

export function ConnectionsBlock({ row: rowDef }: SettingsBlockProps) {
  const { t } = useI18n();
  // Adapter senkron bir tabloyu döndürüyor; ilk kare boş çizilirse dört satır bir tur sonra
  // belirir ve grup yüksekliği zıplar. Efekt yine de adapterden okur: gerçek uç geldiğinde
  // değişecek tek yer orası.
  const [rows, setRows] = useState<readonly AccountConnection[]>(STATIC_CONNECTIONS);

  useEffect(() => {
    let active = true;

    void fetchConnections().then((next) => {
      if (active) setRows(next);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div data-block="connections" data-testid={`settings-block-${rowDef.key}`}>
      {rows.map((connection, index) => {
        const presentation = SERVICE_PRESENTATION[connection.service];
        const label = t(SERVICE_LABEL_KEY[connection.service]);
        const detailId = `settings-connection-${connection.service}-detail`;

        return (
          <div
            className="flex items-center"
            data-testid={`settings-connection-${connection.service}`}
            key={connection.service}
            style={{
              borderTop: index
                ? `${hairline()} solid hsl(var(--border) / ${SETTINGS_METRICS.row.dividerAlpha})`
                : undefined,
              gap: pxToRem(connections.rowGap),
              padding: `${pxToRem(connections.rowPaddingY)} ${pxToRem(connections.rowPaddingX)}`,
            }}
          >
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center"
              style={{
                background:
                  presentation.token === "--text-muted"
                    ? "hsl(var(--surface-soft))"
                    : `hsl(var(${presentation.token}) / 0.14)`,
                borderRadius: pxToRem(connections.iconRadius),
                color: `hsl(var(${presentation.token}))`,
                fontFamily: "var(--font-display)",
                fontSize: pxToRem(11),
                fontWeight: 600,
                height: pxToRem(connections.iconSize),
                lineHeight: 1,
                width: pxToRem(connections.iconSize),
              }}
            >
              {presentation.glyph}
            </span>
            <span className="block min-w-0 flex-1">
              <span
                className="block"
                style={{
                  color: "hsl(var(--foreground))",
                  fontSize: pxToRem(12.5),
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {label}
              </span>
              <span
                className="block truncate"
                id={detailId}
                style={{
                  color: "hsl(var(--text-muted))",
                  fontSize: pxToRem(11),
                  lineHeight: 1.4,
                  marginTop: pxToRem(4),
                }}
              >
                {connection.connected && connection.handle
                  ? connection.handle
                  : connection.available
                    ? t("settings.block.connections.none")
                    : t("settings.block.connections.unavailable")}
              </span>
            </span>
            <button
              aria-describedby={detailId}
              className="shrink-0 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-55"
              data-testid={`settings-connection-${connection.service}-action`}
              // K5 — dördü de `available: false`. Uydurma endpoint çağrısı yok: bu düğmenin
              // `onClick`'i **yok**, çünkü çağıracağı bir uç yok.
              disabled={!connection.available}
              style={{
                background: connection.connected
                  ? "hsl(var(--surface-base))"
                  : "hsl(var(--primary))",
                border: connection.connected
                  ? `${hairline()} solid hsl(var(--border) / 0.75)`
                  : "0",
                borderRadius: pxToRem(10),
                color: connection.connected ? "hsl(var(--text-secondary))" : "#fff",
                fontSize: pxToRem(11.5),
                fontWeight: 600,
                height: pxToRem(30),
                lineHeight: 1,
                padding: `0 ${pxToRem(12)}`,
              }}
              type="button"
            >
              {connection.connected
                ? t("settings.block.connections.remove")
                : t("settings.block.connections.connect")}
            </button>
          </div>
        );
      })}
    </div>
  );
}
