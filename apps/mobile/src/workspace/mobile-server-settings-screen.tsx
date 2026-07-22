import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { MOBILE_SERVER_ATTACHMENT_MAX_BYTES } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import {
  BottomSheet,
  Button,
  DestructiveConfirmationSheet,
  Skeleton,
  Toggle,
} from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileImageUpload } from "../media/use-mobile-image-upload";
import {
  confirmMobileServerIconPersisted,
  patchMobileServerIconCaches,
} from "../query/mobile-server-cache";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileWorkspaceQuery } from "../query/mobile-workspace-query";
import {
  useMobileAssignableRolesQuery,
  useMobileServerInvitesQuery,
} from "./mobile-server-management-query";
import { createMobileServerSettingsStyles } from "./mobile-server-settings-screen.styles";
import { mobileCopy } from "../locale/mobile-copy";

export interface MobileServerSettingsScreenProps {
  readonly serverId: string;
  onBack(): void;
  onOpenChannelSettings?(channelId: string): void;
  onOpenInvites?(): void;
  onOpenMembers(): void;
  onOpenRoles?(): void;
}

type EditorField = "description" | "name" | "shortName";

const UPLOAD_MAX_MB = Math.round(MOBILE_SERVER_ATTACHMENT_MAX_BYTES / 1_000_000);

function deriveInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase();
  }
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

/** The field editor reuses the row labels it was opened from. */
function getServerFieldLabel(
  labels: (typeof mobileCopy)[keyof typeof mobileCopy],
  field: "description" | "name" | "shortName",
): string {
  if (field === "description") {
    return labels.serverSettingsDescription;
  }
  return field === "shortName" ? labels.serverSettingsShortName : labels.serverSettingsName;
}

