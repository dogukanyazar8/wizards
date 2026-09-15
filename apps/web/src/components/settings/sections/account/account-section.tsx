"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { SettingsBootstrapPayload } from "@/lib/settings/bootstrap-types";
import { SettingsDataBoundary } from "@/components/settings/settings-data-boundary";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  inferProfileStatusExpiryChoice,
  ProfileDetailsUpdateSchema,
  resolveProfileStatusExpiresAt,
  type ProfileDetailsUpdate,
  type ProfileStatusExpiryChoice,
} from "@wizards/types";
import {
  getProfileDetailsAction,
  updateProfileDetailsAction,
} from "@/lib/account/profile-details-actions";
import { signOut } from "next-auth/react";
import {
  fetchGameSharingSettings,
  GAME_SHARING_QUERY_KEY,
  updateGameSharingSettingsRequest,
} from "@/lib/game-activity/client";
import { ContactBlock } from "./contact-block";
import { getAccountContactAction } from "@/lib/account/contact-actions";

import { useI18n } from "@/components/providers/locale-provider";
import {
  AccountSessionsProvider,
  useAccountSessionsState,
} from "@/components/settings/blocks/active-sessions-block";
import {
  OwnBadgesProvider,
  badgeProgressText,
  useOwnBadgesState,
} from "@/components/settings/blocks/badge-grid-block";
import { DeleteAccountBlock } from "@/components/settings/risky/delete-account-block";
import { PasswordBlock } from "@/components/settings/risky/password-block";
import { TwoFactorBlock } from "@/components/settings/risky/two-factor-block";
import { AccountSurfaceContext } from "@/components/settings/sections/account/account-context";
import {
  DATE_FORMAT_BY_INDEX,
  DM_POLICY_BY_INDEX,
  FRIEND_REQUEST_POLICY_BY_INDEX,
  IDLE_TIMEOUT_BY_INDEX,
  LOCALE_BY_INDEX,
  PRESENCE_BY_INDEX,
  TIME_FORMAT_BY_INDEX,
  TIME_ZONE_BY_INDEX,
  VISIBILITY_BY_INDEX,
  indexOf,
  splitAccountPatch,
  toAccountSettingsPayload,
} from "@/components/settings/sections/account/account-surface";
import { AccountAccountTab } from "@/components/settings/sections/account/account-tab";
import { AccountBadgesTab } from "@/components/settings/sections/account/badges-tab";
import { AccountDataTab } from "@/components/settings/sections/account/data-tab";
import {
  AccountPrivacyTab,
  IDLE_TIMEOUT_ROW,
} from "@/components/settings/sections/account/privacy-tab";
import { AccountProfileTab } from "@/components/settings/sections/account/profile-tab";
import { AccountSecurityTab } from "@/components/settings/sections/account/security-tab";
import { useReportSettingsStore } from "@/components/settings/settings-ladder";
import type { SettingsSectionRenderInput } from "@/components/settings/settings-window";
import { usePresenceIdleTimeoutPreference } from "@/hooks/use-presence-activity";
import {
  getRecoveryCodeStatusAction,
  updateAccountSettingsAction,
  type AccountSettingsState,
} from "@/lib/account/actions";
import { downloadAccountDataExport } from "@/lib/account/privacy-client";
import { updateLocalePreferenceAction } from "@/lib/locale/actions";
import {
  SETTINGS_BOOTSTRAP_STALE_TIME_MS,
  fetchLayoutSettings,
  fetchSettingsBootstrap,
  patchLayoutSettings,
  settingsQueryKeys,
} from "@/lib/settings/client";
import { ACCOUNT_UNAVAILABLE_ROWS } from "@/lib/settings/availability";
import { MESSAGING_PRIVACY_QUERY_KEY } from "@/components/messages/privacy-settings-card";
import {
  fetchMessagingPrivacy,
  updateMessagingPrivacyRequest,
} from "@/lib/dm/conversation-settings-client";
import {
  SettingsRowRuntimeContext,
  SettingsValueContext,
  SettingsValueStore,
  useSettingsRowRuntimeState,
  type SettingsPatch,
  type SettingsRowRuntime,
} from "@/lib/settings/use-setting-value";

