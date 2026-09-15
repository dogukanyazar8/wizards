"use client";

import React, { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MobileReleaseSummary } from "@wizards/types";
import { useI18n } from "@/components/providers/locale-provider";
import { SettingActionButton, SettingActions } from "@/components/settings/rows/setting-actions";
import { SettingsGroup } from "@/components/settings/rows/settings-group";
import { SettingsRow } from "@/components/settings/rows/settings-row";
import { WHISPR_VERSION_NUMBER } from "@/lib/app-version";
import { releaseDetailOptions, releaseListOptions } from "@/lib/releases/release-query";
import { useDesktopSettings } from "./desktop-settings-context";

export function ReleaseNotesRow({
  divider = false,
  disabled = false,
}: {
  divider?: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const detailsId = React.useId();
  const { appInfo } = useDesktopSettings();
  const installed = appInfo?.appVersion ?? WHISPR_VERSION_NUMBER;
  return (
    <SettingsRow
      rowKey="o5"
      divider={divider}
      title={t("settings.row.o5.title")}
      description={t("settings.row.o5.description")}
      control={(ids) => (
        <SettingActionButton
          testId="setting-nav-o5"
          expanded={open}
          controlsId={detailsId}
          describedById={ids.describedById}
          entry={{
            label: t(open ? "settings.releases.hide" : "settings.action.o5.1"),
            disabled,
            onClick: () => setOpen(!open),
          }}
        />
      )}
      below={
        open ? (
          <div id={detailsId} className="mt-4 min-w-0 border-t border-[hsl(var(--border))] pt-4">
            <ReleaseNotesContent installed={installed} />
          </div>
        ) : undefined
      }
    />
  );
}

export function ReleaseNotesContent({ installed }: { installed: string }) {
  const { t } = useI18n();
  const client = useQueryClient();
  const query = useInfiniteQuery(releaseListOptions(installed));
  const releases = query.data?.pages.flatMap((page) => page.releases) ?? [];
  return (
    <div className="space-y-4" data-testid="release-notes-content" aria-busy={query.isFetching}>
      <SettingActions
        actions={[
          {
            label: t(query.isFetching ? "settings.releases.loading" : "settings.releases.refresh"),
            disabled: query.isFetching,
            onClick: () => {
              void client.invalidateQueries({ queryKey: ["release-notes"] });
            },
          },
        ]}
      />
      {query.isPending && (
        <p role="status" className="text-sm text-[hsl(var(--text-muted))]">
          {t("settings.releases.loading")}
        </p>
      )}
      {query.isError && (
        <div role="alert" className="space-y-3 text-sm text-[hsl(var(--text-secondary))]">
          <p>{t("settings.releases.error")}</p>
          <SettingActions
            actions={[
              {
                label: t("settings.releases.retry"),
                disabled: query.isFetching,
                onClick: () => {
                  void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch());
                },
              },
            ]}
          />
        </div>
      )}
      {query.isSuccess && releases.length === 0 && (
        <p role="status" className="text-sm text-[hsl(var(--text-muted))]">
          {t("settings.releases.empty")}
        </p>
      )}
      <div className="space-y-4">
        {releases.map((release) => (
          <ReleaseNotesEntry key={release.version} release={release} installed={installed} />
        ))}
      </div>
      {query.hasNextPage && (
        <SettingActions
          actions={[
            {
              label: t(
                query.isFetchingNextPage ? "settings.releases.loading" : "settings.releases.more",
              ),
              disabled: query.isFetching,
              onClick: () => {
                void query.fetchNextPage();
              },
            },
          ]}
        />
      )}
    </div>
  );
}

export function ReleaseNotesEntry({
  release,
  installed,
}: {
  release: MobileReleaseSummary;
  installed: string;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    ...releaseDetailOptions(release.version, installed),
    enabled: expanded,
  });
  const detailsId = React.useId();
  return (
    <SettingsGroup>
      <SettingsRow
        rowKey={`release-${release.version}`}
        title={`${release.version}${release.codename ? ` “${release.codename}”` : ""}`}
        description={new Date(release.releasedAt).toLocaleDateString(locale)}
        badge={release.version === installed ? t("settings.releases.installed") : undefined}
        control={() => (
          <SettingActions
            actions={[
              {
                label: t(expanded ? "settings.releases.hide" : "settings.releases.details"),
                controlsId: detailsId,
                expanded,
                onClick: () => setExpanded(!expanded),
              },
            ]}
          />
        )}
        below={
          expanded ? (
            <div
              id={detailsId}
              className="mt-4 space-y-3 text-xs leading-relaxed [overflow-wrap:anywhere]"
              aria-busy={query.isFetching}
            >
              {query.isPending && <p role="status">{t("settings.releases.loading")}</p>}
              {query.isError && (
                <div role="alert" className="space-y-2">
                  <p>{t("settings.releases.error")}</p>
                  <SettingActions
                    actions={[
                      {
                        label: t("settings.releases.retry"),
                        disabled: query.isFetching,
                        onClick: () => {
                          void query.refetch();
                        },
                      },
                    ]}
                  />
                </div>
              )}
              {query.data?.summary && (
                <p className="whitespace-pre-wrap text-[hsl(var(--text-secondary))]">
                  {query.data.summary}
                </p>
              )}
              {query.data?.changes.map((change, index) => (
                <article
                  key={`${change.type}-${index}`}
                  className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--surface-base))] p-3"
                >
                  <span className="text-xs font-semibold text-[hsl(var(--primary))]">
                    {t(`settings.releases.${change.type}`)}
                  </span>
                  <h3 className="mt-1 font-semibold">{change.title}</h3>
                  {change.detail && (
                    <p className="mt-1 whitespace-pre-wrap text-[hsl(var(--text-muted))]">
                      {change.detail}
                    </p>
                  )}
                </article>
              ))}
              {query.isSuccess && query.data.changes.length === 0 && !query.data.summary && (
                <p role="status">{t("settings.releases.noDetails")}</p>
              )}
            </div>
          ) : undefined
        }
      />
    </SettingsGroup>
  );
}
