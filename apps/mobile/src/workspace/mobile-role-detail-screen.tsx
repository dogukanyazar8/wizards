import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { MobilePermissionKey } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import {
  mobileRoleDetailCopy,
  mobileRoleDetailPermissionLabels,
} from "../locale/mobile-workspace-copy";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import {
  Button,
  DestructiveConfirmationSheet,
  EmptyState,
  Skeleton,
  Toggle,
} from "../app/components/kit";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import {
  useMobileServerMembersInfiniteQuery,
  useMobileServerRoleOverviewQuery,
} from "./mobile-server-management-query";
import { createMobileRoleDetailStyles } from "./mobile-role-detail-screen.styles";

export interface MobileRoleDetailScreenProps {
  readonly roleId: string;
  readonly serverId: string;
  onBack(): void;
}

const ROLE_COLOR_PRESETS = [0xe0527e, 0xc77a2b, 0x4f46e5, 0x3b82f6, 0x22a366, 0x8b5cf6] as const;

const PERMISSION_ORDER: readonly MobilePermissionKey[] = [
  "ADMINISTRATOR",
  "MANAGE_SERVER",
  "MANAGE_CHANNELS",
  "MANAGE_ROLES",
  "MANAGE_MESSAGES",
  "CLEAR_CHANNEL_HISTORY",
  "VIEW_CHANNEL",
  "SEND_MESSAGES",
  "ATTACH_FILES",
  "USE_GIFS",
  "ADD_REACTIONS",
  "MENTION_EVERYONE",
  "CONNECT_VOICE",
  "SPEAK",
  "STREAM",
  "USE_VIDEO",
  "MUTE_MEMBERS",
  "DEAFEN_MEMBERS",
  "MOVE_MEMBERS",
  "MANAGE_INVITES",
  "KICK_MEMBERS",
  "BAN_MEMBERS",
  "TIMEOUT_MEMBERS",
  "VIEW_AUDIT_LOG",
];

