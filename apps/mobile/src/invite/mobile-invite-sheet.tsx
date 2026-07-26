import Ionicons from "@expo/vector-icons/Ionicons";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import {
  MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
  MOBILE_INVITE_SHEET_EXPIRY_OPTIONS,
  MOBILE_INVITE_SHEET_MAX_USES_OPTIONS,
  type MobileServerInvite,
  type MobileServerInviteSheetFriend,
  type MobileServerPendingInvite,
  type MobileUserSearchResult,
} from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { BottomSheet, Skeleton, useSheetPresentation, useToast } from "../app/components/kit";
import { AvatarMark } from "../app/components/ui-atoms";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { mobileCopy } from "../locale/mobile-copy";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileUserSearchQuery } from "../social/mobile-social-query";
import { useMobileServerInviteSheetQuery } from "../workspace/mobile-server-management-query";
import { fetchMobileServerInviteQrCode } from "../workspace/mobile-server-management-client";
import { MobileInviteMessageSheet } from "./mobile-invite-message-sheet";
import {
  MOBILE_INVITE_COPY_FEEDBACK_MS,
  MOBILE_INVITE_SEARCH_DEBOUNCE_MS,
  formatMobileInviteFriendSubtitle,
  formatMobileInviteMeta,
  formatMobileInvitePendingSubtitle,
  formatMobileInviteResultSubtitle,
  getMobileInviteResultEmphasis,
  getMobileInviteRowAction,
  sortMobileInviteFriends,
  splitMobileUsernameMatch,
  type MobileInviteResultEmphasis,
  type MobileInviteRowAction,
} from "./mobile-invite-sheet-model";
import { shareMobileInviteUrl } from "./mobile-invite-share";
import { createMobileInviteSheetStyles } from "./mobile-invite-sheet.styles";

type InviteLabels = (typeof mobileCopy)[keyof typeof mobileCopy];
type InviteTab = "link" | "username";
type InviteOverlay = "edit" | "message" | "none" | "qr";

export interface MobileInviteSheetProps {
  /** Admin-only affordances: "Düzenle" and "Yönet". */
  readonly canManageServer: boolean;
  onClose(): void;
  onOpenInviteManagement(): void;
  readonly open: boolean;
  readonly serverId: string | null;
  readonly serverName: string;
}

function buildMetaLabels(labels: InviteLabels) {
  return {
    durationDays: labels.inviteSheetDurationDays,
    durationHours: labels.inviteSheetDurationHours,
    durationMinutes: labels.inviteSheetDurationMinutes,
    expiresIn: labels.inviteSheetMetaExpiresIn,
    limitedUses: labels.inviteSheetMetaLimitedUses,
    neverExpires: labels.inviteSheetMetaNeverExpires,
    unlimitedUses: labels.inviteSheetMetaUnlimitedUses,
  };
}

function expiryOptionLabel(labels: InviteLabels, hours: number | null): string {
  if (hours === null) {
    return labels.inviteSheetEditExpiryNever;
  }
  if (hours === 1) {
    return labels.inviteSheetEditExpiryHour;
  }
  return hours === 24 ? labels.inviteSheetEditExpiryDay : labels.inviteSheetEditExpiryWeek;
}

function maxUsesOptionLabel(labels: InviteLabels, maxUses: number | null): string {
  if (maxUses === null) {
    return labels.inviteSheetEditUsesUnlimited;
  }
  if (maxUses === 1) {
    return labels.inviteSheetEditUsesOne;
  }
  return maxUses === 10 ? labels.inviteSheetEditUsesTen : labels.inviteSheetEditUsesFifty;
}

/**
 * Handoff 2a/2b — "Davet et".
 *
 * One sheet, two segments: a shareable link with its lifetime and quick
 * actions, and a username search that sends a targeted invite. Both tabs read
 * the same server-scoped payload, so a friend invited from 2a already shows as
 * pending in 2b without a second fetch.
 */