/**
 * Hesabım bölümü — Ş7.
 *
 * Kabuk (Ş5) çerçeveyi, motor (Ş6) satırı çiziyor; burada duran şey **bağlantı**: hangi satırın
 * değeri nereden okunur, nereye yazılır, hangi düğme neyi çağırır, hangi riskli gövde hangi
 * satırın altında açılır.
 *
 * Değer kutusu **bir tane**: altı sekme aynı `SettingsValueStore`'u paylaşıyor. Sekme başına bir
 * kutu, `pn` alanına yazıp Gizlilik'e geçen ve geri dönen kullanıcının yazdığını kaybetmesi
 * demekti — kirli profil alanları kaydet şeridini bekliyor ve şerit sekme değişiminde
 * kapanmıyor.
 *
 * **Wiring borcu:** `SettingsWindow` bugün `renderSection` yuvasını kimseye bağlamıyor
 * (Ş5 §TODO). Bu dosya `renderAccountSection`'ı hazır veriyor; bölüm kayıt defteri Ş13'ün işi.
 */

const NOOP = () => {};

/** K9 — `g9`'un ağaçtan gelmeyen varsayılanı; satırın kendi tanımından okunur. */
const IDLE_ROW_DEFAULT_INDEX = Number(IDLE_TIMEOUT_ROW.defaultValue ?? 2);

export type AccountSectionProps = {
  readonly input: SettingsSectionRenderInput;
};

const PROFILE_EXPIRY_BY_INDEX: readonly ProfileStatusExpiryChoice[] = [
  "1h",
  "4h",
  "today",
  "never",
  "30m",
];

