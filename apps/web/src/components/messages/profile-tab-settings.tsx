"use client";

import React, { useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  ConversationPrivacy,
  ConversationToast,
  ConversationToastKind,
  DMNotifyLevel,
  GroupMemberPage,
  GroupPermissionLevel,
  GroupProfilePanelDTO,
  UserProfilePanelDTO,
} from "@wizards/types";

import {
  NotificationChoiceCards,
  nextRadioIndex,
  notifyWriteFields,
} from "@/components/messages/notification-choice-cards";
import {
  MESSAGING_PRIVACY_QUERY_KEY,
  PrivacySettingsCard,
  type PrivacyToggleKey,
} from "@/components/messages/privacy-settings-card";
import {
  ProfileDangerActions,
  resolveDangerActions,
  type DangerActionKind,
} from "@/components/messages/profile-danger-actions";
import { ProfileSectionLabel } from "@/components/messages/profile-section-label";
import { useI18n } from "@/components/providers/locale-provider";
import { Skeleton } from "@/components/ui/skeleton";
import {
  dmQueryKeys,
  removeGroupMemberRequest,
  setConversationNotifyLevelRequest,
  updateGroupSettingsRequest,
} from "@/lib/dm/client";
import {
  fetchMessagingPrivacy,
  reportUserRequest,
  updateMessagingPrivacyRequest,
} from "@/lib/dm/conversation-settings-client";
import {
  clearGroupHistoryRequest,
  deleteGroupConversationRequest,
  fetchGroupMembersPage,
  fetchGroupProfilePanel,
  groupProfileQueryKeys,
} from "@/lib/dm/group-profile-client";
import {
  DM_PROFILE_PANEL_STALE_TIME_MS,
  dmProfilePanelQueryOptions,
  dmProfileQueryKeys,
} from "@/lib/dm/profile-client";
import { blockFriendRequest, friendsQueryKeys } from "@/lib/friends/client";
import { MESSAGES_METRICS, hairline, pxToRem } from "@/lib/messages/metrics";
import { cn } from "@/lib/utils";

/**
 * Profil panelinin `Ayarlar` sekmesi — SPEC-MESAJLAR §15.5, `screens/18` (DM) ve
 * `screens/21` (grup).
 *
 * Sekme **kendi verisini kendi çeker** (kural 7: seçilmeyen sekmenin sorgusu
 * koşmaz). Üç sorgu var ve üçü de ayrı anahtarlarda:
 *
 *   1. DM profil paneli — `dmProfileQueryKeys.profile`
 *   2. Grup profil paneli — `groupProfileQueryKeys.panel`
 *   3. Hesap geneli gizlilik — `MESSAGING_PRIVACY_QUERY_KEY` (**paylaşılan**)
 *
 * Üçüncüsü bilerek panel DTO'sundan **okunmuyor**. `UserProfilePanelDTO.privacy`
 * alanı var, ama okundu bilgisi hesap genelidir: sohbet başına bir kopyadan
 * beslenirse iki sohbet paneli aynı tercihi iki farklı değerde gösterebilir.
 * Tek anahtar, tek doğruluk.
 */

const { profilePanel } = MESSAGES_METRICS;

export type ProfileTabProps = {
  conversationId: string;
  variant: "dm" | "group";
  onToast?: ((toast: ConversationToast) => void) | undefined;
};

/* ------------------------------------------------------------------------- *
 * Saf yardımcılar — bileşen bunları kullanır, testler de.
 * ------------------------------------------------------------------------- */

/** Başarı toast'ı. */
export function successToast(
  kind: ConversationToastKind,
  params?: Record<string, number | string>,
): ConversationToast {
  return params === undefined ? { kind, tone: "success" } : { kind, params, tone: "success" };
}

/**
 * Hata toast'ı.
 *
 * Başarı kaydını danger tonuyla basmak yanlıştı: kırmızı bir şerit `Sohbet geçmişi
 * temizlendi` derse, olmayan bir şeyi olmuş gibi söyler ve rengi de onu yalanlar.
 * `actionFailed` bu yüzden kendi cümlesini taşır — "işlem tamamlanamadı, değişiklik
 * geri alındı" — ve kontrol zaten eski değerine sarılmış durumdadır.
 *
 * `kind` parametresi bilerek yok: hangi satırın başarısız olduğunu şerit değil, geri
 * sarılan kontrolün kendisi anlatır.
 */
export function dangerToast(): ConversationToast {
  return { kind: "actionFailed", tone: "danger" };
}