function colorFromRole(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]!}${words[1]![0]!}`.toUpperCase();
}

export function MobileRoleDetailScreen({ onBack, roleId, serverId }: MobileRoleDetailScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileRoleDetailCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileRoleDetailStyles);
  const mutations = useMobileServerManagementMutations(apiClient);

  const rolesQuery = useMobileServerRoleOverviewQuery(apiClient, serverId, true);
  const role = rolesQuery.data?.roles.find((entry) => entry.id === roleId) ?? null;
  const membersQuery = useMobileServerMembersInfiniteQuery(apiClient, serverId);
  const members = useMemo(
    () => membersQuery.data?.pages.flatMap((page) => page.members) ?? [],
    [membersQuery.data],
  );

  const editable = role !== null && !role.isDefault && !role.managed;

  const [name, setName] = useState("");
  const [color, setColor] = useState<number>(ROLE_COLOR_PRESETS[2]);
  const [permissions, setPermissions] = useState<ReadonlySet<MobilePermissionKey>>(new Set());
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedRoleId, setSyncedRoleId] = useState<string | null>(null);

  // Hydrate the draft once the role is loaded (and re-sync if the role identity changes).
  useEffect(() => {
    if (role && syncedRoleId !== role.id) {
      setName(role.name);
      setColor(role.color);
      setPermissions(new Set(role.permissionKeys));
      setSyncedRoleId(role.id);
    }
  }, [role, syncedRoleId]);

  // Arriving from "create role" the overview cache can be one refetch behind, so
  // pull it again rather than rendering the "role not found" state.
  useEffect(() => {
    if (!role && rolesQuery.data && !rolesQuery.isFetching) {
      void rolesQuery.refetch();
    }
  }, [role, rolesQuery]);

  const togglePermission = (key: MobilePermissionKey, next: boolean) => {
    setPermissions((previous) => {
      const draft = new Set(previous);
      if (next) {
        draft.add(key);
      } else {
        draft.delete(key);
      }
      return draft;
    });
  };

  const hasChanges =
    role !== null &&
    (name.trim() !== role.name ||
      color !== role.color ||
      permissions.size !== role.permissionKeys.length ||
      role.permissionKeys.some((key) => !permissions.has(key)));

  const save = async () => {
    const nextName = name.trim();
    if (!role || !editable || nextName.length === 0 || mutations.updateRole.isPending) {
      return;
    }
    setError(null);
    try {
      await mutations.updateRole.mutateAsync({
        color,
        name: nextName,
        permissionKeys: [...permissions],
        roleId: role.id,
        serverId,
      });
    } catch {
      setError(labels.error);
    }
  };

  const remove = async () => {
    if (!role) return;
    setError(null);
    try {
      await mutations.deleteRole.mutateAsync({ roleId: role.id, serverId });
      setDeleteOpen(false);
      onBack();
    } catch {
      setError(labels.error);
      throw new Error("mobile-role-delete-failed");
    }
  };

  const toggleMemberRole = async (
    member: { actions: { canManageRoles: boolean }; id: string; roleIds: readonly string[] },
    next: boolean,
  ) => {
    if (!role || !member.actions.canManageRoles) {
      return;
    }
    const nextRoleIds = next
      ? [...member.roleIds, role.id]
      : member.roleIds.filter((id) => id !== role.id);
    setError(null);
    try {
      await mutations.updateMemberRoles.mutateAsync({
        memberId: member.id,
        roleIds: nextRoleIds,
        serverId,
      });
    } catch {
      setError(labels.error);
    }
  };

  const roleColor = role ? colorFromRole(role.color) : theme.text.primary;

  const headerNode = (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={labels.back}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.backButton}
        testID="mobile-role-detail-back"
      >
        <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.headerBody}>
        {role ? <View style={[styles.headerDot, { backgroundColor: roleColor }]} /> : null}
        <Text
          maxFontSizeMultiplier={2}
          numberOfLines={1}
          style={[styles.title, role ? { color: roleColor } : null]}
        >
          {role ? role.name : labels.loadingTitle}
        </Text>
      </View>
      {editable ? (
        <Pressable
          accessibilityLabel={labels.delete}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setDeleteOpen(true)}
          style={styles.deleteButton}
          testID="mobile-role-detail-delete"
        >
          <Ionicons color={theme.status.dangerOnInverse} name="trash-outline" size={18} />
        </Pressable>
      ) : null}
    </View>
  );

  // A freshly created role may not be in the overview cache yet; keep showing the
  // loading skeleton while the query refetches so "Rol bulunamadı" never flashes.
  if (rolesQuery.isLoading || (!role && rolesQuery.isFetching)) {
    return (
      <View style={styles.root} testID="mobile-role-detail-screen">
        {headerNode}
        <View style={[styles.card, styles.cardPadded]} testID="mobile-role-detail-skeleton">
          <Skeleton height={44} />
          <Skeleton height={36} width="60%" />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </View>
      </View>
    );
  }

  if (!role) {
    return (
      <View style={styles.root} testID="mobile-role-detail-screen">
        {headerNode}
        <EmptyState
          action={<Button label={labels.retry} onPress={() => void rolesQuery.refetch()} />}
          description={labels.error}
          style={styles.state}
          testID="mobile-role-detail-missing"
          title={labels.missingTitle}
        />
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-role-detail-screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {headerNode}

        {!editable ? (
          <Text maxFontSizeMultiplier={2} style={styles.protectedNote}>
            {labels.protected}
          </Text>
        ) : null}

        {/* Name + colour */}
        <View style={styles.sectionLabel}>
          <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
            {labels.name}
          </Text>
        </View>
        <View style={[styles.card, styles.cardPadded]}>
          <TextInput
            accessibilityLabel={labels.name}
            editable={editable}
            maxLength={48}
            onChangeText={setName}
            style={styles.input}
            testID="mobile-role-detail-name"
            value={name}
          />
          <View style={styles.colorRow}>
            {ROLE_COLOR_PRESETS.map((preset) => (
              <Pressable
                accessibilityLabel={colorFromRole(preset)}
                accessibilityRole="button"
                accessibilityState={{ disabled: !editable, selected: preset === color }}
                disabled={!editable}
                key={preset}
                onPress={() => setColor(preset)}
                style={[styles.swatch, preset === color && styles.swatchSelected]}
              >
                <View style={[styles.swatchDot, { backgroundColor: colorFromRole(preset) }]} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* Permission matrix */}
        <View style={styles.sectionLabel}>
          <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
            {labels.permissions}
          </Text>
        </View>
        <View style={styles.card}>
          {PERMISSION_ORDER.map((key, index) => (
            <View
              key={key}
              style={[styles.row, index < PERMISSION_ORDER.length - 1 && styles.rowDivider]}
            >
              <View style={styles.rowBody}>
                <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
                  {mobileRoleDetailPermissionLabels[locale][key]}
                </Text>
              </View>
              <Toggle
                accessibilityLabel={mobileRoleDetailPermissionLabels[locale][key]}
                onValueChange={(next) => togglePermission(key, next)}
                readOnly={!editable || mutations.updateRole.isPending}
                testID={`mobile-role-permission-${key}`}
                value={permissions.has(key)}
              />
            </View>
          ))}
        </View>

        {/* Members in this role */}
        <View style={styles.sectionLabel}>
          <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
            {labels.members}
          </Text>
        </View>
        <View style={styles.card}>
          {members.length === 0 ? (
            <View style={styles.row}>
              <Text maxFontSizeMultiplier={2} style={styles.rowHint}>
                {labels.membersEmpty}
              </Text>
            </View>
          ) : (
            members.map((member, index) => {
              const hasRole = member.roleIds.includes(role.id);
              const display = member.displayName ?? member.username;
              return (
                <View
                  key={member.id}
                  style={[styles.memberRow, index < members.length - 1 && styles.rowDivider]}
                >
                  <View style={styles.memberAvatar}>
                    {member.avatarUrl ? (
                      <Image source={{ uri: member.avatarUrl }} style={styles.memberAvatarImage} />
                    ) : (
                      <Text maxFontSizeMultiplier={2} style={styles.memberInitials}>
                        {initials(display)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.rowBody}>
                    <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.memberName}>
                      {display}
                    </Text>
                    <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.memberHandle}>
                      @{member.username}
                    </Text>
                  </View>
                  <Toggle
                    accessibilityLabel={display}
                    onValueChange={(next) => void toggleMemberRole(member, next)}
                    readOnly={!member.actions.canManageRoles}
                    value={hasRole}
                  />
                </View>
              );
            })
          )}
        </View>

        {error ? (
          <View style={styles.noticeBox}>
            <Text accessibilityRole="alert" maxFontSizeMultiplier={2} style={styles.error}>
              {error}
            </Text>
          </View>
        ) : null}

        {editable ? (
          <View style={styles.saveBar}>
            <Button
              busy={mutations.updateRole.isPending}
              disabled={!hasChanges || name.trim().length === 0}
              fullWidth
              label={labels.save}
              onPress={() => void save()}
              testID="mobile-role-detail-save"
            />
          </View>
        ) : null}
      </ScrollView>

      <DestructiveConfirmationSheet
        body={labels.deleteBody}
        busy={mutations.deleteRole.isPending}
        confirmLabel={labels.delete}
        icon="trash-outline"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
        open={deleteOpen}
        testID="mobile-role-detail-delete-confirm"
        title={labels.delete}
      />
    </View>
  );
}
