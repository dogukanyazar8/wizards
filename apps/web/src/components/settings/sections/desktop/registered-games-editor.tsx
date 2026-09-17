"use client";

import React, { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gamepad2 } from "lucide-react";
import { useI18n } from "@/components/providers/locale-provider";
import { Modal } from "@/components/ui/modal";
import { RiskyField } from "@/components/settings/risky/risky-field";
import { SettingActions } from "@/components/settings/rows/setting-actions";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  nativeSettingsClient,
  type NativeApplicationSettings,
} from "@/lib/desktop/settings-client";
import { useNativeDesktopSettings } from "./native-settings-context";

type RegisteredGame = NonNullable<NativeApplicationSettings["registeredGames"]>[number];
const { row, controls, riskyBlock } = SETTINGS_METRICS;

function RegisteredGameRow({
  game,
  busy,
  save,
  remove,
}: {
  game: RegisteredGame;
  busy: boolean;
  save: (label: string) => void;
  remove: () => void;
}) {
  const { t } = useI18n();
  const [label, setLabel] = useState(game.label);
  const changed = label.trim() !== game.label;
  return (
    <form
      className="flex min-w-0 flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && changed && label.trim()) save(label.trim());
      }}
    >
      <div className="min-w-0 flex-1 basis-48">
        <RiskyField
          label={t("voice.goLive.registered.label")}
          value={label}
          onChange={setLabel}
          maxLength={64}
          disabled={busy}
          testId={`registered-game-${game.id}`}
          span="full"
        />
      </div>
      <SettingActions
        actions={[
          ...(changed
            ? [
                {
                  label: t("common.save"),
                  disabled: busy || !label.trim(),
                  onClick: () => save(label.trim()),
                },
              ]
            : []),
          {
            label: t("voice.goLive.registered.remove"),
            kind: "danger",
            disabled: busy,
            onClick: remove,
          },
        ]}
      />
    </form>
  );
}

export function RegisteredGamesEditor() {
  const state = useNativeDesktopSettings();
  const { t } = useI18n();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const applications = useQuery({
    queryKey: ["settings", "desktop", "running-applications"],
    queryFn: () => nativeSettingsClient.runningApplications(),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const application = state?.data?.application;
  if (!state || !application) return null;
  const games = application.registeredGames ?? [];
  const canAdd = application.gameDetectionEnabled && games.length < 64 && !state.busy;
  const save = (registeredGames: RegisteredGame[]) =>
    state.run(async () => {
      await state.update({
        application: await nativeSettingsClient.application({ ...application, registeredGames }),
      });
    });
  const available = (applications.data ?? []).filter(
    (app) => !games.some((game) => game.executable.toLowerCase() === app.executable.toLowerCase()),
  );
  return (
    <section
      aria-labelledby={titleId}
      className="mt-3 min-w-0 space-y-4"
      data-testid="registered-games"
      style={{
        fontFamily: "inherit",
        padding: pxToRem(16),
        border: `${hairline()} solid hsl(var(--border) / 0.75)`,
        borderRadius: pxToRem(riskyBlock.fieldRadius),
        background: "hsl(var(--surface-soft) / 0.45)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4
          id={titleId}
          style={{
            fontSize: pxToRem(row.titleFontSize),
            fontWeight: row.titleWeight,
            color: "hsl(var(--foreground))",
          }}
        >
          {t("voice.goLive.registered.title")}
        </h4>
        <SettingActions
          actions={[
            {
              label: t("voice.goLive.registered.add"),
              disabled: !canAdd,
              onClick: () => setOpen(true),
            },
          ]}
        />
      </div>
      {games.length === 0 && (
        <p style={{ fontSize: pxToRem(row.subFontSize), color: "hsl(var(--text-muted))" }}>
          {t("voice.goLive.registered.empty")}
        </p>
      )}
      {games.map((game) => (
        <RegisteredGameRow
          key={`${game.id}:${game.label}`}
          game={game}
          busy={state.busy}
          save={(label) =>
            void save(games.map((entry) => (entry.id === game.id ? { ...entry, label } : entry)))
          }
          remove={() => void save(games.filter((entry) => entry.id !== game.id))}
        />
      ))}
      <Modal
        open={open}
        onClose={() => {
          if (!state.busy) setOpen(false);
        }}
        title={t("voice.goLive.registered.add")}
        description={t("voice.goLive.registered.choose")}
        closeLabel={t("common.close")}
        overlayClassName="z-[110]"
        className="max-w-md"
        style={{
          fontFamily: "inherit",
          background: "hsl(var(--surface-base))",
          borderRadius: pxToRem(SETTINGS_METRICS.window.radius),
        }}
      >
        <div
          className="space-y-3 p-5"
          style={{ fontSize: pxToRem(row.subFontSize), color: "hsl(var(--text-muted))" }}
        >
          {applications.isPending ? (
            <p role="status">{t("settings.control.block.loading")}</p>
          ) : applications.isError ? (
            <p role="alert">{t("voice.goLive.registered.loadError")}</p>
          ) : available.length === 0 ? (
            <p>{t("voice.goLive.registered.noApplications")}</p>
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {available.map((app) => (
                <button
                  key={app.executable}
                  type="button"
                  disabled={!canAdd}
                  className="flex w-full items-center gap-3 text-left transition-colors enabled:hover:bg-[hsl(var(--primary)/.08)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-55"
                  style={{
                    padding: pxToRem(12),
                    border: `${hairline()} solid hsl(var(--border) / 0.75)`,
                    borderRadius: pxToRem(controls.input.radius),
                    color: "hsl(var(--foreground))",
                    fontSize: pxToRem(row.titleFontSize),
                    fontWeight: row.titleWeight,
                  }}
                  onClick={() => {
                    if (canAdd)
                      void save([
                        ...games,
                        { id: "", executable: app.executable, label: app.displayName.slice(0, 64) },
                      ]).then((saved) => {
                        if (saved) setOpen(false);
                      });
                  }}
                >
                  <Gamepad2
                    aria-hidden="true"
                    size={18}
                    className="shrink-0 text-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0 break-words">{app.displayName}</span>
                </button>
              ))}
            </div>
          )}
          {state.failed && <p role="alert">{t("settings.native.error")}</p>}
          <SettingActions
            actions={[
              {
                label: t(
                  applications.isError
                    ? "settings.account.banner.retry"
                    : "voice.goLive.registered.refresh",
                ),
                disabled: state.busy,
                onClick: () => {
                  if (!applications.isFetching) void applications.refetch();
                },
              },
            ]}
          />
        </div>
      </Modal>
    </section>
  );
}