export function MobileInviteSheet({
  canManageServer,
  onClose,
  onOpenInviteManagement,
  open,
  serverId,
  serverName,
}: MobileInviteSheetProps) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();
  const presentation = useSheetPresentation();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const { apiClient } = useMobileAuth();
  const { showToast } = useToast();
  const mutations = useMobileServerManagementMutations(apiClient);

  const [tab, setTab] = useState<InviteTab>("link");
  const [overlay, setOverlay] = useState<InviteOverlay>("none");
  const [isCopied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [draftExpiresInHours, setDraftExpiresInHours] = useState<number | null>(
    MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
  );
  const [draftMaxUses, setDraftMaxUses] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreateServerIdRef = useRef<string | null>(null);

  const sheetQuery = useMobileServerInviteSheetQuery(apiClient, serverId ?? "", open);
  const linkInvite = sheetQuery.data?.linkInvite ?? null;
  const friends = useMemo(
    () => sortMobileInviteFriends(sheetQuery.data?.friends ?? []),
    [sheetQuery.data?.friends],
  );
  const pendingInvites = sheetQuery.data?.pendingInvites ?? [];

  const searchQuery = useMobileUserSearchQuery(
    apiClient,
    debouncedTerm,
    open && tab === "username" && serverId !== null,
    serverId ?? undefined,
  );
  const results = searchQuery.data?.results ?? [];

  // The sheet always opens on the link tab; the tab only persists while open.
  useEffect(() => {
    if (open) {
      return;
    }

    setTab("link");
    setOverlay("none");
    setSearchTerm("");
    setDebouncedTerm("");
    setQrDataUrl(null);
    setCopied(false);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTerm(searchTerm), MOBILE_INVITE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  /**
   * No live reusable link means the server has none left, so the sheet mints
   * the 7-day default on open rather than making the user tap first. Guarded by
   * a ref so a re-render during the create does not fire a second one.
   */
  const createInvite = mutations.createInvite;
  useEffect(() => {
    if (
      !open ||
      !serverId ||
      sheetQuery.isPending ||
      sheetQuery.isError ||
      linkInvite !== null ||
      autoCreateServerIdRef.current === serverId
    ) {
      return;
    }

    autoCreateServerIdRef.current = serverId;
    createInvite
      .mutateAsync({
        request: {
          expiresInHours: MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
          maxUses: null,
        },
        serverId,
      })
      .catch(() => {
        autoCreateServerIdRef.current = null;
        showToast({ message: labels.inviteSheetLinkUnavailable, tone: "danger" });
      });
  }, [
    createInvite,
    labels.inviteSheetLinkUnavailable,
    linkInvite,
    open,
    serverId,
    sheetQuery.isError,
    sheetQuery.isPending,
    showToast,
  ]);

  useEffect(() => {
    if (!open) {
      autoCreateServerIdRef.current = null;
    }
  }, [open]);

  const handleCopy = useCallback(async () => {
    if (!linkInvite) {
      return;
    }

    try {
      await Clipboard.setStringAsync(linkInvite.shareUrl);
      setCopied(true);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => setCopied(false), MOBILE_INVITE_COPY_FEEDBACK_MS);
    } catch {
      showToast({ message: labels.inviteSheetCopyFailed, tone: "danger" });
    }
  }, [labels.inviteSheetCopyFailed, linkInvite, showToast]);

  const handleShare = useCallback(async () => {
    if (!linkInvite) {
      return;
    }

    try {
      await shareMobileInviteUrl(linkInvite.shareUrl);
    } catch {
      showToast({ message: labels.inviteSheetShareFailed, tone: "danger" });
    }
  }, [labels.inviteSheetShareFailed, linkInvite, showToast]);

  const handleOpenQr = useCallback(async () => {
    if (!linkInvite || !serverId) {
      return;
    }

    setOverlay("qr");
    try {
      const response = await fetchMobileServerInviteQrCode(apiClient, {
        inviteId: linkInvite.id,
        serverId,
      });
      setQrDataUrl(response.qrCodeDataUrl);
    } catch {
      setOverlay("none");
      showToast({ message: labels.inviteSheetQrFailed, tone: "danger" });
    }
  }, [apiClient, labels.inviteSheetQrFailed, linkInvite, serverId, showToast]);

  const handleOpenEdit = useCallback(() => {
    setDraftExpiresInHours(
      linkInvite?.expiresAt === null || linkInvite === null
        ? null
        : MOBILE_INVITE_SHEET_DEFAULT_EXPIRES_IN_HOURS,
    );
    setDraftMaxUses(linkInvite?.maxUses ?? null);
    setOverlay("edit");
  }, [linkInvite]);

  const handleSubmitEdit = useCallback(async () => {
    if (!serverId) {
      return;
    }

    try {
      await mutations.updateLinkInvite.mutateAsync({
        expiresInHours: draftExpiresInHours,
        maxUses: draftMaxUses,
        serverId,
      });
      setOverlay("none");
    } catch {
      showToast({ message: labels.inviteSheetEditFailed, tone: "danger" });
    }
  }, [
    draftExpiresInHours,
    draftMaxUses,
    labels.inviteSheetEditFailed,
    mutations.updateLinkInvite,
    serverId,
    showToast,
  ]);

  const handleInviteUser = useCallback(
    async (userId: string) => {
      if (!serverId) {
        return;
      }

      try {
        await mutations.createTargetedInvite.mutateAsync({ serverId, userId });
      } catch {
        showToast({ message: labels.inviteSheetInviteFailed, tone: "danger" });
      }
    },
    [labels.inviteSheetInviteFailed, mutations.createTargetedInvite, serverId, showToast],
  );

  const handleRevokeInvite = useCallback(
    async (inviteId: string) => {
      if (!serverId) {
        return;
      }

      try {
        await mutations.deleteInvite.mutateAsync({ inviteId, serverId });
      } catch {
        showToast({ message: labels.inviteSheetRevokeFailed, tone: "danger" });
      }
    },
    [labels.inviteSheetRevokeFailed, mutations.deleteInvite, serverId, showToast],
  );

  const now = Date.now();
  const metaLabels = buildMetaLabels(labels);

  return (
    <>
      <BottomSheet
        accessibilityLabel={labels.inviteSheetTitle}
        onClose={onClose}
        open={open && overlay !== "message"}
        presentation={presentation}
        sizing="content"
        testID="mobile-invite-sheet"
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>
                {labels.inviteSheetTitle}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {labels.inviteSheetSubtitle.replace("{server}", serverName)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={labels.sheetCloseAction}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              testID="mobile-invite-sheet-close"
            >
              <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
            </Pressable>
          </View>

          <View style={styles.segmented}>
            <InviteSegment
              active={tab === "link"}
              icon="link"
              label={labels.inviteSheetTabLink}
              onPress={() => setTab("link")}
              testID="mobile-invite-sheet-tab-link"
            />
            <InviteSegment
              active={tab === "username"}
              icon="person-add-outline"
              label={labels.inviteSheetTabUsername}
              onPress={() => setTab("username")}
              testID="mobile-invite-sheet-tab-username"
            />
          </View>

          {sheetQuery.isError ? (
            <Text
              accessibilityRole="alert"
              style={styles.errorText}
              testID="mobile-invite-sheet-error"
            >
              {labels.inviteSheetLinkUnavailable}
            </Text>
          ) : null}

          {tab === "link" ? (
            <LinkTab
              friends={friends}
              invite={linkInvite}
              isCopied={isCopied}
              isLoading={sheetQuery.isPending}
              labels={labels}
              canManageServer={canManageServer}
              now={now}
              onCopy={() => void handleCopy()}
              onEdit={handleOpenEdit}
              onInvite={(userId) => void handleInviteUser(userId)}
              onMessage={() => setOverlay("message")}
              onQr={() => void handleOpenQr()}
              onShare={() => void handleShare()}
            />
          ) : (
            <UsernameTab
              canManageServer={canManageServer}
              isSearching={searchQuery.isFetching}
              labels={labels}
              locale={locale}
              now={now}
              onChangeTerm={setSearchTerm}
              onInvite={(userId) => void handleInviteUser(userId)}
              onManage={onOpenInviteManagement}
              onRevoke={(inviteId) => void handleRevokeInvite(inviteId)}
              onSwitchToLink={() => setTab("link")}
              pendingInvites={pendingInvites}
              results={results}
              term={searchTerm}
            />
          )}
        </View>
      </BottomSheet>

      <BottomSheet
        accessibilityLabel={labels.inviteSheetEditTitle}
        onClose={() => setOverlay("none")}
        open={open && overlay === "edit"}
        presentation={presentation}
        sizing="content"
        testID="mobile-invite-sheet-edit"
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>
                {labels.inviteSheetEditTitle}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {labels.inviteSheetSubtitle.replace("{server}", serverName)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={labels.sheetCloseAction}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setOverlay("none")}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              testID="mobile-invite-sheet-edit-close"
            >
              <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
            </Pressable>
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.sectionLabel}>{labels.inviteSheetEditExpiryLabel}</Text>
            <View style={styles.optionChipRow}>
              {MOBILE_INVITE_SHEET_EXPIRY_OPTIONS.map((hours) => (
                <OptionChip
                  key={String(hours)}
                  label={expiryOptionLabel(labels, hours)}
                  onPress={() => setDraftExpiresInHours(hours)}
                  selected={draftExpiresInHours === hours}
                  testID={`mobile-invite-sheet-expiry-${hours ?? "never"}`}
                />
              ))}
            </View>
          </View>

          <View style={styles.optionGroup}>
            <Text style={styles.sectionLabel}>{labels.inviteSheetEditUsesLabel}</Text>
            <View style={styles.optionChipRow}>
              {MOBILE_INVITE_SHEET_MAX_USES_OPTIONS.map((maxUses) => (
                <OptionChip
                  key={String(maxUses)}
                  label={maxUsesOptionLabel(labels, maxUses)}
                  onPress={() => setDraftMaxUses(maxUses)}
                  selected={draftMaxUses === maxUses}
                  testID={`mobile-invite-sheet-uses-${maxUses ?? "unlimited"}`}
                />
              ))}
            </View>
          </View>

          <Pressable
            accessibilityLabel={labels.inviteSheetEditSubmitAction}
            accessibilityRole="button"
            accessibilityState={{ busy: mutations.updateLinkInvite.isPending }}
            disabled={mutations.updateLinkInvite.isPending}
            onPress={() => void handleSubmitEdit()}
            style={({ pressed }) => [
              styles.copyButton,
              { marginTop: 18 },
              mutations.updateLinkInvite.isPending && styles.pressed,
              pressed && styles.pressed,
            ]}
            testID="mobile-invite-sheet-edit-submit"
          >
            <Text style={styles.copyButtonText}>{labels.inviteSheetEditSubmitAction}</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet
        accessibilityLabel={labels.inviteSheetQrTitle}
        onClose={() => setOverlay("none")}
        open={open && overlay === "qr"}
        presentation={presentation}
        sizing="content"
        testID="mobile-invite-sheet-qr"
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text accessibilityRole="header" style={styles.title}>
                {labels.inviteSheetQrTitle}
              </Text>
              <Text numberOfLines={1} style={styles.subtitle}>
                {labels.inviteSheetSubtitle.replace("{server}", serverName)}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={labels.sheetCloseAction}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setOverlay("none")}
              style={({ pressed }) => [styles.close, pressed && styles.pressed]}
              testID="mobile-invite-sheet-qr-close"
            >
              <Ionicons color={theme.text.visualPlaceholder} name="close" size={18} />
            </Pressable>
          </View>
          <View style={styles.qrFrame}>
            {qrDataUrl ? (
              <Image
                accessibilityLabel={labels.inviteSheetQrTitle}
                source={{ uri: qrDataUrl }}
                style={styles.qrImage}
                testID="mobile-invite-sheet-qr-image"
              />
            ) : (
              <Skeleton height={240} width={240} />
            )}
            {linkInvite ? (
              <Text numberOfLines={1} style={styles.qrCaption}>
                {linkInvite.shareUrl}
              </Text>
            ) : null}
          </View>
        </View>
      </BottomSheet>

      <MobileInviteMessageSheet
        onClose={() => setOverlay("none")}
        open={open && overlay === "message"}
        shareUrl={linkInvite?.shareUrl ?? null}
      />
    </>
  );
}

