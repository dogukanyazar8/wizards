"use client";

import React, { useCallback, useEffect, useId, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, ChevronRight } from "lucide-react";
import Link from "next/link";

import { useI18n } from "@/components/providers/locale-provider";
import { WindowCloseButton } from "@/components/ui/window-close-button";
import { refreshNotificationPermission } from "@/components/settings/sections/notifications/notification-permission";
import {
  openDesktopSystemSettings,
  readDesktopPermission,
  requestDesktopPermission,
} from "@/lib/desktop/permissions";
import { isCustomLevel } from "@/lib/notifications/prefs-policy";
import type { NotifPanelSaveState } from "@/lib/notifications/panel-state";
import { buildSettingsHref } from "@/lib/settings/navigation";
import { SETTINGS_METRICS, hairline, pxToRem } from "@/lib/settings/metrics";
import {
  fetchNotificationPrefs,
  notificationPrefsQueryKeys,
  patchNotificationPrefs,
} from "@/lib/settings/notification-prefs-client";
import type { NotifLevel, NotificationPrefsPatch } from "@wizards/types";

/**
 * Bildirim ayarları penceresi (560 px) — SPEC §2, Ş11 §B.
 *
 * Pencerenin yazdığı her tercih Ayarlar penceresindeki satırın **aynısıdır** (00 tuzak #4):
 * aynı uç, aynı önbellek anahtarı, aynı `NotificationPrefs` nesnesi. Üç hızlı tercih ve üç
 * düzey kartı için ikinci bir durum tutulsaydı, iki yüzey açıkken son yazan kazanır ve
 * kullanıcı hangi ekrana bakarsa ona inanırdı.
 *
 * Düzey kartları Ayarlar › Bildirimler › Genel'deki menüyle **aynı** `level` anahtarını yazar
 * (sapma #6). İki etiket kümesi tasarımın kendi metinleridir ve ikisi de birebir korunur.
 *
 * Kayıt göstergesi **gerçek yanıt** üzerine kurulur; referanstaki 850 ms sabit gecikme taklit
 * edilmez (00 tuzak #14).
 *
 * Örtü kartın **kardeşidir** (00 tuzak #11): kartın içine tıklamak kapatmaz.
 */

const { prefsDialog } = SETTINGS_METRICS;
const { body, footer, header, levelCard, permissionStrip, quickPref } = prefsDialog;
const { motion } = SETTINGS_METRICS;

const VIEWPORT_PADDING = 40;

// Ş13 — on ölçü/opaklık sözlüğe taşındı (`SETTINGS_METRICS.prefsDialog`); burada yalnız
// okunuyor. Ş11 bunları bileşende sabit bırakmıştı çünkü sözlüğün sahibi başka bir şeritti.

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const LEVELS = [
  { key: "all", recommended: false },
  { key: "important", recommended: true },
  { key: "off", recommended: false },
] as const satisfies readonly { key: NotifLevel; recommended: boolean }[];

const SAVE_TONE: Readonly<Record<Exclude<NotifPanelSaveState, "idle">, string>> = {
  error: "--danger",
  saved: "--success",
  saving: "--text-muted",
};

const SAVE_LABEL_KEY: Readonly<Record<Exclude<NotifPanelSaveState, "idle">, string>> = {
  error: "settings.saveFailed",
  saved: "settings.saved",
  saving: "settings.saving",
};

/**
 * Alt şeridin ve `Saatleri düzenle` düğmesinin hedefleri. İkisi de gerçek bağlantı: Ayarlar
 * penceresi bir **rotadır** (K2) ve uygulama içinden açılınca kesen modal olarak geliyor.
 * `router.push` çağıran bir düğme aynı yere giderdi ama yeni sekmede açılamaz, adresi
 * kopyalanamazdı.
 */
export const SURFACES_HREF = buildSettingsHref("notifications", "surfaces");
export const QUIET_HOURS_HREF = buildSettingsHref("notifications", "quiet-hours");