export function MobileServerSettingsScreen({
  onBack,
  onOpenInvites,
  onOpenMembers,
  onOpenRoles,
  serverId,
}: MobileServerSettingsScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerSettingsStyles);
  const queryClient = useQueryClient();

  const workspace = useMobileWorkspaceQuery(apiClient, serverId);
  const mutations = useMobileServerManagementMutations(apiClient);
  const { isBusy: isUploadingIcon, selectAndUpload } = useMobileImageUpload();

  const detail = workspace.data?.detail;
  const server = detail?.server;
  const capabilities = detail?.capabilities;
  const canManageServer = capabilities?.canManageServer === true;
  const canManageRoles = capabilities?.canManageRoles === true;
  const canManageInvites = capabilities?.canManageInvites === true;
  const canDeleteServer = capabilities?.canDeleteServer === true;
  const canOpenMembers = canManageRoles || capabilities?.canKickMembers === true;
  const canOpenRoles = canManageRoles && onOpenRoles !== undefined;
  const canOpenInvites = canManageInvites && onOpenInvites !== undefined;

  const rolesQuery = useMobileAssignableRolesQuery(apiClient, serverId, canManageRoles);
  const invitesQuery = useMobileServerInvitesQuery(apiClient, serverId, canManageInvites);
  const roleCount = canManageRoles ? rolesQuery.data?.roles.length : undefined;
  const inviteCount = canManageInvites ? invitesQuery.data?.invites.length : undefined;

  const [editorField, setEditorField] = useState<EditorField | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [iconPreviewUri, setIconPreviewUri] = useState<string | null>(null);
  const [failedIconUri, setFailedIconUri] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setNotice(null);
  }, [locale]);

  const shownIcon = iconPreviewUri ?? server?.iconUrl ?? null;
  const isIconBroken = shownIcon !== null && shownIcon === failedIconUri;
  const initials = useMemo(
    () => (server ? (server.shortName?.toUpperCase() ?? deriveInitials(server.name)) : ""),
    [server],
  );

  const openEditor = (field: EditorField) => {
    if (!server || !canManageServer) {
      return;
    }
    setError(null);
    setNotice(null);
    setDraft(
      field === "name"
        ? server.name
        : field === "shortName"
          ? (server.shortName ?? "")
          : (server.description ?? ""),
    );
    setEditorField(field);
  };

  const saveEditor = async () => {
    if (!editorField || !server || mutations.updateServer.isPending) {
      return;
    }
    const value = draft.trim();
    if (editorField === "name" && (value.length < 2 || value.length > 64)) {
      return;
    }
    try {
      await mutations.updateServer.mutateAsync({
        serverId,
        ...(editorField === "name" ? { name: value } : {}),
        ...(editorField === "shortName" ? { shortName: value.length > 0 ? value : null } : {}),
        ...(editorField === "description" ? { description: value.length > 0 ? value : null } : {}),
      });
      setEditorField(null);
      setNotice(labels.serverSettingsSaved);
    } catch {
      setError(labels.serverSettingsError);
    }
  };

  const togglePermission = async (key: "allowFileUploads" | "allowGifs", next: boolean) => {
    if (!server || !canManageServer) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await mutations.updateServer.mutateAsync({ serverId, [key]: next });
    } catch {
      setError(labels.serverSettingsError);
    }
  };

  const uploadIcon = async () => {
    if (!capabilities?.canUploadServerIcon || isUploadingIcon) {
      return;
    }
    setError(null);
    setNotice(null);
    setFailedIconUri(null);
    let outcome;
    try {
      outcome = await selectAndUpload(
        { purpose: "server-icon", targetServerId: serverId },
        setIconPreviewUri,
      );
    } catch {
      setIconPreviewUri(null);
      setError(labels.serverSettingsError);
      return;
    }
    if (outcome.status === "cancelled") {
      setIconPreviewUri(null);
      return;
    }
    if (
      outcome.status !== "claimed" ||
      outcome.response.purpose !== "server-icon" ||
      outcome.response.server.id !== serverId
    ) {
      setIconPreviewUri(null);
      setError(outcome.status === "error" ? outcome.message : labels.serverSettingsError);
      return;
    }
    const claimedIconUrl = outcome.response.server.iconUrl;
    patchMobileServerIconCaches({ iconUrl: claimedIconUrl, queryClient, serverId });
    setIconPreviewUri(claimedIconUrl);

    // Read the icon back from the API before claiming success: the optimistic patch
    // above would otherwise keep showing an icon the backend never stored.
    const persisted = await confirmMobileServerIconPersisted({
      client: apiClient,
      iconUrl: claimedIconUrl,
      queryClient,
      serverId,
    });

    setIconPreviewUri(null);

    if (!persisted) {
      setError(labels.serverSettingsIconNotPersisted);
      return;
    }

    void queryClient.invalidateQueries({ exact: true, queryKey: mobileQueryKeys.bootstrap() });
    setNotice(labels.serverSettingsSaved);
  };

  const deleteServer = async () => {
    if (!server) {
      return;
    }
    setError(null);
    try {
      await mutations.deleteServer.mutateAsync({ name: server.name, serverId });
      setDeleteOpen(false);
      onBack();
    } catch {
      setError(labels.serverSettingsError);
      throw new Error("mobile-server-delete-failed");
    }
  };

  if (workspace.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-settings-screen">
        <View style={styles.header}>
          <View style={styles.backButton}>
            <MobileLineIcon
              color={theme.text.primary}
              name="back-arrow"
              size={18}
              strokeWidth={2.2}
            />
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.headerTitle}>
            {labels.serverSettingsTitle}
          </Text>
        </View>
        <View style={styles.skeletonCard} testID="mobile-server-settings-skeleton">
          <View style={styles.skeletonRow}>
            <Skeleton borderRadius={22} height={62} width={62} />
            <View style={{ flex: 1, gap: 8 }}>
              <Skeleton height={16} width="55%" />
              <Skeleton height={12} width="72%" />
            </View>
          </View>
          <Skeleton borderRadius={14} height={44} />
        </View>
        <View style={styles.skeletonCard}>
          <Skeleton height={38} width="40%" />
          <Skeleton borderRadius={13} height={38} />
          <Skeleton borderRadius={13} height={38} />
        </View>
      </View>
    );
  }

  if (!server || workspace.isError) {
    return (
      <View style={styles.root} testID="mobile-server-settings-screen">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={labels.serverSettingsBack}
            accessibilityRole="button"
            hitSlop={8}
            onPress={onBack}
            style={styles.backButton}
            testID="mobile-server-settings-back"
          >
            <MobileLineIcon
              color={theme.text.primary}
              name="back-arrow"
              size={18}
              strokeWidth={2.2}
            />
          </Pressable>
          <Text maxFontSizeMultiplier={2} style={styles.headerTitle}>
            {labels.serverSettingsTitle}
          </Text>
        </View>
        <View style={styles.centered}>
          <Text
            accessibilityRole="alert"
            maxFontSizeMultiplier={2}
            style={styles.error}
            testID="mobile-server-settings-error"
          >
            {labels.serverSettingsError}
          </Text>
          <Button
            label={labels.serverSettingsRetry}
            onPress={() => void workspace.refetch()}
            variant="secondary"
          />
        </View>
      </View>
    );
  }

  const chevron = <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={16} />;
  const soonBadge = (
    <View style={styles.soonBadge}>
      <Text maxFontSizeMultiplier={2} style={styles.soonBadgeText}>
        {labels.serverSettingsSoon}
      </Text>
    </View>
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.root}
      testID="mobile-server-settings-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={labels.serverSettingsBack}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={styles.backButton}
          testID="mobile-server-settings-back"
        >
          <MobileLineIcon
            color={theme.text.primary}
            name="back-arrow"
            size={18}
            strokeWidth={2.2}
          />
        </Pressable>
        <View style={styles.headerText}>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.headerTitle}>
            {labels.serverSettingsTitle}
          </Text>
          <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.headerSubtitle}>
            {`${server.name} · ${labels.serverSettingsAdminsOnly}`}
          </Text>
        </View>
      </View>

      {/* Feedback sits directly under the header: at the end of this scroll view the
          user never saw a failed icon upload and read it as a stale cache. */}
      {error || isIconBroken ? (
        <View style={styles.feedbackWrap}>
          <Text
            accessibilityRole="alert"
            maxFontSizeMultiplier={2}
            style={styles.error}
            testID="mobile-server-settings-error"
          >
            {error ?? labels.serverSettingsIconLoadFailed}
          </Text>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.feedbackWrap}>
          <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={2} style={styles.notice}>
            {notice}
          </Text>
        </View>
      ) : null}

      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.profileTop}>
          <View style={styles.iconWrap}>
            <View style={styles.icon}>
              {shownIcon && !isIconBroken ? (
                <Image
                  onError={() => setFailedIconUri(shownIcon)}
                  source={{ uri: shownIcon }}
                  style={styles.iconImage}
                  testID="mobile-server-icon-image"
                />
              ) : (
                <Text maxFontSizeMultiplier={2} style={styles.iconInitials}>
                  {initials}
                </Text>
              )}
            </View>
            {capabilities?.canUploadServerIcon ? (
              <Pressable
                accessibilityLabel={labels.serverSettingsChangeIcon}
                accessibilityRole="button"
                accessibilityState={{ busy: isUploadingIcon }}
                hitSlop={10}
                onPress={() => void uploadIcon()}
                style={styles.cameraBadge}
                testID="mobile-server-icon-picker"
              >
                <MobileLineIcon color={theme.text.onInverse} name="camera" size={13} />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.profileInfo}>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.profileName}>
              {server.name}
            </Text>
            <View style={styles.countsRow}>
              <Text maxFontSizeMultiplier={2} style={styles.countText}>
                {`${server.memberCount} ${labels.serverSettingsMembersSuffix}`}
              </Text>
              <View style={styles.countDot} />
              <View style={styles.onlineDot} />
              <Text maxFontSizeMultiplier={2} style={styles.countText}>
                {`${server.onlineMemberCount} ${labels.serverSettingsOnlineSuffix}`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.pillsRow}>
          <Pressable
            accessibilityLabel={labels.serverSettingsName}
            accessibilityRole="button"
            disabled={!canManageServer}
            onPress={() => openEditor("name")}
            style={styles.pill}
            testID="mobile-server-name-pill"
          >
            <View style={styles.pillBody}>
              <Text maxFontSizeMultiplier={2} style={styles.pillLabel}>
                {labels.serverSettingsName}
              </Text>
              <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.pillValue}>
                {server.name}
              </Text>
            </View>
            {canManageServer ? (
              <MobileLineIcon color={theme.text.visualFaint} name="edit" size={14} />
            ) : null}
          </Pressable>
          <Pressable
            accessibilityLabel={labels.serverSettingsShortName}
            accessibilityRole="button"
            disabled={!canManageServer}
            onPress={() => openEditor("shortName")}
            style={[styles.pill, styles.pillShort]}
            testID="mobile-server-short-name-pill"
          >
            <View style={styles.pillBody}>
              <Text maxFontSizeMultiplier={2} style={styles.pillLabel}>
                {labels.serverSettingsShortName}
              </Text>
              <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.pillValue}>
                {server.shortName ?? initials}
              </Text>
            </View>
            {canManageServer ? (
              <MobileLineIcon color={theme.text.visualFaint} name="edit" size={14} />
            ) : null}
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel={labels.serverSettingsDescription}
          accessibilityRole="button"
          disabled={!canManageServer}
          onPress={() => openEditor("description")}
          style={styles.descPill}
          testID="mobile-server-description-pill"
        >
          <Text maxFontSizeMultiplier={2} style={styles.pillLabel}>
            {labels.serverSettingsDescription}
          </Text>
          <Text
            maxFontSizeMultiplier={2}
            style={[styles.descValue, !server.description && styles.descPlaceholder]}
          >
            {server.description ?? labels.serverSettingsDescriptionEmpty}
          </Text>
        </Pressable>
      </View>

      {/* Content permissions */}
      <View style={styles.sectionLabel}>
        <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
          {labels.serverSettingsContentPermissions}
        </Text>
      </View>
      <View style={styles.card}>
        <View style={[styles.row, styles.rowDivider]}>
          <View style={[styles.tile, styles.tileAccent]}>
            <Text maxFontSizeMultiplier={2} style={styles.tileGifText}>
              GIF
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
              {labels.serverSettingsGifSharing}
            </Text>
            <Text maxFontSizeMultiplier={2} style={styles.rowSubtitle}>
              {labels.serverSettingsGifSharingHint}
            </Text>
          </View>
          <Toggle
            accessibilityLabel={labels.serverSettingsGifSharing}
            disabled={!canManageServer || mutations.updateServer.isPending}
            onValueChange={(next) => void togglePermission("allowGifs", next)}
            testID="mobile-server-gif-toggle"
            value={server.allowGifs}
          />
        </View>
        <View style={[styles.row, styles.rowDivider]}>
          <View style={[styles.tile, styles.tileSuccess]}>
            <MobileLineIcon color={theme.status.visualText} name="file" size={17} />
          </View>
          <View style={styles.rowBody}>
            <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
              {labels.serverSettingsFileUploads}
            </Text>
            <Text maxFontSizeMultiplier={2} style={styles.rowSubtitle}>
              {labels.serverSettingsFileUploadsHint.replace("{size}", String(UPLOAD_MAX_MB))}
            </Text>
          </View>
          <Toggle
            accessibilityLabel={labels.serverSettingsFileUploads}
            disabled={!canManageServer || mutations.updateServer.isPending}
            onValueChange={(next) => void togglePermission("allowFileUploads", next)}
            testID="mobile-server-file-toggle"
            value={server.allowFileUploads}
          />
        </View>
        {/* Slow mode has no mobile backend — surfaced disabled per handoff scope. */}
        <View style={[styles.row, styles.rowDisabled]}>
          <View style={[styles.tile, styles.tileNeutral]}>
            <MobileLineIcon color={theme.text.visualFaint} name="clock" size={17} />
          </View>
          <View style={styles.rowBody}>
            <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
              {labels.serverSettingsSlowMode}
            </Text>
            <Text maxFontSizeMultiplier={2} style={styles.rowSubtitle}>
              {labels.serverSettingsSlowModeHint}
            </Text>
          </View>
          {soonBadge}
        </View>
      </View>

      {/* Management */}
      <View style={styles.sectionLabel}>
        <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
          {labels.serverSettingsManagement}
        </Text>
      </View>
      <View style={styles.card}>
        <Pressable
          accessibilityLabel={labels.serverSettingsRoles}
          accessibilityRole="button"
          disabled={!canOpenRoles}
          onPress={onOpenRoles}
          style={({ pressed }) => [
            styles.row,
            styles.rowDivider,
            pressed && canOpenRoles && styles.rowPressed,
          ]}
          testID="mobile-server-roles-row"
        >
          <View style={[styles.tile, styles.tileAccent]}>
            <MobileLineIcon color={theme.accent.default} name="shield" size={17} />
          </View>
          <Text maxFontSizeMultiplier={2} style={[styles.rowTitle, styles.rowLabelOnly]}>
            {labels.serverSettingsRoles}
          </Text>
          {roleCount !== undefined ? (
            <Text maxFontSizeMultiplier={2} style={styles.rowValue}>
              {roleCount}
            </Text>
          ) : null}
          {chevron}
        </Pressable>

        <Pressable
          accessibilityLabel={labels.serverSettingsMembers}
          accessibilityRole="button"
          disabled={!canOpenMembers}
          onPress={onOpenMembers}
          style={({ pressed }) => [
            styles.row,
            styles.rowDivider,
            pressed && canOpenMembers && styles.rowPressed,
          ]}
          testID="mobile-server-members-row"
        >
          <View style={[styles.tile, styles.tileSuccess]}>
            <MobileLineIcon color={theme.status.visualText} name="members" size={17} />
          </View>
          <Text maxFontSizeMultiplier={2} style={[styles.rowTitle, styles.rowLabelOnly]}>
            {labels.serverSettingsMembers}
          </Text>
          <Text maxFontSizeMultiplier={2} style={styles.rowValue}>
            {server.memberCount}
          </Text>
          {chevron}
        </Pressable>

        <Pressable
          accessibilityLabel={labels.serverSettingsInvites}
          accessibilityRole="button"
          disabled={!canOpenInvites}
          onPress={onOpenInvites}
          style={({ pressed }) => [
            styles.row,
            styles.rowDivider,
            pressed && canOpenInvites && styles.rowPressed,
          ]}
          testID="mobile-server-invites-row"
        >
          <View style={[styles.tile, styles.tileAccent]}>
            <MobileLineIcon color={theme.accent.default} name="external-link" size={17} />
          </View>
          <Text maxFontSizeMultiplier={2} style={[styles.rowTitle, styles.rowLabelOnly]}>
            {labels.serverSettingsInvites}
          </Text>
          {inviteCount !== undefined ? (
            <Text maxFontSizeMultiplier={2} style={styles.rowValue}>
              {labels.serverSettingsInvitesActive.replace("{count}", String(inviteCount))}
            </Text>
          ) : null}
          {chevron}
        </Pressable>

        {/* Audit log has no mobile endpoint — surfaced disabled per handoff scope. */}
        <View style={[styles.row, styles.rowDisabled]}>
          <View style={[styles.tile, styles.tileNeutral]}>
            <MobileLineIcon color={theme.text.visualSecondary} name="audit-log" size={17} />
          </View>
          <Text maxFontSizeMultiplier={2} style={[styles.rowTitle, styles.rowLabelOnly]}>
            {labels.serverSettingsAuditLog}
          </Text>
          {soonBadge}
        </View>
      </View>

      {/* Danger */}
      <View style={[styles.card, styles.cardSpaced]}>
        {canDeleteServer ? (
          <Pressable
            accessibilityLabel={labels.serverSettingsDeleteServer}
            accessibilityRole="button"
            onPress={() => setDeleteOpen(true)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            testID="mobile-server-delete-open"
          >
            <View style={[styles.tile, styles.tileDanger]}>
              <MobileLineIcon color={theme.status.dangerOnInverse} name="log-out" size={17} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.dangerLabel}>
              {labels.serverSettingsDeleteServer}
            </Text>
          </Pressable>
        ) : (
          <View style={[styles.row, styles.rowDisabled]} testID="mobile-server-leave-disabled">
            <View style={[styles.tile, styles.tileDanger]}>
              <MobileLineIcon color={theme.status.dangerOnInverse} name="log-out" size={17} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.dangerLabel}>
              {labels.serverSettingsLeave}
            </Text>
            {soonBadge}
          </View>
        )}
      </View>

      <BottomSheet
        accessibilityLabel={
          editorField
            ? getServerFieldLabel(labels, editorField)
            : labels.serverSettingsTitle
        }
        onClose={() => setEditorField(null)}
        open={editorField !== null}
        snapPoint={editorField === "description" ? 360 : 300}
        testID="mobile-server-field-editor"
      >
        <View style={styles.sheet}>
          <Text maxFontSizeMultiplier={2} style={styles.sheetTitle}>
            {editorField === "name"
              ? labels.serverSettingsName
              : editorField === "shortName"
                ? labels.serverSettingsShortName
                : labels.serverSettingsDescription}
          </Text>
          <TextInput
            accessibilityLabel={
              editorField === "name"
                ? labels.serverSettingsName
                : editorField === "shortName"
                  ? labels.serverSettingsShortName
                  : labels.serverSettingsDescription
            }
            autoFocus
            maxLength={editorField === "shortName" ? 8 : editorField === "name" ? 64 : 160}
            multiline={editorField === "description"}
            onChangeText={setDraft}
            style={[styles.input, editorField === "description" && styles.inputMultiline]}
            testID="mobile-server-field-editor-input"
            value={draft}
          />
          <View style={styles.sheetActions}>
            <View style={styles.sheetAction}>
              <Button
                fullWidth
                label={labels.serverSettingsCancel}
                onPress={() => setEditorField(null)}
                variant="secondary"
              />
            </View>
            <View style={styles.sheetAction}>
              <Button
                busy={mutations.updateServer.isPending}
                fullWidth
                label={labels.serverSettingsSave}
                onPress={() => void saveEditor()}
                testID="mobile-server-field-editor-save"
              />
            </View>
          </View>
        </View>
      </BottomSheet>

      <DestructiveConfirmationSheet
        body={labels.serverSettingsDeleteBody}
        busy={mutations.deleteServer.isPending}
        confirmLabel={labels.serverSettingsDeleteServer}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={deleteServer}
        open={deleteOpen}
        requiredText={server.name}
        testID="mobile-server-delete-confirm"
        title={labels.serverSettingsDeleteServer}
      />
    </ScrollView>
  );
}
