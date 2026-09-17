"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVoiceStore } from "@/store/voice-store";
import { masterOutputGain } from "@/lib/voice/output-volume";
import { SettingsDataBoundary } from "@/components/settings/settings-data-boundary";

import { useI18n } from "@/components/providers/locale-provider";
import {
  useReportSettingsStore,
  useSettingsSaveReporter,
  useSettingsLadderOverrides,
} from "@/components/settings/settings-ladder";
import {
  resolveSoundSource,
  settingsSoundPreview,
} from "@/components/settings/notifications/sound-preview";
import type {
  NotificationException,
  NotificationExceptionLevel,
} from "@/lib/notifications/exceptions-service";
import {
  fetchNotificationExceptions,
  notificationExceptionQueryKeys,
  removeException,
  updateException,
} from "@/lib/settings/exceptions-client";
import { buildSettingsHref, type SettingsTab } from "@/lib/settings/navigation";
import { NOTIFICATION_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import {
  fetchNotificationPrefs,
  notificationPrefsQueryKeys,
  patchNotificationPrefs,
} from "@/lib/settings/notification-prefs-client";
import {
  SETTINGS_SOUND_PROFILE_SUFFIX,
  SETTINGS_SOUND_VOLUME_SUFFIX,
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
} from "@/lib/settings/use-setting-value";

import {
  buildSoundResetPatch,
  buildValuesContext,
  toSettingsValues,
  summarizeNotificationPrefs,
  NotificationPrefsWriter,
} from "./notification-prefs-bridge";
import { notificationPermissionStore } from "./notification-permission";
import {
  NOTIFICATIONS_SECTION_FALLBACK,
  NotificationsSectionContext,
  type NotificationsExceptionsState,
  type NotificationsSectionValue,
} from "./notifications-section-context";
import { NOTIFICATION_ROW_DATA_FIELDS } from "./notifications-tab-defs";
import { NotificationsExceptionsTab } from "./exceptions-tab";
import { NotificationsGeneralTab } from "./general-tab";
import { NotificationsPanelTab } from "./panel-tab";
import { NotificationsQuietHoursTab } from "./quiet-hours-tab";
import { NotificationsSoundsTab } from "./sounds-tab";
import { NotificationsSurfacesTab } from "./surfaces-tab";
import { NotificationsTypesTab } from "./types-tab";

/**
 * Ayarlar paketi — Dalga 3 / Ş9. Bildirimler bölümünün kökü.
 *
 * Bölüm kendi değer kutusunu kurar ve `write`'ını kendisi verir (Ş6 §2.1: motor uç bilmez).
 * Yedi sekmenin **hepsi** aynı kutuyu okuduğu için paylaşılan beş anahtar (`nd2`, `na5`, `na6`,
 * `nq1`, `ns1`) ikinci bir yerel duruma hiç düşmez — birinde değişen değer diğerinde aynı anda
 * görünür (tuzak #4). `np4` bu listede yok ve panelin kendi tercihine yazar.
 *
 * Sunucu yanıtı **tam** nesnedir (`PATCH` da tam nesne döner) ve yanıt geldiğinde kutuya
 * `applyRemote` ile geri yazılır: uçuşta olan anahtarlar atlanır, kalanlar sunucunun bildiği
 * hâle döner. Böylece iki sekme arasında gezinen kullanıcı bir an bile eski değeri görmez.
 *
 * `permission` sunucudan **her zaman** `unknown` gelir (tarayıcının cevabı, saklanan bir kolon
 * değil); gerçek değeri burada okunur ve `na5` satırının pili ona göre düşer.
 */

const EXCEPTIONS_STALE_MS = 30_000;

/**
 * Sunucuda saklanması bir kontrolü işlevsel yapmaz. Bu satırların Web/Desktop consumer'ı veya
 * teslim kanalı yoktur; sessiz başarı yerine ortak motor tarafından kullanılamaz çizilirler.
 */
export { NOTIFICATION_UNAVAILABLE_ROWS } from "@/lib/settings/availability";

export type NotificationsSectionProps = {
  readonly tab: SettingsTab;
};

const TAB_COMPONENTS: Readonly<Partial<Record<SettingsTab, () => React.JSX.Element | null>>> = {
  exceptions: NotificationsExceptionsTab,
  general: NotificationsGeneralTab,
  panel: NotificationsPanelTab,
  "quiet-hours": NotificationsQuietHoursTab,
  sounds: NotificationsSoundsTab,
  surfaces: NotificationsSurfacesTab,
  types: NotificationsTypesTab,
};

export function NotificationsSection({ tab }: NotificationsSectionProps) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  const prefsQuery = useQuery({
    queryFn: fetchNotificationPrefs,
    queryKey: notificationPrefsQueryKeys.root,
    staleTime: EXCEPTIONS_STALE_MS,
  });

  const exceptionsQuery = useQuery({
    queryFn: fetchNotificationExceptions,
    queryKey: notificationExceptionQueryKeys.list,
    staleTime: EXCEPTIONS_STALE_MS,
  });

  const permission = useSyncExternalStore(
    notificationPermissionStore.subscribe,
    notificationPermissionStore.getSnapshot,
    notificationPermissionStore.getServerSnapshot,
  );

  const [pendingExceptionId, setPendingExceptionId] = useState<string | null>(null);

  /** Kutu ve taşıyıcı **bir kez** kuruluyor; taşıyıcı son saat/zaman dilimi listesini tutar. */
  const [{ store, writer }] = useState(() => {
    const prefsWriter = new NotificationPrefsWriter(patchNotificationPrefs, (next) => {
      queryClient.setQueryData(notificationPrefsQueryKeys.root, next);
    });

    const context = prefsQuery.data ? buildValuesContext(prefsQuery.data) : null;
    if (context) prefsWriter.setContext(context);
    return {
      store: new SettingsValueStore({
        values: prefsQuery.data && context ? toSettingsValues(prefsQuery.data, context) : {},
        write: prefsWriter.write,
      }),
      writer: prefsWriter,
    };
  });

  // F1 — kutunun durumu kabuğun başlığına buradan gider.
  useReportSettingsStore(store);
  const reportExceptionSave = useSettingsSaveReporter();
  const exceptionBusy = useRef(false);

  // Pencere kapanırken bekleyen yama gitmeli; 250 ms'lik birleştirme penceresinde kapatılan bir
  // ayar, kaydedilmiş görünüp kaydedilmemiş olurdu.
  useEffect(
    () => () => {
      store.flush();
      store.dispose();
    },
    [store],
  );

  const prefs = prefsQuery.data;

  useLayoutEffect(() => {
    if (!prefs) return;

    const context = buildValuesContext(prefs);
    writer.setContext(context);
    store.applyRemote(toSettingsValues(prefs, context));
  }, [prefs, store, writer]);

  const exceptionsList = exceptionsQuery.data ?? null;

  const exceptionsState: NotificationsExceptionsState = exceptionsQuery.isError
    ? "error"
    : exceptionsList
      ? "ready"
      : "loading";

  const refreshExceptions = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: notificationExceptionQueryKeys.list });
  }, [queryClient]);

  const runException = useCallback(
    (exception: NotificationException, action: () => Promise<void>) => {
      if (exceptionBusy.current) return;
      exceptionBusy.current = true;
      setPendingExceptionId(exception.id);
      reportExceptionSave("saving");

      void action()
        .then(() => reportExceptionSave("saved"))
        .catch(() => reportExceptionSave("error"))
        .finally(() => {
          exceptionBusy.current = false;
          setPendingExceptionId(null);
          void refreshExceptions();
        });
    },
    [refreshExceptions, reportExceptionSave],
  );

  const onEditException = useCallback(
    (exception: NotificationException, level: NotificationExceptionLevel) => {
      runException(exception, () => updateException(exception.scope, exception.scopeId, { level }));
    },
    [runException],
  );

  const onRemoveException = useCallback(
    (exception: NotificationException) => {
      runException(exception, () => removeException(exception.scope, exception.scopeId));
    },
    [runException],
  );

  const sectionValue = useMemo<NotificationsSectionValue>(() => {
    const context = prefs ? buildValuesContext(prefs) : null;

    return {
      derivation: {
        permission,
        quietHourOptions:
          context?.quietHourOptions ?? NOTIFICATIONS_SECTION_FALLBACK.derivation.quietHourOptions,
        quietTimeZoneOptions:
          context?.quietTimeZoneOptions ??
          NOTIFICATIONS_SECTION_FALLBACK.derivation.quietTimeZoneOptions,
      },
      exceptions: exceptionsList,
      exceptionsState,
      onEditException,
      onRemoveException,
      pendingExceptionId,
      summary: prefs
        ? summarizeNotificationPrefs(prefs, {
            count: exceptionsList?.items.length ?? 0,
            truncated: exceptionsList?.truncated ?? false,
          })
        : null,
    };
  }, [
    exceptionsList,
    exceptionsState,
    onEditException,
    onRemoveException,
    pendingExceptionId,
    permission,
    prefs,
  ]);

  const quietHours = prefs?.quietHours;

  const runtimeData = useMemo<Record<string, string>>(() => {
    if (!quietHours) return {};

    const values = { end: quietHours.end, start: quietHours.start };

    return {
      [NOTIFICATION_ROW_DATA_FIELDS.quietHoursRange]: t("notif.quietHours.range", values),
      [NOTIFICATION_ROW_DATA_FIELDS.quietHoursRangeSecure]: t(
        "notif.quietHours.rangeSecure",
        values,
      ),
    };
  }, [quietHours, t]);

  const onAction = useCallback(
    (rowKey: string) => {
      if (rowKey === "ns5") {
        for (const [key, value] of Object.entries(buildSoundResetPatch())) {
          store.setValue(key, value);
        }

        return;
      }
    },
    [store],
  );

  const onSoundPreview = useCallback(
    (rowKey: string) => {
      const profile = store.getValue(`${rowKey}${SETTINGS_SOUND_PROFILE_SUFFIX}`);
      const volume = store.getValue(`${rowKey}${SETTINGS_SOUND_VOLUME_SUFFIX}`);
      const source = resolveSoundSource(rowKey, profile === "classic" ? "classic" : "whispr");

      if (!source) return;

      settingsSoundPreview.play(
        source,
        (typeof volume === "number" ? volume : 0) *
          masterOutputGain(useVoiceStore.getState().masterOutputVolume),
      );
    },
    [store],
  );

  const onJump = useCallback(
    (target: { section: string; tab: string }) => {
      router.replace(
        buildSettingsHref(
          target.section as Parameters<typeof buildSettingsHref>[0],
          target.tab as SettingsTab,
        ),
      );
    },
    [router],
  );

  const ladder = useSettingsLadderOverrides();

  const runtime = useSettingsRowRuntimeState({
    ...ladder,
    data: runtimeData,
    disabledRows: { ...NOTIFICATION_UNAVAILABLE_ROWS, ...ladder.disabledRows },
    onAction,
    onJump,
    onSoundPreview,
  });

  const TabComponent = TAB_COMPONENTS[tab];

  return (
    <SettingsValueContext.Provider value={store}>
      <SettingsRowRuntimeContext.Provider value={runtime}>
        <NotificationsSectionContext.Provider value={sectionValue}>
          <SettingsDataBoundary
            pending={!prefsQuery.data}
            failed={!prefsQuery.data && prefsQuery.isError}
            retry={() => {
              void prefsQuery.refetch();
            }}
          >
            {TabComponent ? <TabComponent /> : null}
          </SettingsDataBoundary>
        </NotificationsSectionContext.Provider>
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}

/**
 * Pencerenin `renderSection` yuvasına takılacak imza.
 *
 * Yuvayı **bağlayan** şerit bu değil (`settings-window-route.tsx` Ş9'un dosyası değil); burası
 * yalnız bağlamayı tek satıra indirir:
 * `renderSection={(input) => input.section.key === "notifications" ? renderNotificationsSection(input) : …}`
 */
export function renderNotificationsSection(input: {
  readonly tab: { readonly key: SettingsTab };
}): React.ReactNode {
  return <NotificationsSection tab={input.tab.key} />;
}