/** İzin sorgusunun kendi anahtarı; Ayarlar penceresinin `na5` satırıyla aynı tarayıcı durumu. */
export const notificationPermissionQueryKey = ["notifications", "permission"] as const;

export type NotificationPrefsDialogProps = {
  readonly onClose: () => void;
  readonly onSaveState: (state: NotifPanelSaveState) => void;
  readonly saveState: NotifPanelSaveState;
};

export function NotificationPrefsDialog({
  onClose,
  onSaveState,
  saveState,
}: NotificationPrefsDialogProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const leadId = useId();

  const prefsQuery = useQuery({
    queryFn: fetchNotificationPrefs,
    queryKey: notificationPrefsQueryKeys.root,
    staleTime: 30_000,
  });

  /**
   * İzin **tarayıcının cevabıdır**, bir tercih değil: sunucu `permission` alanını her zaman
   * `unknown` gönderiyor (Ş1). `navigator.permissions` varsa oradan, yoksa
   * `Notification.permission`'dan okunur — sabit değer yok.
   */
  const permissionQuery = useQuery({
    queryFn: () => readDesktopPermission("notifications"),
    queryKey: notificationPermissionQueryKey,
    staleTime: 30_000,
  });

  const prefs = prefsQuery.data;
  const permission = permissionQuery.data;

  const patchMutation = useMutation({
    mutationFn: (patch: NotificationPrefsPatch) => patchNotificationPrefs(patch),
    onError: () => onSaveState("error"),
    onMutate: () => onSaveState("saving"),
    onSuccess: (next) => {
      // Yanıt **bütün** nesnedir, yama değil: beş tercih iki sekmede birden görünüyor, o yüzden
      // önbellek girişi birleştirilmez, değiştirilir.
      queryClient.setQueryData(notificationPrefsQueryKeys.root, next);
      onSaveState("saved");
    },
  });

  const patch = useCallback(
    (next: NotificationPrefsPatch) => {
      patchMutation.mutate(next);
    },
    [patchMutation],
  );

  const requestPermission = useCallback(async () => {
    const next = await requestDesktopPermission("notifications");
    queryClient.setQueryData(notificationPermissionQueryKey, next);
    // Ayarlar penceresinin `na5` satırı kendi kutusundan okuyor; aynı tarayıcı durumu iki
    // yerde ayrı ayrı önbelleklendiği için ikisi de uyarılır.
    refreshNotificationPermission();
  }, [queryClient]);

  const openSystemSettings = useCallback(async () => {
    await openDesktopSystemSettings("notifications");
    queryClient.setQueryData(
      notificationPermissionQueryKey,
      await readDesktopPermission("notifications"),
    );
    refreshNotificationPermission();
  }, [queryClient]);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const card = cardRef.current;
    card?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !card) return;

      const focusable = card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);

      if (focusable.length === 0) {
        event.preventDefault();
        card.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    window.addEventListener("keydown", handleTab);

    return () => {
      window.removeEventListener("keydown", handleTab);
      returnFocusRef.current?.focus();
    };
  }, []);

  const level = prefs?.level;

  const handleLevelKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : null;

    if (direction === null || !level) return;

    event.preventDefault();
    const index = LEVELS.findIndex((entry) => entry.key === level);
    const next = LEVELS[(index + direction + LEVELS.length) % LEVELS.length];

    if (next) {
      patch({ level: next.key });
    }
  };

  return (
    <div className="fixed inset-0 z-[85]" data-testid="notification-prefs-overlay">
      {/* Örtü kartın **kardeşidir** (00 tuzak #11): ayrı bir katman, kartın atası değil. */}
      <button
        aria-label={t("notif.prefs.close")}
        className="absolute inset-0 cursor-default"
        data-testid="notification-prefs-backdrop"
        onClick={onClose}
        style={{ background: "hsl(var(--backdrop) / 0.62)" }}
        type="button"
      />
      <div
        className="absolute inset-0 grid place-items-center"
        style={{ padding: pxToRem(VIEWPORT_PADDING), pointerEvents: "none" }}
      >
        <div
          aria-describedby={leadId}
          aria-labelledby={titleId}
          aria-modal="true"
          className="flex max-h-full flex-col overflow-hidden border border-solid border-[hsl(var(--border))] bg-[hsl(var(--surface-card))]"
          data-testid="notification-prefs-dialog"
          ref={cardRef}
          role="dialog"
          style={{
            borderRadius: pxToRem(prefsDialog.radius),
            borderWidth: hairline(),
            boxShadow: `${pxToRem(prefsDialog.shadow.x)} ${pxToRem(
              prefsDialog.shadow.y,
            )} ${pxToRem(prefsDialog.shadow.blur)} ${pxToRem(
              prefsDialog.shadow.spread,
            )} hsl(var(--shadow-color))`,
            pointerEvents: "auto",
            width: `min(${pxToRem(prefsDialog.width)}, 100%)`,
          }}
        >
          <div
            className="flex shrink-0 items-start border-b border-solid"
            style={{
              borderBottomColor: `hsl(var(--border) / ${header.borderBottomAlpha})`,
              borderBottomWidth: hairline(),
              gap: pxToRem(header.gap),
              padding: `${pxToRem(header.paddingTop)} ${pxToRem(header.paddingX)} ${pxToRem(
                header.paddingBottom,
              )}`,
            }}
          >
            <span
              aria-hidden="true"
              className="grid shrink-0 place-items-center text-[hsl(var(--primary))]"
              style={{
                background: `hsl(var(--primary) / ${header.bellSurfaceAlpha})`,
                borderRadius: pxToRem(header.bellRadius),
                height: pxToRem(header.bellBox),
                width: pxToRem(header.bellBox),
              }}
            >
              <Bell
                style={{
                  height: pxToRem(header.bellIconSize),
                  width: pxToRem(header.bellIconSize),
                }}
              />
            </span>
            <div className="min-w-0 flex-1">
              <h2
                className="font-display text-[hsl(var(--foreground))]"
                id={titleId}
                style={{
                  fontSize: pxToRem(header.titleFontSize),
                  fontWeight: header.titleWeight,
                }}
              >
                {t("notif.prefs.title")}
              </h2>
              <p
                className="text-pretty text-[hsl(var(--text-muted))]"
                id={leadId}
                style={{
                  fontSize: pxToRem(header.leadFontSize),
                  lineHeight: header.leadLineHeight,
                  marginTop: pxToRem(header.leadMarginTop),
                }}
              >
                {t("notif.prefs.lead")}
              </p>
            </div>
            <WindowCloseButton
              aria-label={t("notif.prefs.close")}
              data-testid="notification-prefs-close"
              onClick={onClose}
              style={{
                transitionDuration: `${motion.transitionSeconds}s`,
              }}
            />
          </div>

          <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto"
            style={{
              gap: pxToRem(body.gap),
              padding: `${pxToRem(body.paddingTop)} ${pxToRem(body.paddingX)} ${pxToRem(
                body.paddingBottom,
              )}`,
            }}
          >
            {/* İzin verilmişse şerit **hiç render edilmez**; yükleme sırasında da çizilmez —
                bir tur sonra kaybolacak bir uyarı, olmayan bir sorunu haber vermektir. */}
            {permission && permission !== "granted" ? (
              <div
                className="flex border border-solid"
                data-testid="notification-prefs-permission"
                style={{
                  background: `hsl(var(--warning) / ${permissionStrip.surfaceAlpha})`,
                  borderColor: `hsl(var(--warning) / ${permissionStrip.borderAlpha})`,
                  borderRadius: pxToRem(permissionStrip.radius),
                  borderWidth: hairline(),
                  gap: pxToRem(permissionStrip.gap),
                  padding: `${pxToRem(permissionStrip.paddingY)} ${pxToRem(
                    permissionStrip.paddingX,
                  )}`,
                }}
              >
                <span
                  aria-hidden="true"
                  className="grid shrink-0 place-items-center text-[hsl(var(--warning))]"
                  style={{
                    background: `hsl(var(--warning) / ${permissionStrip.iconSurfaceAlpha})`,
                    borderRadius: pxToRem(permissionStrip.iconRadius),
                    height: pxToRem(permissionStrip.iconBox),
                    width: pxToRem(permissionStrip.iconBox),
                  }}
                >
                  <AlertTriangle
                    style={{
                      height: pxToRem(permissionStrip.iconSize),
                      width: pxToRem(permissionStrip.iconSize),
                    }}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center" style={{ gap: pxToRem(body.titlePillGap) }}>
                    <span
                      className="text-[hsl(var(--foreground))]"
                      style={{
                        fontSize: pxToRem(permissionStrip.titleFontSize),
                        fontWeight: header.titleWeight,
                      }}
                    >
                      {t("notif.prefs.permission.title")}
                    </span>
                    <span
                      className="rounded-full text-[hsl(var(--warning))]"
                      style={{
                        background: `hsl(var(--warning) / ${permissionStrip.pillSurfaceAlpha})`,
                        fontSize: pxToRem(permissionStrip.pillFontSize),
                        fontWeight: header.titleWeight,
                        padding: `${pxToRem(permissionStrip.pillPaddingY)} ${pxToRem(
                          permissionStrip.pillPaddingX,
                        )}`,
                      }}
                    >
                      {t("notif.prefs.permission.denied")}
                    </span>
                  </div>
                  <p
                    className="text-pretty text-[hsl(var(--text-muted))]"
                    style={{
                      fontSize: pxToRem(permissionStrip.bodyFontSize),
                      lineHeight: permissionStrip.bodyLineHeight,
                      marginTop: pxToRem(permissionStrip.bodyMarginTop),
                    }}
                  >
                    {t("notif.prefs.permission.body")}
                  </p>
                  <div
                    className="flex"
                    style={{
                      gap: pxToRem(permissionStrip.buttonGap),
                      marginTop: pxToRem(permissionStrip.buttonRowMarginTop),
                    }}
                  >
                    <button
                      className="bg-[hsl(var(--primary))] transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      data-testid="notification-prefs-permission-request"
                      onClick={() => void requestPermission()}
                      style={{
                        borderRadius: pxToRem(permissionStrip.buttonRadius),
                        color: "#fff",
                        fontSize: pxToRem(permissionStrip.buttonFontSize),
                        fontWeight: header.titleWeight,
                        height: pxToRem(permissionStrip.buttonHeight),
                        padding: `0 ${pxToRem(permissionStrip.buttonPaddingX)}`,
                      }}
                      type="button"
                    >
                      {t("notif.prefs.permission.request")}
                    </button>
                    <button
                      className="border border-solid text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      data-testid="notification-prefs-permission-open-system"
                      onClick={() => void openSystemSettings()}
                      style={{
                        borderColor: `hsl(var(--border) / ${footer.outlineBorderAlpha})`,
                        borderRadius: pxToRem(permissionStrip.buttonRadius),
                        borderWidth: hairline(),
                        fontSize: pxToRem(permissionStrip.buttonFontSize),
                        fontWeight: header.titleWeight,
                        height: pxToRem(permissionStrip.buttonHeight),
                        padding: `0 ${pxToRem(permissionStrip.buttonPaddingX)}`,
                      }}
                      type="button"
                    >
                      {t("notif.prefs.permission.openSystem")}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            <section data-testid="notification-prefs-level">
              <SectionLabel
                label={t("notif.prefs.level")}
                pill={prefs && isCustomLevel(prefs) ? t("notif.prefs.level.custom") : null}
                pillTestId="notification-prefs-custom"
              />
              <div
                aria-label={t("notif.prefs.level")}
                className="flex flex-col"
                onKeyDown={handleLevelKeyDown}
                role="radiogroup"
                style={{ gap: pxToRem(levelCard.gap) }}
              >
                {LEVELS.map((entry) => {
                  const selected = level === entry.key;

                  return (
                    <button
                      aria-checked={selected}
                      className="flex items-start border border-solid text-left transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
                      data-testid={`notification-prefs-level-${entry.key}`}
                      key={entry.key}
                      onClick={() => patch({ level: entry.key })}
                      role="radio"
                      style={{
                        background: selected
                          ? `hsl(var(--primary) / ${levelCard.selectedSurfaceAlpha})`
                          : `hsl(var(--surface-soft) / ${levelCard.idleSurfaceAlpha})`,
                        borderColor: selected
                          ? `hsl(var(--primary) / ${levelCard.selectedBorderAlpha})`
                          : "transparent",
                        borderRadius: pxToRem(levelCard.radius),
                        borderWidth: hairline(),
                        gap: pxToRem(levelCard.innerGap),
                        padding: `${pxToRem(levelCard.paddingY)} ${pxToRem(levelCard.paddingX)}`,
                        transitionDuration: `${motion.transitionSeconds}s`,
                      }}
                      tabIndex={selected || (!level && entry.key === "all") ? 0 : -1}
                      type="button"
                    >
                      <span
                        aria-hidden="true"
                        className="grid shrink-0 place-items-center rounded-full border-solid"
                        style={{
                          borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--border))",
                          borderWidth: pxToRem(levelCard.radioBorderWidth),
                          height: pxToRem(levelCard.radioSize),
                          marginTop: pxToRem(levelCard.radioMarginTop),
                          width: pxToRem(levelCard.radioSize),
                        }}
                      >
                        <span
                          className="rounded-full"
                          style={{
                            background: selected ? "hsl(var(--primary))" : "transparent",
                            height: pxToRem(levelCard.radioDotSize),
                            width: pxToRem(levelCard.radioDotSize),
                          }}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className="flex items-center"
                          style={{ gap: pxToRem(body.titlePillGap) }}
                        >
                          <span
                            className="text-[hsl(var(--foreground))]"
                            style={{
                              fontSize: pxToRem(levelCard.titleFontSize),
                              fontWeight: header.titleWeight,
                            }}
                          >
                            {t(`notif.prefs.level.${entry.key}`)}
                          </span>
                          {entry.recommended ? (
                            <span
                              className="rounded-full text-[hsl(var(--success))]"
                              data-testid="notification-prefs-recommended"
                              style={{
                                background: `hsl(var(--success) / ${body.pillSurfaceAlpha})`,
                                fontSize: pxToRem(levelCard.pillFontSize),
                                fontWeight: header.titleWeight,
                                padding: `${pxToRem(levelCard.pillPaddingY)} ${pxToRem(
                                  levelCard.pillPaddingX,
                                )}`,
                              }}
                            >
                              {t("notif.prefs.recommended")}
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="block text-pretty text-[hsl(var(--text-muted))]"
                          style={{
                            fontSize: pxToRem(levelCard.subFontSize),
                            lineHeight: levelCard.subLineHeight,
                            marginTop: pxToRem(levelCard.subMarginTop),
                          }}
                        >
                          {t(`notif.prefs.level.${entry.key}.body`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section data-testid="notification-prefs-quick">
              <SectionLabel label={t("notif.prefs.quick")} pill={null} />
              <div className="flex flex-col" style={{ gap: pxToRem(quickPref.gap) }}>
                <QuickPrefRow
                  checked={prefs?.sounds.notification.enabled ?? false}
                  disabled={!prefs}
                  body={t("notif.prefs.quick.sound.body")}
                  onChange={(next) => patch({ sounds: { notification: { enabled: next } } })}
                  testId="notification-prefs-quick-sound"
                  title={t("notif.prefs.quick.sound")}
                />
                <QuickPrefRow
                  checked={prefs?.systemPreview ?? false}
                  disabled={!prefs}
                  body={t("notif.prefs.quick.preview.body")}
                  onChange={(next) => patch({ systemPreview: next })}
                  testId="notification-prefs-quick-preview"
                  title={t("notif.prefs.quick.preview")}
                />
                <QuickPrefRow
                  actionHref={QUIET_HOURS_HREF}
                  actionLabel={t("notif.prefs.quick.quietHours.action")}
                  checked={prefs?.quietHours.enabled ?? false}
                  disabled={!prefs}
                  body={t("notif.prefs.quick.quietHours.body", {
                    end: prefs?.quietHours.end ?? "",
                    start: prefs?.quietHours.start ?? "",
                  })}
                  onAction={onClose}
                  onChange={(next) => patch({ quietHours: { enabled: next } })}
                  testId="notification-prefs-quick-quiet-hours"
                  title={t("notif.prefs.quick.quietHours")}
                />
              </div>
            </section>
          </div>

          <div
            className="flex shrink-0 items-center border-t border-solid"
            style={{
              borderTopColor: `hsl(var(--border) / ${footer.borderTopAlpha})`,
              borderTopWidth: hairline(),
              gap: pxToRem(footer.gap),
              padding: `${pxToRem(footer.paddingY)} ${pxToRem(footer.paddingX)}`,
            }}
          >
            <Link
              className="inline-flex items-center whitespace-nowrap text-[var(--primary-readable)] transition-opacity hover:opacity-80 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="notification-prefs-open-all"
              href={SURFACES_HREF}
              onClick={onClose}
              style={{
                fontSize: pxToRem(footer.linkFontSize),
                fontWeight: header.titleWeight,
                gap: pxToRem(footer.linkGap),
              }}
            >
              {t("notif.prefs.openAll")}
              <ChevronRight
                aria-hidden="true"
                style={{
                  height: pxToRem(footer.linkIconSize),
                  width: pxToRem(footer.linkIconSize),
                }}
              />
            </Link>

            <div
              aria-live="polite"
              className="ml-auto whitespace-nowrap"
              data-save-state={saveState}
              data-testid="notification-prefs-save"
              style={{
                color: saveState === "idle" ? undefined : `hsl(var(${SAVE_TONE[saveState]}))`,
                fontSize: pxToRem(footer.saveFontSize),
                fontWeight: footer.saveWeight,
              }}
            >
              {saveState === "idle" ? "" : t(SAVE_LABEL_KEY[saveState])}
            </div>

            <button
              className="bg-[hsl(var(--primary))] transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
              data-testid="notification-prefs-done"
              onClick={onClose}
              style={{
                borderRadius: pxToRem(footer.doneRadius),
                color: "#fff",
                fontSize: pxToRem(footer.doneFontSize),
                fontWeight: header.titleWeight,
                height: pxToRem(footer.doneHeight),
                padding: `0 ${pxToRem(footer.donePaddingX)}`,
              }}
              type="button"
            >
              {t("notif.prefs.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({
  label,
  pill,
  pillTestId,
}: {
  readonly label: string;
  readonly pill: string | null;
  readonly pillTestId?: string;
}) {
  return (
    <div
      className="flex items-center"
      style={{
        gap: pxToRem(body.sectionLabelGap),
        paddingBottom: pxToRem(body.sectionLabelPaddingBottom),
      }}
    >
      <span
        className="font-display uppercase text-[hsl(var(--text-muted))]"
        style={{
          fontSize: pxToRem(body.sectionLabelFontSize),
          fontWeight: body.sectionLabelWeight,
          letterSpacing: `${body.sectionLabelTracking}em`,
        }}
      >
        {label}
      </span>
      {pill ? (
        <span
          className="rounded-full text-[hsl(var(--primary))]"
          data-testid={pillTestId}
          style={{
            background: `hsl(var(--primary) / ${body.pillSurfaceAlpha})`,
            fontSize: pxToRem(levelCard.pillFontSize),
            fontWeight: body.sectionLabelWeight,
            padding: `${pxToRem(levelCard.pillPaddingY)} ${pxToRem(levelCard.pillPaddingX)}`,
          }}
        >
          {pill}
        </span>
      ) : null}
      <span
        aria-hidden="true"
        className="flex-1"
        style={{
          background: `hsl(var(--border) / ${body.sectionRuleAlpha})`,
          height: hairline(),
        }}
      />
    </div>
  );
}

/**
 * Hızlı tercih satırı — 40×23 anahtar.
 *
 * `components/settings/rows/setting-toggle.tsx` yeniden kullanılmadı: o satır Ayarlar
 * penceresinin 38×22 anahtarını çiziyor ve dışarıdan geometri kabul etmiyor. Anlam katmanı
 * aynı: `role="switch"` + `aria-checked`, gerçek `<button>`.
 */
function QuickPrefRow({
  actionHref,
  actionLabel,
  body: bodyText,
  checked,
  disabled,
  onAction,
  onChange,
  testId,
  title,
}: {
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly body: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onAction?: () => void;
  readonly onChange: (checked: boolean) => void;
  readonly testId: string;
  readonly title: string;
}) {
  const titleId = useId();

  return (
    <div
      className="flex items-center"
      data-testid={testId}
      style={{
        background: `hsl(var(--surface-soft) / ${quickPref.surfaceAlpha})`,
        borderRadius: pxToRem(quickPref.radius),
        gap: pxToRem(quickPref.innerGap),
        padding: `${pxToRem(quickPref.paddingY)} ${pxToRem(quickPref.paddingX)}`,
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className="text-[hsl(var(--foreground))]"
          id={titleId}
          style={{
            fontSize: pxToRem(quickPref.titleFontSize),
            fontWeight: header.titleWeight,
            lineHeight: quickPref.titleLineHeight,
          }}
        >
          {title}
        </div>
        <div
          className="text-pretty text-[hsl(var(--text-muted))]"
          style={{
            fontSize: pxToRem(quickPref.subFontSize),
            lineHeight: quickPref.subLineHeight,
            marginTop: pxToRem(quickPref.subMarginTop),
          }}
        >
          {bodyText}
        </div>
      </div>

      {actionHref && actionLabel ? (
        <Link
          className="inline-flex shrink-0 items-center whitespace-nowrap border border-solid bg-[hsl(var(--surface-card))] text-[hsl(var(--text-secondary))] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
          data-testid={`${testId}-action`}
          href={actionHref}
          style={{
            borderColor: `hsl(var(--border) / ${footer.outlineBorderAlpha})`,
            borderRadius: pxToRem(quickPref.actionRadius),
            borderWidth: hairline(),
            fontSize: pxToRem(quickPref.actionFontSize),
            fontWeight: header.titleWeight,
            height: pxToRem(quickPref.actionHeight),
            padding: `0 ${pxToRem(quickPref.actionPaddingX)}`,
          }}
          {...(onAction ? { onClick: onAction } : {})}
        >
          {actionLabel}
        </Link>
      ) : null}

      <button
        aria-checked={checked}
        aria-labelledby={titleId}
        className="relative shrink-0 rounded-full transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-45"
        data-testid={`${testId}-switch`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        role="switch"
        style={{
          background: checked ? "hsl(var(--primary))" : "hsl(var(--surface-tertiary))",
          height: pxToRem(quickPref.switchHeight),
          transitionDuration: `${motion.switchSeconds}s`,
          width: pxToRem(quickPref.switchWidth),
        }}
        type="button"
      >
        <span
          aria-hidden="true"
          className="absolute rounded-full bg-white motion-safe:transition-[left]"
          style={{
            boxShadow: "0 1px 3px hsl(var(--shadow-color) / 0.4)",
            height: pxToRem(quickPref.switchKnob),
            left: pxToRem(
              checked
                ? quickPref.switchWidth - quickPref.switchKnob - quickPref.switchKnobInset
                : quickPref.switchKnobInset,
            ),
            top: pxToRem(quickPref.switchKnobInset),
            transitionDuration: `${motion.switchSeconds}s`,
            width: pxToRem(quickPref.switchKnob),
          }}
        />
      </button>
    </div>
  );
}
