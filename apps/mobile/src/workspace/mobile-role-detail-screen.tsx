import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { MobilePermissionKey } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
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

const PERMISSION_LABELS: Record<MobilePermissionKey, { en: string; tr: string }> = {
  ADMINISTRATOR: { en: "Administrator (all)", tr: "Yönetici (tüm izinler)" },
  MANAGE_SERVER: { en: "Manage server", tr: "Sunucuyu yönet" },
  MANAGE_CHANNELS: { en: "Manage channels", tr: "Kanalları yönet" },
  MANAGE_ROLES: { en: "Manage roles", tr: "Rolleri yönet" },
  MANAGE_MESSAGES: { en: "Manage messages", tr: "Mesajları yönet" },
  CLEAR_CHANNEL_HISTORY: { en: "Clear channel history", tr: "Kanal geçmişini temizle" },
  ATTACH_FILES: { en: "Attach files", tr: "Dosya ekle" },
  USE_GIFS: { en: "Use GIFs", tr: "GIF kullan" },
  ADD_REACTIONS: { en: "Add reactions", tr: "Tepki ekle" },
  VIEW_CHANNEL: { en: "View channels", tr: "Kanalları gör" },
  SEND_MESSAGES: { en: "Send messages", tr: "Mesaj gönder" },
  CONNECT_VOICE: { en: "Connect to voice", tr: "Ses kanallarına katıl" },
  SPEAK: { en: "Speak", tr: "Konuş" },
  STREAM: { en: "Stream", tr: "Yayın yap" },
  USE_VIDEO: { en: "Use video", tr: "Video kullan" },
  MUTE_MEMBERS: { en: "Mute members", tr: "Üyeleri sustur" },
  DEAFEN_MEMBERS: { en: "Deafen members", tr: "Üyeleri sağırlaştır" },
  MOVE_MEMBERS: { en: "Move members", tr: "Üyeleri taşı" },
  MANAGE_INVITES: { en: "Manage invites", tr: "Davetleri yönet" },
  KICK_MEMBERS: { en: "Kick members", tr: "Üyeleri at" },
  BAN_MEMBERS: { en: "Ban members", tr: "Üyeleri yasakla" },
  TIMEOUT_MEMBERS: { en: "Timeout members", tr: "Üyeleri zaman aşımına al" },
  VIEW_AUDIT_LOG: { en: "View audit log", tr: "Denetim kaydını gör" },
  MENTION_EVERYONE: { en: "Mention @everyone", tr: "@everyone bahset" },
};

const copy = {
  en: {
    back: "Back",
    delete: "Delete role",
    deleteBody:
      "This permanently deletes the role and removes it from every member. Type the role name to continue.",
    error: "This role action could not be completed. Please try again.",
    loadingTitle: "Loading role…",
    members: "Members in role",
    membersEmpty: "No members have this role yet.",
    missingTitle: "Role unavailable",
    name: "Role name",
    permissions: "Permissions",
    protected: "This role is managed by the system and cannot be edited here.",
    retry: "Try again",
    roleColor: "Colour",
    save: "Save changes",
  },
  tr: {
    back: "Geri",
    delete: "Rolü sil",
    deleteBody:
      "Bu işlem rolü kalıcı olarak siler ve tüm üyelerden kaldırır. Devam etmek için rol adını yazın.",
    error: "Rol işlemi tamamlanamadı. Lütfen yeniden deneyin.",
    loadingTitle: "Rol yükleniyor…",
    members: "Roldeki üyeler",
    membersEmpty: "Bu role sahip üye yok.",
    missingTitle: "Rol bulunamadı",
    name: "Rol adı",
    permissions: "İzinler",
    protected: "Bu rol sistem tarafından yönetiliyor ve buradan düzenlenemez.",
    retry: "Yeniden dene",
    roleColor: "Renk",
    save: "Değişiklikleri kaydet",
  },
} as const;

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
  const labels = copy[locale];
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
          <MobileLineIcon color={theme.status.dangerOnInverse} name="leave" size={18} />
        </Pressable>
      ) : null}
    </View>
  );

  if (rolesQuery.isLoading) {
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
                  {PERMISSION_LABELS[key][locale]}
                </Text>
              </View>
              <Toggle
                accessibilityLabel={PERMISSION_LABELS[key][locale]}
                disabled={!editable || mutations.updateRole.isPending}
                onValueChange={(next) => togglePermission(key, next)}
                readOnly={!editable}
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
                    disabled={
                      !member.actions.canManageRoles || mutations.updateMemberRoles.isPending
                    }
                    onValueChange={(next) => void toggleMemberRole(member, next)}
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
        onCancel={() => setDeleteOpen(false)}
        onConfirm={remove}
        open={deleteOpen}
        requiredText={role.name}
        testID="mobile-role-detail-delete-confirm"
        title={labels.delete}
      />
    </View>
  );
}