export function AccountSection({
  input,
  bootstrap,
}: AccountSectionProps & { bootstrap?: SettingsBootstrapPayload | null }) {
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useI18n();
  const { idleTimeoutMinutes, setIdleTimeoutMinutes } = usePresenceIdleTimeoutPreference();

  const sessions = useAccountSessionsState(input.tab.key === "security");
  const badges = useOwnBadgesState();

  const bootstrapQuery = useQuery({
    queryFn: fetchSettingsBootstrap,
    queryKey: settingsQueryKeys.bootstrap,
    staleTime: SETTINGS_BOOTSTRAP_STALE_TIME_MS,
    initialData: bootstrap ?? undefined,
  });
  const layoutQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
  });
  const messagingPrivacyQuery = useQuery({
    queryKey: MESSAGING_PRIVACY_QUERY_KEY,
    queryFn: () => fetchMessagingPrivacy(),
  });
  const gameSharingQuery = useQuery({
    queryKey: GAME_SHARING_QUERY_KEY,
    queryFn: fetchGameSharingSettings,
  });

  const account = bootstrapQuery.data?.initialAccount ?? null;
  // Keep successful profile/avatar writes when the account section is mounted again.
  const onAccountUpdated = useCallback(
    (updatedAccount: AccountSettingsState) => {
      void queryClient.cancelQueries({ queryKey: settingsQueryKeys.bootstrap });
      queryClient.setQueryData<SettingsBootstrapPayload>(settingsQueryKeys.bootstrap, (current) =>
        current ? { ...current, initialAccount: updatedAccount } : current,
      );
    },
    [queryClient],
  );
  const contactKey = ["account-contact", account?.id] as const;
  const contactQuery = useQuery({
    queryKey: contactKey,
    queryFn: getAccountContactAction,
    enabled: Boolean(account),
    retry: false,
  });
  const detailsKey = ["account-profile-details", account?.id] as const;
  const detailsQuery = useQuery({
    queryKey: detailsKey,
    queryFn: getProfileDetailsAction,
    enabled: Boolean(account),
    retry: false,
  });
  const detailsExpiry = detailsQuery.data?.customStatusExpiresAt;
  const refetchDetails = detailsQuery.refetch;
  useEffect(() => {
    const expiry = detailsExpiry;
    if (!expiry) return;
    const timer = setTimeout(
      () => {
        void refetchDetails();
      },
      Math.max(0, Math.min(2_147_483_647, Date.parse(expiry) - Date.now() + 50)),
    );
    return () => clearTimeout(timer);
  }, [detailsExpiry, refetchDetails]);

  const recoveryQuery = useQuery({
    queryKey: ["account-recovery-status", account?.id],
    queryFn: getRecoveryCodeStatusAction,
    enabled: Boolean(account),
    staleTime: 30_000,
  });
  const recoveryCodes = recoveryQuery.data?.success ? recoveryQuery.data : null;

  /**
   * Tek yazma yolu.
   *
   * Eşleme tanımadığı bir anahtar bulursa **hata fırlatır**: kutu değeri sunucunun bildiği hâle
   * geri alır ve gösterge `Kaydedilemedi` der. Sessizce yutmak, dokunulan anahtarın kaydedildiğini
   * söyleyen bir gösterge bırakırdı (tuzak #14).
   */
  const write = useCallback(
    async (patch: SettingsPatch) => {
      const split = splitAccountPatch(patch);
      if (split.unmapped.length > 0)
        throw new Error(`SETTINGS_WRITE_UNSUPPORTED:${split.unmapped.join(",")}`);

      const details: ProfileDetailsUpdate = {
        ...("pbio" in patch ? { bio: String(patch.pbio).trim() || null } : {}),
        ...("ps" in patch ? { customStatus: String(patch.ps).trim() || null } : {}),
        ...("pe" in patch ? { customStatusEmoji: String(patch.pe) || null } : {}),
        ...("px" in patch
          ? {
              customStatusExpiresAt: resolveProfileStatusExpiresAt(
                PROFILE_EXPIRY_BY_INDEX[Number(patch.px)] ?? "never",
              ),
            }
          : {}),
      };
      if (details.customStatus === null) {
        details.customStatusEmoji = null;
        details.customStatusExpiresAt = null;
      } else if (details.customStatus && !("px" in patch)) {
        const current = queryClient.getQueryData<
          Awaited<ReturnType<typeof getProfileDetailsAction>>
        >(["account-profile-details", account?.id]);
        if (!current?.customStatus) details.customStatusExpiresAt = null;
      }
      ProfileDetailsUpdateSchema.parse(details);

      if (split.localMinutes !== null) {
        setIdleTimeoutMinutes(split.localMinutes);
      }

      if (split.localeIndex !== null) {
        const next = LOCALE_BY_INDEX[split.localeIndex] ?? LOCALE_BY_INDEX[0];
        const result = await updateLocalePreferenceAction(next);

        if (!result.success) {
          throw new Error(result.error ?? "appearance.language.savingError");
        }

        setLocale(result.locale ?? next);
      }

      if (Object.keys(split.layout).length > 0) {
        queryClient.setQueryData(settingsQueryKeys.layout, await patchLayoutSettings(split.layout));
      }
      if (split.messagingPrivacy) {
        const privacy = await updateMessagingPrivacyRequest(split.messagingPrivacy);
        await queryClient.cancelQueries({ queryKey: MESSAGING_PRIVACY_QUERY_KEY });
        queryClient.setQueryData(MESSAGING_PRIVACY_QUERY_KEY, privacy);
      }
      if (split.gameSharing) {
        const gameSharing = await updateGameSharingSettingsRequest(split.gameSharing.enabled);
        await queryClient.cancelQueries({ queryKey: GAME_SHARING_QUERY_KEY });
        queryClient.setQueryData(GAME_SHARING_QUERY_KEY, gameSharing);
      }

      const profileDraft = {
        ...("pn" in patch ? { displayName: String(patch.pn) } : {}),
        ...("pu" in patch ? { username: String(patch.pu) } : {}),
        ...("pp" in patch ? { presenceIndex: Number(patch.pp) } : {}),
      };

      if (account && Object.keys(profileDraft).length > 0) {
        const result = await updateAccountSettingsAction(
          toAccountSettingsPayload(account, profileDraft),
        );

        if (!result.success) {
          throw new Error(result.error ?? "settings.account.errors.save");
        }

        if (result.user) {
          onAccountUpdated(result.user);
        }
      }

      if (Object.keys(details).length) {
        const result = await updateProfileDetailsAction(details);
        if (!result.success) throw new Error(result.error);
        await queryClient.cancelQueries({ queryKey: ["account-profile-details", account?.id] });
        queryClient.setQueryData(["account-profile-details", account?.id], result.profile);
        void queryClient.invalidateQueries({ queryKey: ["user-profile", account?.id] });
      }
    },
    [account, onAccountUpdated, queryClient, setIdleTimeoutMinutes, setLocale],
  );

  const values = useMemo<SettingsPatch>(() => {
    const layout = layoutQuery.data;
    const details = detailsQuery.data;
    return {
      g9: indexOf(IDLE_TIMEOUT_BY_INDEX, idleTimeoutMinutes, IDLE_ROW_DEFAULT_INDEX),
      ...(account
        ? {
            pn: account.displayName ?? account.username,
            pp: indexOf(PRESENCE_BY_INDEX, account.status as (typeof PRESENCE_BY_INDEX)[number], 0),
            pu: account.username,
          }
        : {}),
      ...(details
        ? {
            pbio: details.bio ?? "",
            ps: details.customStatus ?? "",
            pe: details.customStatusEmoji ?? "",
            px: PROFILE_EXPIRY_BY_INDEX.indexOf(
              inferProfileStatusExpiryChoice(details.customStatusExpiresAt),
            ),
          }
        : {}),
      ...(layout
        ? {
            g1: indexOf(VISIBILITY_BY_INDEX, layout.profileVisibility),
            g2: indexOf(VISIBILITY_BY_INDEX, layout.presenceVisibility),
            g3: indexOf(DM_POLICY_BY_INDEX, layout.dmPolicy),
            g4: indexOf(FRIEND_REQUEST_POLICY_BY_INDEX, layout.friendRequestPolicy),
            g5: layout.allowGroupInvites,
            l1: indexOf(LOCALE_BY_INDEX, locale),
            l2: indexOf(TIME_ZONE_BY_INDEX, layout.timeZone ?? "AUTO"),
            l3: indexOf(DATE_FORMAT_BY_INDEX, layout.dateFormat),
            l4: indexOf(TIME_FORMAT_BY_INDEX, layout.timeFormat),
          }
        : {}),
      ...(messagingPrivacyQuery.data ? { g6: messagingPrivacyQuery.data.readReceipts } : {}),
      ...(gameSharingQuery.data ? { g7: gameSharingQuery.data.enabled } : {}),
    };
  }, [
    account,
    detailsQuery.data,
    layoutQuery.data,
    messagingPrivacyQuery.data,
    gameSharingQuery.data,
    locale,
    idleTimeoutMinutes,
  ]);

  // Reopening uses cached values in the very first render, before effects run.
  const [store] = useState(() => new SettingsValueStore({ values, write }));

  useEffect(() => store.setWrite(write), [store, write]);
  useLayoutEffect(() => {
    store.applyRemote(values);
  }, [values, store]);

  useEffect(() => () => store.dispose(), [store]);

  /**
   * F1 — kutu ↔ kabuk dikişi. Tek çağrı üç şeyi birden bağlar: başlığın kayıt göstergesi,
   * kirli şeridin görünürlüğü ve şeridin `Sıfırla` / `Değişiklikleri kaydet` düğmeleri.
   *
   * Önceden yalnız kirli kayıt yapılıyordu ve kabuk kirli bayrağını ölü bir `onTouch`
   * sözleşmesinden bekliyordu; şerit hiç çıkmadığı için kayıt da hiç kullanılmıyordu.
   */
  useReportSettingsStore(store);

  const data = useMemo<Record<string, string>>(
    () => ({
      avatarUrl: account?.avatarUrl ?? "",
      badgeProgress: badgeProgressText(badges.data, t),
      displayName: account?.displayName ?? account?.username ?? "",
      email: account?.email ?? "",
      // TODO(api): `getAccountSettingsRows` servisi var, onu servis eden **uç yok**.
      lastExport: t("settings.data.noExport"),
      passwordChangedAt: t("settings.data.noPasswordChange"),
      phone: contactQuery.data?.phone ?? t("settings.data.noPhone"),
      recoveryCodes: recoveryCodes
        ? t("settings.data.recoveryCodes", {
            total: recoveryCodes.total,
            unused: recoveryCodes.unused,
          })
        : "",
      sessionCount:
        sessions.sessions === null
          ? ""
          : t("settings.data.sessionCount", { count: sessions.sessions.length }),
      username: account?.username ?? "",
    }),
    [account, badges.data, contactQuery.data?.phone, recoveryCodes, sessions.sessions, t],
  );

  const onAction = useCallback(
    (rowKey: string, actionIndex: number) => {
      switch (`${rowKey}:${actionIndex}`) {
        case "o2:0":
          sessions.refresh();
          return;
        case "o2:1":
          // Tuzak #13 — `revoke-others` mevcut oturumu **kapsamıyor**; ekran onu tekrar etmiyor.
          void Promise.resolve(sessions.revokeOthers()).catch(() => {
            /* The session list shows the error. */
          });
          return;
        case "s4:0":
          // `Tüm cihazlardan çıkış yap` bu cihazı **da** kapatır: diğerleri sunucuda, bu oturum
          // yerel çıkışla. Tek bir uç ikisini birden yapmıyor.
          void Promise.resolve(sessions.revokeOthers())
            .then(() => signOut({ redirectTo: "/login" }))
            .catch(() => {
              /* Keep this session open when revoking others failed. */
            });
          return;
        case "d1:0":
        case "d1:1":
          void downloadAccountDataExport().then(({ blob, filename }) => {
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.download = filename;
            anchor.href = url;
            anchor.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 0);
          });
          return;
        default:
          // Web yazma yolu olmayan satırlar `disabledRows` ile kapalı; buraya düşen çağrı yok.
          return;
      }
    },
    [sessions],
  );

  const runtime: SettingsRowRuntime = useSettingsRowRuntimeState({
    data,
    disabledRows: {
      ...ACCOUNT_UNAVAILABLE_ROWS,
      g6: !messagingPrivacyQuery.data,
      g7: !gameSharingQuery.data,
      ae: !contactQuery.data,
      ap: !contactQuery.data,
      pbio: !detailsQuery.data,
      ps: !detailsQuery.data,
      pe: !detailsQuery.data,
      px: !detailsQuery.data,
    },
    onAction,
    onJump: NOOP,
    onNavigate: NOOP,
    onSoundPreview: NOOP,
    openRisky: input.openRisky,
    openSelect: input.openSelect,
    riskyBodies: {
      ...Object.fromEntries(
        (["email", "phone"] as const).map((kind) => [
          kind === "email" ? "ae" : "ap",
          contactQuery.data ? (
            <ContactBlock
              key={kind}
              kind={kind}
              email={account?.email ?? ""}
              contact={contactQuery.data}
              onClose={() => input.toggleRisky(kind)}
              onPhoneSaved={(phone) =>
                queryClient.setQueryData(contactKey, { ...contactQuery.data, phone })
              }
            />
          ) : null,
        ]),
      ),
      apw: (
        <PasswordBlock email={account?.email ?? ""} onClose={() => input.toggleRisky("password")} />
      ),
      d3: <DeleteAccountBlock onClose={() => input.toggleRisky("deleteAccount")} />,
      s1: (
        <TwoFactorBlock
          enabled={account?.twoFactorEnabled ?? false}
          onChanged={() => void bootstrapQuery.refetch()}
          onClose={() => input.toggleRisky("twoFactor")}
        />
      ),
    },
    setOpenRisky: (key) => {
      const target = key ?? input.openRisky;
      if (target) input.toggleRisky(target);
    },
    setOpenSelect: (key) => input.toggleSelect(key ?? input.openSelect ?? ""),
  });

  const surface = useMemo(
    () => ({
      account,
      onAccountUpdated,
      uploadthingEnabled: bootstrapQuery.data?.uploadthingEnabled ?? false,
    }),
    [account, bootstrapQuery.data?.uploadthingEnabled, onAccountUpdated],
  );

  const reads =
    input.tab.key === "privacy"
      ? [layoutQuery, messagingPrivacyQuery, gameSharingQuery]
      : input.tab.key === "profile"
        ? [bootstrapQuery, detailsQuery]
        : input.tab.key === "account"
          ? [bootstrapQuery, contactQuery]
          : [];
  const missing = reads.filter((query) => query.data === undefined);

  return (
    <SettingsValueContext.Provider value={store}>
      <SettingsRowRuntimeContext.Provider value={runtime}>
        <AccountSurfaceContext.Provider value={surface}>
          <AccountSessionsProvider value={sessions}>
            <OwnBadgesProvider value={badges}>
              <SettingsDataBoundary
                pending={missing.length > 0}
                failed={missing.some((query) => query.isError)}
                retry={() => {
                  for (const query of missing) void query.refetch();
                }}
              >
                <AccountTabBody tab={input.tab.key} />
              </SettingsDataBoundary>
            </OwnBadgesProvider>
          </AccountSessionsProvider>
        </AccountSurfaceContext.Provider>
      </SettingsRowRuntimeContext.Provider>
    </SettingsValueContext.Provider>
  );
}

function AccountTabBody({ tab }: { readonly tab: string }) {
  switch (tab) {
    case "account":
      return <AccountAccountTab />;
    case "badges":
      return <AccountBadgesTab />;
    case "data":
      return <AccountDataTab />;
    case "privacy":
      return <AccountPrivacyTab />;
    case "security":
      return <AccountSecurityTab />;
    default:
      return <AccountProfileTab />;
  }
}

/** Ş13'ün bölüm kayıt defterine takacağı giriş. */
export function renderAccountSection(input: SettingsSectionRenderInput): React.ReactNode {
  return <AccountSection input={input} />;
}