function InviteSegment({
  active,
  icon,
  label,
  onPress,
  testID,
}: {
  readonly active: boolean;
  readonly icon: "link" | "person-add-outline";
  readonly label: string;
  onPress(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.segment, active && styles.segmentActive]}
      testID={testID}
    >
      <Ionicons
        color={active ? theme.accent.default : theme.text.visualSecondary}
        name={icon}
        size={14}
      />
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function OptionChip({
  label,
  onPress,
  selected,
  testID,
}: {
  readonly label: string;
  onPress(): void;
  readonly selected: boolean;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.optionChip, selected && styles.optionChipSelected]}
      testID={testID}
    >
      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SectionHeader({
  action,
  label,
  onPressAction,
  testID,
}: {
  readonly action?: string;
  readonly label: string;
  onPressAction?(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);

  return (
    <View style={styles.sectionHeader} testID={testID}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionRule} />
      {action && onPressAction ? (
        <Pressable
          accessibilityLabel={action}
          accessibilityRole="button"
          onPress={onPressAction}
          style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}
          testID={`${testID}-action`}
        >
          <Text style={styles.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function InviteRowAction({
  emphasis = "soft",
  labels,
  onPress,
  state,
  testID,
  withPlusIcon = false,
}: {
  readonly emphasis?: MobileInviteResultEmphasis;
  readonly labels: InviteLabels;
  onPress(): void;
  readonly state: MobileInviteRowAction;
  readonly testID: string;
  readonly withPlusIcon?: boolean;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();

  if (state === "member") {
    return (
      <View style={[styles.rowAction, styles.rowActionMember]} testID={testID}>
        <Text style={[styles.rowActionText, styles.rowActionTextMember]}>
          {labels.inviteSheetMemberAction}
        </Text>
      </View>
    );
  }

  if (state === "sent") {
    return (
      <View style={[styles.rowAction, styles.rowActionSent]} testID={testID}>
        <Ionicons color={theme.status.visualText} name="checkmark" size={12} />
        <Text style={[styles.rowActionText, styles.rowActionTextSent]}>
          {labels.inviteSheetSentAction}
        </Text>
      </View>
    );
  }

  const isFilled = emphasis === "filled";
  return (
    <Pressable
      accessibilityLabel={labels.inviteSheetInviteAction}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.rowAction,
        isFilled ? styles.rowActionFilled : styles.rowActionSoft,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {withPlusIcon ? (
        <Ionicons
          color={isFilled ? theme.text.onPrimary : theme.accent.default}
          name="add"
          size={12}
        />
      ) : null}
      <Text
        style={[
          styles.rowActionText,
          isFilled ? styles.rowActionTextFilled : styles.rowActionTextSoft,
        ]}
      >
        {labels.inviteSheetInviteAction}
      </Text>
    </Pressable>
  );
}

function LinkTab({
  canManageServer,
  friends,
  invite,
  isCopied,
  isLoading,
  labels,
  now,
  onCopy,
  onEdit,
  onInvite,
  onMessage,
  onQr,
  onShare,
}: {
  readonly canManageServer: boolean;
  readonly friends: readonly MobileServerInviteSheetFriend[];
  readonly invite: MobileServerInvite | null;
  readonly isCopied: boolean;
  readonly isLoading: boolean;
  readonly labels: InviteLabels;
  readonly now: number;
  onCopy(): void;
  onEdit(): void;
  onInvite(userId: string): void;
  onMessage(): void;
  onQr(): void;
  onShare(): void;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();
  const metaLabels = buildMetaLabels(labels);

  return (
    <View testID="mobile-invite-sheet-link-tab">
      {invite ? (
        <View style={styles.linkCard} testID="mobile-invite-sheet-link-card">
          <View style={styles.linkCardText}>
            <Text style={styles.sectionLabel}>{labels.inviteSheetLinkLabel}</Text>
            <Text
              numberOfLines={1}
              style={styles.linkValue}
              testID="mobile-invite-sheet-link-value"
            >
              {invite.shareUrl}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={
              isCopied ? labels.inviteSheetCopiedAction : labels.inviteSheetCopyAction
            }
            accessibilityRole="button"
            onPress={onCopy}
            style={({ pressed }) => [
              styles.copyButton,
              isCopied && styles.copyButtonCopied,
              pressed && styles.pressed,
            ]}
            testID="mobile-invite-sheet-copy"
          >
            <Ionicons
              color={isCopied ? theme.status.visualText : theme.text.onPrimary}
              name={isCopied ? "checkmark" : "copy-outline"}
              size={13}
            />
            <Text style={[styles.copyButtonText, isCopied && styles.copyButtonTextCopied]}>
              {isCopied ? labels.inviteSheetCopiedAction : labels.inviteSheetCopyAction}
            </Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.loadingBlock} testID="mobile-invite-sheet-link-loading">
          <Skeleton height={64} />
        </View>
      )}

      {invite ? (
        <View style={styles.metaRow}>
          <Ionicons color={theme.text.visualPlaceholder} name="time-outline" size={12} />
          <Text numberOfLines={1} style={styles.metaText} testID="mobile-invite-sheet-meta">
            {formatMobileInviteMeta(invite, metaLabels, now)}
          </Text>
          {canManageServer ? (
            <Pressable
              accessibilityLabel={labels.inviteSheetEditAction}
              accessibilityRole="button"
              onPress={onEdit}
              style={({ pressed }) => [styles.metaAction, pressed && styles.pressed]}
              testID="mobile-invite-sheet-edit-open"
            >
              <Text style={styles.metaActionText}>{labels.inviteSheetEditAction}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View style={styles.shortcutRow}>
        <InviteShortcut
          iconColor={theme.accent.default}
          iconName="share-outline"
          iconSurface={theme.accent.soft}
          label={labels.inviteSheetShareAction}
          onPress={onShare}
          testID="mobile-invite-sheet-share"
        />
        <InviteShortcut
          iconColor={theme.status.visualText}
          iconName="chatbubble-outline"
          iconSurface={theme.status.successSoft}
          label={labels.inviteSheetMessageAction}
          onPress={onMessage}
          testID="mobile-invite-sheet-message"
        />
        <InviteShortcut
          iconColor={theme.status.visualWarning}
          iconName="qr-code-outline"
          iconSurface={theme.status.visualWarningSoft}
          label={labels.inviteSheetQrAction}
          onPress={onQr}
          testID="mobile-invite-sheet-qr-open"
        />
      </View>

      <SectionHeader
        label={labels.inviteSheetFriendsLabel}
        testID="mobile-invite-sheet-friends-header"
      />

      {isLoading ? (
        <View style={styles.loadingBlock} testID="mobile-invite-sheet-friends-loading">
          <Skeleton height={48} />
          <Skeleton height={48} />
        </View>
      ) : (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.listScroll}
        >
          {friends.map((friend) => (
            <InviteFriendRow
              friend={friend}
              key={friend.id}
              labels={labels}
              now={now}
              onInvite={() => onInvite(friend.id)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function InviteShortcut({
  iconColor,
  iconName,
  iconSurface,
  label,
  onPress,
  testID,
}: {
  readonly iconColor: string;
  readonly iconName: "chatbubble-outline" | "qr-code-outline" | "share-outline";
  readonly iconSurface: string;
  readonly label: string;
  onPress(): void;
  readonly testID: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}
      testID={testID}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: iconSurface }]}>
        <Ionicons color={iconColor} name={iconName} size={14} />
      </View>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function InviteFriendRow({
  friend,
  labels,
  now,
  onInvite,
}: {
  readonly friend: MobileServerInviteSheetFriend;
  readonly labels: InviteLabels;
  readonly now: number;
  onInvite(): void;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const state = getMobileInviteRowAction(friend);
  const subtitle = formatMobileInviteFriendSubtitle(
    friend,
    {
      ...buildMetaLabels(labels),
      alreadyMember: labels.inviteSheetFriendMember,
      lastSeen: labels.inviteSheetFriendLastSeen,
      offline: labels.inviteSheetFriendOffline,
      online: labels.inviteSheetFriendOnline,
    },
    now,
  );

  return (
    <View style={styles.row} testID={`mobile-invite-sheet-friend-${friend.id}`}>
      <View style={styles.rowAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={15}
          avatarBorderWidth={0}
          dimension={40}
          identityId={friend.id}
          imageUrl={friend.avatarUrl}
          label={friend.displayName ?? friend.username}
        />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {friend.username}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.rowSubtitle,
            friend.isMember
              ? styles.rowSubtitleFaint
              : friend.status !== "OFFLINE"
                ? styles.rowSubtitleOnline
                : null,
          ]}
        >
          {subtitle}
        </Text>
      </View>
      <InviteRowAction
        labels={labels}
        onPress={onInvite}
        state={state}
        testID={`mobile-invite-sheet-friend-${friend.id}-action`}
      />
    </View>
  );
}

function UsernameTab({
  canManageServer,
  isSearching,
  labels,
  locale,
  now,
  onChangeTerm,
  onInvite,
  onManage,
  onRevoke,
  onSwitchToLink,
  pendingInvites,
  results,
  term,
}: {
  readonly canManageServer: boolean;
  readonly isSearching: boolean;
  readonly labels: InviteLabels;
  readonly locale: "en" | "tr";
  readonly now: number;
  onChangeTerm(value: string): void;
  onInvite(userId: string): void;
  onManage(): void;
  onRevoke(inviteId: string): void;
  onSwitchToLink(): void;
  readonly pendingInvites: readonly MobileServerPendingInvite[];
  readonly results: readonly MobileUserSearchResult[];
  readonly term: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const theme = useTheme();
  const trimmed = term.trim();
  const hasQuery = trimmed.length >= 2;

  return (
    <View testID="mobile-invite-sheet-username-tab">
      <View style={styles.searchField}>
        <Ionicons color={theme.text.visualPlaceholder} name="search" size={15} />
        <TextInput
          accessibilityLabel={labels.inviteSheetSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeTerm}
          placeholder={labels.inviteSheetSearchPlaceholder}
          placeholderTextColor={theme.text.visualPlaceholder}
          style={styles.searchInput}
          testID="mobile-invite-sheet-search"
          value={term}
        />
        {term.length > 0 ? (
          <Pressable
            accessibilityLabel={labels.sheetCloseAction}
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => onChangeTerm("")}
            style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
            testID="mobile-invite-sheet-search-clear"
          >
            <Ionicons color={theme.text.visualPlaceholder} name="close-circle" size={14} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.searchHint}>{labels.inviteSheetSearchHint}</Text>

      {hasQuery ? (
        <>
          <SectionHeader
            label={labels.inviteSheetResultsLabel}
            testID="mobile-invite-sheet-results-header"
          />
          {results.length === 0 && !isSearching ? (
            <View style={styles.emptyState} testID="mobile-invite-sheet-results-empty">
              <Text style={styles.emptyTitle}>{labels.inviteSheetEmptyTitle}</Text>
              <Pressable
                accessibilityLabel={labels.inviteSheetEmptyLinkAction}
                accessibilityRole="button"
                onPress={onSwitchToLink}
                style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}
                testID="mobile-invite-sheet-results-empty-link"
              >
                <Text style={styles.emptyActionText}>{labels.inviteSheetEmptyLinkAction}</Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.listScroll}
            >
              {results.map((result, index) => (
                <InviteResultRow
                  emphasis={getMobileInviteResultEmphasis({
                    index,
                    mutualServerCount: result.mutualServerCount,
                  })}
                  key={result.id}
                  labels={labels}
                  onInvite={() => onInvite(result.id)}
                  result={result}
                  term={trimmed}
                />
              ))}
            </ScrollView>
          )}
        </>
      ) : null}

      {pendingInvites.length > 0 ? (
        <>
          <SectionHeader
            {...(canManageServer
              ? { action: labels.inviteSheetManageAction, onPressAction: onManage }
              : {})}
            label={labels.inviteSheetPendingLabel}
            testID="mobile-invite-sheet-pending-header"
          />
          {pendingInvites.map((invite) => (
            <View
              key={invite.id}
              style={styles.pendingCard}
              testID={`mobile-invite-sheet-pending-${invite.id}`}
            >
              <AvatarMark
                avatarBorderRadius={12}
                avatarBorderWidth={0}
                dimension={34}
                identityId={invite.user.id}
                imageUrl={invite.user.avatarUrl}
                label={invite.user.displayName ?? invite.user.username}
                size="small"
              />
              <View style={styles.rowText}>
                <Text numberOfLines={1} style={styles.pendingTitle}>
                  {invite.user.username}
                </Text>
                <Text numberOfLines={1} style={styles.pendingSubtitle}>
                  {formatMobileInvitePendingSubtitle(
                    invite,
                    { pendingStatus: labels.inviteSheetPendingStatus },
                    locale,
                    now,
                  )}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={labels.inviteSheetRevokeAction}
                accessibilityRole="button"
                onPress={() => onRevoke(invite.id)}
                style={({ pressed }) => [styles.pendingRevoke, pressed && styles.pressed]}
                testID={`mobile-invite-sheet-pending-${invite.id}-revoke`}
              >
                <Text style={styles.pendingRevokeText}>{labels.inviteSheetRevokeAction}</Text>
              </Pressable>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function InviteResultRow({
  emphasis,
  labels,
  onInvite,
  result,
  term,
}: {
  readonly emphasis: MobileInviteResultEmphasis;
  readonly labels: InviteLabels;
  onInvite(): void;
  readonly result: MobileUserSearchResult;
  readonly term: string;
}) {
  const styles = useThemedStyles(createMobileInviteSheetStyles);
  const slices = splitMobileUsernameMatch(result.username, term);
  const state = getMobileInviteRowAction({
    isMember: result.isMember,
    pendingInviteId: result.pendingInviteId,
  });

  return (
    <View style={styles.row} testID={`mobile-invite-sheet-result-${result.id}`}>
      <View style={styles.rowAvatarWrap}>
        <AvatarMark
          avatarBorderRadius={15}
          avatarBorderWidth={0}
          dimension={40}
          identityId={result.id}
          imageUrl={result.avatarUrl}
          label={result.displayName ?? result.username}
        />
      </View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>
          {slices.prefix}
          <Text style={styles.rowTitleMatch}>{slices.match}</Text>
          {slices.suffix}
        </Text>
        <Text numberOfLines={1} style={styles.rowSubtitle}>
          {formatMobileInviteResultSubtitle(result, {
            alreadyMember: labels.inviteSheetFriendMember,
            mutualServers: labels.inviteSheetMutualServers,
            noMutualServers: labels.inviteSheetNoMutualServers,
          })}
        </Text>
      </View>
      <InviteRowAction
        emphasis={emphasis}
        labels={labels}
        onPress={onInvite}
        state={state}
        testID={`mobile-invite-sheet-result-${result.id}-action`}
        withPlusIcon
      />
    </View>
  );
}