/**
 * Bildirim radyosunun başarısızlık toast'ı.
 *
 * Denenen seviye metne girmez. Radyo hatada eski seçimine döner, yani ekranda zaten
 * doğru cevap duruyor; şeridin işi yalnız denemenin tutmadığını söylemek.
 */
export function notifyFailureToast(_level: DMNotifyLevel): ConversationToast {
  return dangerToast();
}

/** Yıkıcı satır → başarı toast'ının kaydı. */
export const DANGER_TOAST_KIND: Readonly<Record<DangerActionKind, ConversationToastKind>> =
  Object.freeze({
    block: "userBlocked",
    clearHistory: "historyCleared",
    deleteGroup: "groupDeleted",
    leaveGroup: "groupLeft",
    report: "reportSent",
  });

/**
 * İyimser yazma + geri sarma.
 *
 * Anlık görüntü **yamadan önce** alınır ve `restore` onu aynen geri koyar.
 * Önbellekte kayıt yoksa geri sarma satırı **siler**: `setQueryData(key,
 * undefined)` React Query'de "değişiklik yok" demektir, yani var olmayan bir
 * satırı geri sarmak iyimser değeri kalıcı hâle getirirdi.
 */
export function optimisticPatch<TData>(
  client: QueryClient,
  key: readonly unknown[],
  patch: (current: TData) => TData,
): { restore: () => void } {
  const previous = client.getQueryData<TData>(key);

  if (previous !== undefined) {
    client.setQueryData<TData>(key, patch(previous));
  }

  return {
    restore: () => {
      if (previous === undefined) {
        client.removeQueries({ exact: true, queryKey: key });
        return;
      }

      client.setQueryData<TData>(key, previous);
    },
  };
}

/** İkiz alanlar önbellekte de birlikte hareket eder (tuzak 5). */
export function withNotifyLevel<T extends { muted: boolean; notifyLevel: DMNotifyLevel }>(
  panel: T,
  level: DMNotifyLevel,
): T {
  return { ...panel, ...notifyWriteFields(level) };
}

export function withPrivacyFlag(
  privacy: ConversationPrivacy,
  key: PrivacyToggleKey,
  next: boolean,
): ConversationPrivacy {
  return { ...privacy, [key]: next };
}

export function withAddPolicy(
  panel: GroupProfilePanelDTO,
  addPolicy: GroupPermissionLevel,
): GroupProfilePanelDTO {
  return { ...panel, addPolicy };
}

/**
 * Katılımcı listesinde kendi satırını bulur.
 *
 * `Gruptan ayrıl` "kendini çıkar" yazmasıdır ve uç yolda bir kullanıcı kimliği
 * ister; sekmenin prop sözleşmesi ise yalnız `conversationId` / `variant` /
 * `onToast` taşıyor. Kimliği uygulama kabuğunun `useAuthenticatedAppRuntime`
 * bağlamından okumak sekmeyi kabuğa bağlardı; bunun yerine roster'ın **zaten
 * var olan** `isSelf` bayrağı okunuyor. İstek yalnız kullanıcı ayrılmayı
 * onayladığında atılır ve Ş7'nin `Üyeler` sekmesi aynı anahtarı doldurduysa
 * önbellekten gelir.
 *
 * Sayfa gezinmesi `total` ile sınırlı; sunucu aynı imleci tekrar verirse döngü
 * `maxPages` ile kesilir (250 üyelik tavan 50'lik sayfalarda beş sayfadır).
 */
export async function resolveViewerMemberId(
  conversationId: string,
  options: {
    fetchPage?: (conversationId: string, cursor?: string | null) => Promise<GroupMemberPage>;
    maxPages?: number;
    seed?: GroupMemberPage | undefined;
  } = {},
): Promise<string | null> {
  const fetchPage = options.fetchPage ?? fetchGroupMembersPage;
  const maxPages = options.maxPages ?? 10;
  let page = options.seed ?? (await fetchPage(conversationId));
  let visited = 1;

  for (;;) {
    const self = page.items.find((item) => item.isSelf);

    if (self) {
      return self.userId;
    }

    if (!page.nextCursor || visited >= maxPages) {
      return null;
    }

    page = await fetchPage(conversationId, page.nextCursor);
    visited += 1;
  }
}

/* ------------------------------------------------------------------------- *
 * `KİMLER ÜYE EKLEYEBİLİR` segmenti — §15.5.3
 * ------------------------------------------------------------------------- */

