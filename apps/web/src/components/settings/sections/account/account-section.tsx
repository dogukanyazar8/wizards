"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signOut } from "next-auth/react";

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

export function AccountSection({ input }: AccountSectionProps) {
  const { locale, setLocale, t } = useI18n();
  const { idleTimeoutMinutes, setIdleTimeoutMinutes } = usePresenceIdleTimeoutPreference();

  const sessions = useAccountSessionsState();
  const badges = useOwnBadgesState();

  const bootstrapQuery = useQuery({
    queryFn: fetchSettingsBootstrap,
    queryKey: settingsQueryKeys.bootstrap,
    staleTime: SETTINGS_BOOTSTRAP_STALE_TIME_MS,
  });
  const layoutQuery = useQuery({
    queryFn: fetchLayoutSettings,
    queryKey: settingsQueryKeys.layout,
  });

  /**
   * Hesap **türetilir**, kopyalanmaz.
   *
   * Sorgunun sonucunu bir efektle state'e kopyalamak zincirleme render üretiyor ve iki kaynak
   * arasında bir tazelik yarışı açıyor. Yerel değer yalnız kullanıcının kendi işlemleriyle
   * (avatar yükleme, profil kaydı) doluyor ve o an sorgunun bildiğinden **daha yeni** olduğu için
   * öne geçiyor; sorgu tazelenince `refetch` sonrası ikisi zaten aynı satırı gösteriyor.
   */
  const [localAccount, setLocalAccount] = useState<AccountSettingsState | null>(null);
  const account = localAccount ?? bootstrapQuery.data?.initialAccount ?? null;

  const [recoveryCodes, setRecoveryCodes] = useState<{ total: number; unused: number } | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    void getRecoveryCodeStatusAction().then((result) => {
      if (active && result.success) {
        setRecoveryCodes({ total: result.total, unused: result.unused });
      }
    });

    return () => {
      active = false;
    };
  }, []);

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
        await patchLayoutSettings(split.layout);
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
          setLocalAccount(result.user);
        }
      }

      if (split.unmapped.length > 0) {
        // TODO(api): bu anahtarların web yazma yolu yok (`account-surface.ts` §default).
        throw new Error(`SETTINGS_WRITE_UNSUPPORTED:${split.unmapped.join(",")}`);
      }
    },
    [account, setIdleTimeoutMinutes, setLocale],
  );

  // K9 satırı ağaçta olmadığı için varsayılanı burada tohumlanır (`privacy-tab.tsx` §K9):
  // `buildSettingsDefaults` yalnız ağacı geziyor ve tohumsuz bir menü ilk karede boş çizilirdi.
  const [store] = useState(
    () => new SettingsValueStore({ values: { g9: IDLE_ROW_DEFAULT_INDEX }, write }),
  );

  useEffect(() => store.setWrite(write), [store, write]);

  useEffect(() => () => store.dispose(), [store]);

  /**
   * F1 — kutu ↔ kabuk dikişi. Tek çağrı üç şeyi birden bağlar: başlığın kayıt göstergesi,
   * kirli şeridin görünürlüğü ve şeridin `Sıfırla` / `Değişiklikleri kaydet` düğmeleri.
   *
   * Önceden yalnız kirli kayıt yapılıyordu ve kabuk kirli bayrağını ölü bir `onTouch`
   * sözleşmesinden bekliyordu; şerit hiç çıkmadığı için kayıt da hiç kullanılmıyordu.
   */
  useReportSettingsStore(store);

  // Sunucudan gelen değerler kutuya **uzaktan** uygulanır: kullanıcının uçuşta olan yazması
  // atlanır (`applyRemote`), yani sorgu tazelenmesi az önceki dokunuşu geri almaz.
  useEffect(() => {
    if (!account) return;

    store.applyRemote({
      pn: account.displayName ?? account.username,
      pp: indexOf(PRESENCE_BY_INDEX, account.status as (typeof PRESENCE_BY_INDEX)[number], 0),
      pu: account.username,
    });
  }, [account, store]);

  useEffect(() => {
    const layout = layoutQuery.data;

    if (!layout) return;

    store.applyRemote({
      g1: indexOf(VISIBILITY_BY_INDEX, layout.profileVisibility),
      g2: indexOf(VISIBILITY_BY_INDEX, layout.presenceVisibility),
      g3: indexOf(DM_POLICY_BY_INDEX, layout.dmPolicy),
      g4: indexOf(FRIEND_REQUEST_POLICY_BY_INDEX, layout.friendRequestPolicy),
      g5: layout.allowGroupInvites,
      l1: indexOf(LOCALE_BY_INDEX, locale),
      l2: indexOf(TIME_ZONE_BY_INDEX, layout.timeZone ?? "AUTO"),
      l3: indexOf(DATE_FORMAT_BY_INDEX, layout.dateFormat),
      l4: indexOf(TIME_FORMAT_BY_INDEX, layout.timeFormat),
    });
  }, [layoutQuery.data, locale, store]);

  useEffect(() => {
    store.applyRemote({ g9: indexOf(IDLE_TIMEOUT_BY_INDEX, idleTimeoutMinutes, 2) });
  }, [idleTimeoutMinutes, store]);

  /** TODO(api): okuma yolu gelene kadar `null` — kilit hiç kapanmaz, yalan da söylemez. */
  const usernameLockedUntil: string | null = null;

  const data = useMemo<Record<string, string>>(
    () => ({
      avatarUrl: account?.avatarUrl ?? "",
      badgeProgress: badgeProgressText(badges.data, t),
      // TODO(api): banner web'de yüklenemiyor; hero gradyana düşer.
      bannerUrl: "",
      displayName: account?.displayName ?? account?.username ?? "",
      email: account?.email ?? "",
      // TODO(api): `getAccountSettingsRows` servisi var, onu servis eden **uç yok**.
      lastExport: t("settings.data.noExport"),
      passwordChangedAt: t("settings.data.noPasswordChange"),
      phone: t("settings.data.noPhone"),
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
      verificationEmailSentAt: t("settings.data.noVerificationEmail"),
    }),
    [account, badges.data, recoveryCodes, sessions.sessions, t],
  );

  const onAction = useCallback(
    (rowKey: string, actionIndex: number) => {
      switch (`${rowKey}:${actionIndex}`) {
        case "o2:0":
          sessions.refresh();
          return;
        case "o2:1":
          // Tuzak #13 — `revoke-others` mevcut oturumu **kapsamıyor**; ekran onu tekrar etmiyor.
          sessions.revokeOthers();
          return;
        case "s4:0":
          // `Tüm cihazlardan çıkış yap` bu cihazı **da** kapatır: diğerleri sunucuda, bu oturum
          // yerel çıkışla. Tek bir uç ikisini birden yapmıyor.
          void Promise.resolve(sessions.revokeOthers()).then(() =>
            signOut({ redirectTo: "/login" }),
          );
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
      /**
       * 30 günlük bekleme (`User.usernameChangedAt`).
       *
       * Kural sunucuda **var** (`getNextUsernameChangeAt`, `updateAccountProfile` onu
       * uyguluyor); eksik olan okuma yolu — hiçbir web ucu `nextUsernameChangeAt` döndürmüyor.
       * Kapı bu yüzden alanın kendisinde kurulu ve bugün hep açık; uç geldiğinde tek satır
       * dolar. TODO(api): `GET /users/me/settings/bootstrap` bu alanı taşımalı.
       */
      pu: usernameLockedUntil !== null,
    },
    onAction,
    onJump: NOOP,
    onNavigate: NOOP,
    onSoundPreview: NOOP,
    openRisky: input.openRisky,
    openSelect: input.openSelect,
    riskyBodies: {
      apw: <PasswordBlock onClose={() => input.toggleRisky("password")} />,
      d3: <DeleteAccountBlock onClose={() => input.toggleRisky("deleteAccount")} />,
      s1: (
        <TwoFactorBlock
          enabled={account?.twoFactorEnabled ?? false}
          onChanged={() => void bootstrapQuery.refetch()}
          onClose={() => input.toggleRisky("twoFactor")}
        />
      ),
    },
    setOpenRisky: (key) => input.toggleRisky((key ?? input.openRisky ?? "password") as never),
    setOpenSelect: (key) => input.toggleSelect(key ?? input.openSelect ?? ""),
  });

  const surface = useMemo(
    () => ({
      account,
      onAccountUpdated: setLocalAccount,
      uploadthingEnabled: bootstrapQuery.data?.uploadthingEnabled ?? false,
    }),
    [account, bootstrapQuery.data?.uploadthingEnabled],
  );

  return (
    <SettingsValueContext.Provider value={store}>
      <SettingsRowRuntimeContext.Provider value={runtime}>
        <AccountSurfaceContext.Provider value={surface}>
          <AccountSessionsProvider value={sessions}>
            <OwnBadgesProvider value={badges}>
              <AccountTabBody tab={input.tab.key} />
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
