import { Pressable, ScrollView, Text, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { Button, EmptyState, Skeleton, Toggle } from "../app/components/kit";
import { useMobileServerRoleOverviewQuery } from "./mobile-server-management-query";
import { createMobileServerRolesStyles } from "./mobile-server-roles-screen.styles";

export interface MobileServerRolesScreenProps {
  readonly serverId: string;
  onBack(): void;
}

const copy = {
  en: {
    allPermissions: "All permissions",
    back: "Back",
    createRole: "Role creation is coming soon",
    defaultPermissions: "@EVERYONE DEFAULT PERMISSIONS",
    defaultRole: "Default role · all members",
    emptyBody: "No roles are available for this server.",
    emptyTitle: "No roles yet",
    inviteCreate: "Create invites",
    joinVoice: "Join voice channels",
    loading: "Loading roles…",
    manageServer: "Manage server",
    permissionRestricted: "Moderators and above only",
    retry: "Try again",
    roles: "Roles",
    rolesReadOnly: (count: number) => `${count} roles · read only`,
    sendMessages: "Send messages",
    noPermissions: "No explicit permissions",
  },
  tr: {
    allPermissions: "Tüm izinler",
    back: "Geri",
    createRole: "Rol oluşturma yakında",
    defaultPermissions: "@EVERYONE VARSAYILAN İZİNLERİ",
    defaultRole: "Varsayılan rol · tüm üyeler",
    emptyBody: "Bu sunucuda görüntülenecek rol yok.",
    emptyTitle: "Henüz rol yok",
    inviteCreate: "Davet oluşturma",
    joinVoice: "Ses kanallarına katılma",
    loading: "Roller yükleniyor…",
    manageServer: "Sunucu ayarları",
    permissionRestricted: "Yalnızca Moderatör ve üstü",
    retry: "Yeniden dene",
    roles: "Roller",
    rolesReadOnly: (count: number) => `${count} rol · salt okunur`,
    sendMessages: "Mesaj gönderme",
    noPermissions: "Açık izin yok",
  },
} as const;

function colorFromRole(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function getRoleSummary(
  role: { readonly isDefault: boolean; readonly permissionKeys: readonly string[] },
  labels: (typeof copy)[keyof typeof copy],
): string {
  if (role.isDefault) {
    return labels.defaultRole;
  }

  if (role.permissionKeys.includes("ADMINISTRATOR")) {
    return labels.allPermissions;
  }

  const summary = role.permissionKeys
    .filter(
      (key) => key === "MANAGE_SERVER" || key === "MANAGE_MESSAGES" || key === "MANAGE_INVITES",
    )
    .slice(0, 2)
    .map((key) =>
      key === "MANAGE_SERVER"
        ? labels.manageServer
        : key === "MANAGE_MESSAGES"
          ? labels.sendMessages
          : labels.inviteCreate,
    );

  return summary.length > 0 ? summary.join(" · ") : labels.noPermissions;
}

export function MobileServerRolesScreen({ onBack, serverId }: MobileServerRolesScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = copy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerRolesStyles);
  const rolesQuery = useMobileServerRoleOverviewQuery(apiClient, serverId, true);
  const roles = rolesQuery.data?.roles ?? [];
  const defaultRole = roles.find((role) => role.isDefault) ?? null;
  const defaultPermissionKeys = new Set(defaultRole?.permissionKeys ?? []);

  if (rolesQuery.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-roles-screen">
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={labels.back}
            onPress={onBack}
            style={styles.backButton}
            testID="mobile-server-roles-back"
          >
            <MobileLineIcon
              color={theme.text.primary}
              name="back-arrow"
              size={18}
              strokeWidth={2.2}
            />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.title}>{labels.roles}</Text>
            <Text style={styles.subtitle}>{labels.loading}</Text>
          </View>
        </View>
        <View style={[styles.card, styles.state]} testID="mobile-server-roles-skeleton">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.skeletonRow}>
              <Skeleton height={14} width={14} />
              <View style={styles.roleBody}>
                <Skeleton height={15} width="45%" />
                <Skeleton height={12} width="72%" />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-server-roles-screen">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={labels.back}
            onPress={onBack}
            style={styles.backButton}
            testID="mobile-server-roles-back"
          >
            <MobileLineIcon
              color={theme.text.primary}
              name="back-arrow"
              size={18}
              strokeWidth={2.2}
            />
          </Pressable>
          <View style={styles.headerBody}>
            <Text style={styles.title}>{labels.roles}</Text>
            <Text style={styles.subtitle}>{labels.rolesReadOnly(roles.length)}</Text>
          </View>
          <Pressable
            accessibilityLabel={labels.createRole}
            accessibilityState={{ disabled: true }}
            disabled
            style={styles.createButton}
            testID="mobile-server-roles-create-disabled"
          >
            <MobileLineIcon color={theme.text.onPrimary} name="plus" size={18} strokeWidth={2.2} />
          </Pressable>
        </View>

        {rolesQuery.isError ? (
          <EmptyState
            action={<Button label={labels.retry} onPress={() => void rolesQuery.refetch()} />}
            description={labels.emptyBody}
            style={styles.state}
            testID="mobile-server-roles-error"
            title={labels.emptyTitle}
          />
        ) : roles.length === 0 ? (
          <EmptyState
            description={labels.emptyBody}
            style={styles.state}
            testID="mobile-server-roles-empty"
            title={labels.emptyTitle}
          />
        ) : (
          <>
            <View style={styles.card}>
              {roles.map((role, index) => {
                const roleColor = colorFromRole(role.color);
                return (
                  <Pressable
                    accessibilityLabel={role.name}
                    accessibilityState={{ disabled: true }}
                    disabled
                    key={role.id}
                    style={[styles.roleRow, index < roles.length - 1 && styles.rowDivider]}
                    testID={`mobile-server-role-${role.id}`}
                  >
                    {role.isDefault ? (
                      <View style={styles.gripPlaceholder} />
                    ) : role.managed ? (
                      <View style={styles.gripPlaceholder}>
                        <MobileLineIcon color={theme.text.visualFaint} name="lock" size={14} />
                      </View>
                    ) : (
                      <Text style={styles.grip}>⠿</Text>
                    )}
                    <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
                    <View style={styles.roleBody}>
                      <Text numberOfLines={1} style={[styles.roleName, { color: roleColor }]}>
                        {role.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.roleSummary}>
                        {getRoleSummary(role, labels)}
                      </Text>
                    </View>
                    <Text style={styles.count}>{role.memberCount}</Text>
                    <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={16} />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sectionLabel}>
              <Text style={styles.sectionLabelText}>{labels.defaultPermissions}</Text>
            </View>
            <View
              accessibilityState={{ disabled: true }}
              style={[styles.card, { marginTop: 0 }]}
              testID="mobile-server-roles-default-permissions"
            >
              <PermissionRow
                label={labels.sendMessages}
                value={defaultPermissionKeys.has("SEND_MESSAGES")}
              />
              <PermissionRow
                label={labels.joinVoice}
                value={defaultPermissionKeys.has("CONNECT_VOICE")}
              />
              <PermissionRow
                hint={labels.permissionRestricted}
                label={labels.inviteCreate}
                value={defaultPermissionKeys.has("MANAGE_INVITES")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function PermissionRow({
  hint,
  label,
  value,
}: {
  readonly hint?: string;
  readonly label: string;
  readonly value: boolean;
}) {
  const styles = useThemedStyles(createMobileServerRolesStyles);
  return (
    <View style={styles.permissionRow}>
      <View style={styles.permissionBody}>
        <Text style={styles.permissionName}>{label}</Text>
        {hint ? <Text style={styles.permissionHint}>{hint}</Text> : null}
      </View>
      <Toggle accessibilityLabel={label} disabled onValueChange={() => undefined} value={value} />
    </View>
  );
}