const ADD_POLICY_OPTIONS: readonly { labelKey: string; value: GroupPermissionLevel }[] =
  Object.freeze([
    { labelKey: "messages.profile.addPolicy.everyone", value: "ALL" },
    { labelKey: "messages.profile.addPolicy.admins", value: "ADMINS" },
  ]);

/**
 * Mevcut `SegmentedControl` kullanılmadı: o bileşen `groupModal` ölçülerini ve
 * `--surface-tertiary` / `--surface-card` tonlarını sabitliyor, §15.5 ise
 * `--surface-soft/0.8` kap ve dolu `--primary` seçili segment istiyor. Ölçü ve
 * renk sözlükten okunduğu için ikinci bir bileşen değil, aynı kalıbın
 * `profilePanel` ölçüleriyle yazılmış hâli.
 */
function AddPolicySegment({
  labelledById,
  onChange,
  readOnly,
  value,
}: {
  labelledById: string;
  onChange: (value: GroupPermissionLevel) => void;
  readOnly: boolean;
  value: GroupPermissionLevel;
}) {
  const { t } = useI18n();
  const refs = useRef(new Map<GroupPermissionLevel, HTMLButtonElement>());

  return (
    <div
      aria-labelledby={labelledById}
      aria-readonly={readOnly || undefined}
      className="flex"
      data-testid="profile-add-policy"
      role="radiogroup"
      style={{
        background: "hsl(var(--surface-soft)/0.8)",
        borderColor: "hsl(var(--border)/0.5)",
        borderRadius: pxToRem(profilePanel.segmentRadius),
        borderStyle: "solid",
        borderWidth: hairline(),
        gap: pxToRem(profilePanel.segmentGap),
        marginTop: pxToRem(profilePanel.segmentMarginTop),
        padding: pxToRem(profilePanel.segmentPadding),
      }}
    >
      {ADD_POLICY_OPTIONS.map((option, index) => {
        const selected = option.value === value;

        return (
          <button
            aria-checked={selected}
            className={cn(
              "flex-1 transition-[background-color,color] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
              readOnly ? "cursor-default" : "cursor-pointer",
            )}
            data-testid={`profile-add-policy-${option.value}`}
            disabled={readOnly}
            key={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const next = nextRadioIndex(event.key, index, ADD_POLICY_OPTIONS.length);
              const target = next === null ? null : ADD_POLICY_OPTIONS[next];

              if (!target) {
                return;
              }

              event.preventDefault();
              onChange(target.value);
              refs.current.get(target.value)?.focus();
            }}
            ref={(node) => {
              if (node) {
                refs.current.set(option.value, node);
              } else {
                refs.current.delete(option.value);
              }
            }}
            role="radio"
            style={{
              background: selected ? "hsl(var(--primary))" : "transparent",
              borderRadius: pxToRem(profilePanel.segmentButtonRadius),
              color: selected ? "hsl(var(--primary-foreground))" : "hsl(var(--text-secondary))",
              fontSize: pxToRem(profilePanel.segmentButtonFontSize),
              fontWeight: 600,
              height: pxToRem(profilePanel.segmentButtonHeight),
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------------- *
 * Sekme
 * ------------------------------------------------------------------------- */

function Section({
  children,
  count,
  labelId,
  labelKey,
}: {
  children: React.ReactNode;
  count?: string | undefined;
  labelId: string;
  labelKey: string;
}) {
  const { t } = useI18n();

  return (
    <div>
      {/*
        `ProfileSectionLabel` kimlik almıyor; `aria-labelledby` etiketi saran
        kabın metnini okur, o yüzden kimlik sarmalayıcıda duruyor.
      */}
      <div id={labelId}>
        <ProfileSectionLabel count={count}>{t(labelKey)}</ProfileSectionLabel>
      </div>
      {children}
    </div>
  );
}

export function ProfileTabSettings({
  conversationId,
  onToast,
  variant,
}: ProfileTabProps): React.JSX.Element {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const idPrefix = useId();
  const [busyKind, setBusyKind] = useState<DangerActionKind | null>(null);

  const isGroup = variant === "group";
  const dmPanelKey = dmProfileQueryKeys.profile(conversationId);
  const groupPanelKey = groupProfileQueryKeys.panel(conversationId);

  const dmPanel = useQuery(dmProfilePanelQueryOptions(conversationId, !isGroup));
  const groupPanel = useQuery({
    enabled: isGroup && conversationId.length > 0,
    queryFn: () => fetchGroupProfilePanel(conversationId),
    queryKey: groupPanelKey,
    staleTime: DM_PROFILE_PANEL_STALE_TIME_MS,
  });
  const privacy = useQuery({
    queryFn: () => fetchMessagingPrivacy(),
    queryKey: MESSAGING_PRIVACY_QUERY_KEY,
    staleTime: DM_PROFILE_PANEL_STALE_TIME_MS,
  });

  const notifyLevel = (isGroup ? groupPanel.data?.notifyLevel : dmPanel.data?.notifyLevel) ?? "ALL";
  const subjectName = (isGroup ? groupPanel.data?.name : dmPanel.data?.name) ?? "";
  const panelPending = isGroup ? groupPanel.isPending : dmPanel.isPending;
  const panelFailed = isGroup ? groupPanel.isError : dmPanel.isError;

  const emit = (toast: ConversationToast) => {
    onToast?.(toast);
  };

  /**
   * Bildirim radyosu. Uç gövdesi yalnız `notifyLevel` taşır ve sunucu `muted`
   * alanını **aynı** `update` içinde yazar — iki ayrı çağrı yok.
   */
  const notifyMutation = useMutation({
    mutationFn: (level: DMNotifyLevel) => setConversationNotifyLevelRequest(conversationId, level),
    onError: (_error, level, context) => {
      context?.restore();
      emit(notifyFailureToast(level));
    },
    onMutate: (level: DMNotifyLevel) =>
      isGroup
        ? optimisticPatch<GroupProfilePanelDTO>(queryClient, groupPanelKey, (current) =>
            withNotifyLevel(current, level),
          )
        : optimisticPatch<UserProfilePanelDTO>(queryClient, dmPanelKey, (current) =>
            withNotifyLevel(current, level),
          ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: dmQueryKeys.list });
    },
  });

  /**
   * Gizlilik anahtarları. Yazma **hesap geneline** gider ve geçersizleştirme de
   * paylaşılan anahtarda yapılır; Ayarlar ekranı aynı satırı okuduğunda taze
   * değeri görür.
   */
  const privacyMutation = useMutation({
    mutationFn: (input: { key: PrivacyToggleKey; next: boolean }) =>
      updateMessagingPrivacyRequest(
        input.key === "readReceipts"
          ? { readReceipts: input.next }
          : { typingIndicator: input.next },
      ),
    /**
     * Geri sarma **sessizdir**: anahtarın eski konumuna dönmesi geri bildirimin
     * kendisidir ve `ConversationToastKind` bir gizlilik kaydı taşımıyor. Var
     * olmayan bir cümleyi kırmızıya boyamaktansa hiç basmamak dürüsttür.
     */
    onError: (_error, _input, context) => {
      context?.restore();
    },
    onMutate: (input: { key: PrivacyToggleKey; next: boolean }) =>
      optimisticPatch<ConversationPrivacy>(queryClient, MESSAGING_PRIVACY_QUERY_KEY, (current) =>
        withPrivacyFlag(current, input.key, input.next),
      ),
    onSuccess: (result) => {
      queryClient.setQueryData<ConversationPrivacy>(MESSAGING_PRIVACY_QUERY_KEY, result);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: MESSAGING_PRIVACY_QUERY_KEY });
    },
  });

  const addPolicyMutation = useMutation({
    mutationFn: (level: GroupPermissionLevel) =>
      updateGroupSettingsRequest(conversationId, { permAddMembers: level }),
    onError: (_error, _level, context) => {
      context?.restore();
    },
    onMutate: (level: GroupPermissionLevel) =>
      optimisticPatch<GroupProfilePanelDTO>(queryClient, groupPanelKey, (current) =>
        withAddPolicy(current, level),
      ),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: groupPanelKey });
    },
  });

  const runDangerAction = async (kind: DangerActionKind): Promise<void> => {
    switch (kind) {
      case "clearHistory":
        await clearGroupHistoryRequest(conversationId);
        await queryClient.invalidateQueries({ queryKey: dmQueryKeys.root });
        return;
      case "leaveGroup": {
        const selfUserId = await resolveViewerMemberId(conversationId, {
          seed: queryClient.getQueryData<GroupMemberPage>(
            groupProfileQueryKeys.members(conversationId),
          ),
        });

        if (!selfUserId) {
          throw new Error("Viewer is not a member of this conversation");
        }

        await removeGroupMemberRequest(conversationId, selfUserId);
        await queryClient.invalidateQueries({ queryKey: dmQueryKeys.root });
        return;
      }
      case "deleteGroup":
        await deleteGroupConversationRequest(conversationId);
        await queryClient.invalidateQueries({ queryKey: dmQueryKeys.root });
        return;
      case "block": {
        const userId = dmPanel.data?.userId;

        if (!userId) {
          throw new Error("Profile is not loaded");
        }

        await blockFriendRequest(userId);
        await queryClient.invalidateQueries({ queryKey: friendsQueryKeys.root });
        return;
      }
      default: {
        const userId = dmPanel.data?.userId;

        if (!userId) {
          throw new Error("Profile is not loaded");
        }

        // Tasarımda `Bildir` tek satırdır, sebep seçici yok; sözlükte de sebep
        // etiketleri bulunmuyor. Kayıt bu yüzden `other` ile açılıyor ve
        // ayrıntıyı moderasyon ekibi vakadan okuyor.
        await reportUserRequest(userId, { reason: "other" });
      }
    }
  };

  const dangerMutation = useMutation({
    mutationFn: runDangerAction,
    onError: () => {
      setBusyKind(null);
      emit(dangerToast());
    },
    onMutate: (kind: DangerActionKind) => {
      setBusyKind(kind);
    },
    onSuccess: (_result, kind) => {
      setBusyKind(null);
      emit(
        kind === "block"
          ? successToast(DANGER_TOAST_KIND[kind], { name: subjectName })
          : successToast(DANGER_TOAST_KIND[kind]),
      );
    },
  });

  const notifyLabelId = `${idPrefix}-notify`;
  const privacyLabelId = `${idPrefix}-privacy`;
  const addPolicyLabelId = `${idPrefix}-add-policy`;

  const groupData = groupPanel.data;
  const viewerRole = groupData?.viewerRole;
  const canManageGroup = viewerRole === "OWNER" || viewerRole === "ADMIN";
  const dangerActions = resolveDangerActions({ variant, viewerRole });

  if (panelPending) {
    return (
      <div
        className="flex flex-col"
        data-testid="profile-settings-skeleton"
        style={{ gap: pxToRem(profilePanel.bodyGap) }}
      >
        <Skeleton style={{ height: pxToRem(profilePanel.privacyRowMinHeight) }} />
        <Skeleton style={{ height: pxToRem(profilePanel.privacyRowMinHeight * 3) }} />
      </div>
    );
  }

  if (panelFailed) {
    return (
      <p
        className="text-[hsl(var(--text-muted))]"
        data-testid="profile-settings-error"
        style={{ fontSize: pxToRem(profilePanel.notifySubFontSize) }}
      >
        {t("messages.profile.error.load")}
      </p>
    );
  }

  return (
    <div
      className="flex flex-col"
      data-testid="profile-tab-settings"
      style={{ gap: pxToRem(profilePanel.bodyGap) }}
    >
      <Section labelId={notifyLabelId} labelKey="messages.profile.section.notifications">
        <NotificationChoiceCards
          disabled={notifyMutation.isPending}
          labelledById={notifyLabelId}
          onSelect={(level) => {
            if (level !== notifyLevel) {
              notifyMutation.mutate(level);
            }
          }}
          value={notifyLevel}
        />
      </Section>

      <Section labelId={privacyLabelId} labelKey="messages.profile.section.privacy">
        <PrivacySettingsCard
          disabled={privacy.isPending || privacyMutation.isPending}
          onToggle={(key, next) => privacyMutation.mutate({ key, next })}
          value={privacy.data ?? { readReceipts: true, typingIndicator: true }}
        />
      </Section>

      {isGroup && groupData ? (
        <Section labelId={addPolicyLabelId} labelKey="messages.profile.section.addPolicy">
          {/*
            Yetkisi olmayan üye segmenti **görür**, değiştiremez: kuralın kendisi
            bilgidir (§15.5.3), gizlenirse üye grubun kimin üye ekleyebildiğini
            hiç öğrenemez.
          */}
          <AddPolicySegment
            labelledById={addPolicyLabelId}
            onChange={(level) => {
              if (level !== groupData.addPolicy) {
                addPolicyMutation.mutate(level);
              }
            }}
            readOnly={!canManageGroup || addPolicyMutation.isPending}
            value={groupData.addPolicy}
          />
        </Section>
      ) : null}

      <ProfileDangerActions
        actions={dangerActions}
        busyKind={busyKind}
        onRun={(kind) => dangerMutation.mutate(kind)}
        subjectName={subjectName}
      />
    </div>
  );
}
