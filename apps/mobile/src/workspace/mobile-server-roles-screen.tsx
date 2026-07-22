import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { BottomSheet, Button, EmptyState, Skeleton, Toggle } from "../app/components/kit";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import { useMobileServerRoleOverviewQuery } from "./mobile-server-management-query";
import { createMobileServerRolesStyles } from "./mobile-server-roles-screen.styles";
import { mobileCopy } from "../locale/mobile-copy";

export interface MobileServerRolesScreenProps {
  readonly serverId: string;
  onBack(): void;
  onOpenRoleDetail?(roleId: string): void;
}

// Preset role colours offered by the create sheet (handoff swatch set).
const ROLE_COLOR_PRESETS = [0xe0527e, 0xc77a2b, 0x4f46e5, 0x3b82f6, 0x22a366, 0x8b5cf6] as const;

function colorFromRole(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function getRoleSummary(
  role: { readonly isDefault: boolean; readonly permissionKeys: readonly string[] },
  labels: (typeof mobileCopy)[keyof typeof mobileCopy],
): string {
  if (role.isDefault) {
    return labels.serverRolesDefaultRole;
  }
  if (role.permissionKeys.includes("ADMINISTRATOR")) {
    return labels.serverRolesAllPermissions;
  }
  const summary = role.permissionKeys
    .filter(
      (key) => key === "MANAGE_SERVER" || key === "MANAGE_MESSAGES" || key === "MANAGE_INVITES",
    )
    .slice(0, 2)
    .map((key) =>
      key === "MANAGE_SERVER"
        ? labels.serverRolesManageServer
        : key === "MANAGE_MESSAGES"
          ? labels.serverRolesSendMessages
          : labels.serverRolesInviteCreate,
    );
  return summary.length > 0 ? summary.join(" · ") : labels.serverRolesNoPermissions;
}

export function MobileServerRolesScreen({
  onBack,
  onOpenRoleDetail,
  serverId,
}: MobileServerRolesScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerRolesStyles);
  const mutations = useMobileServerManagementMutations(apiClient);
  const rolesQuery = useMobileServerRoleOverviewQuery(apiClient, serverId, true);
  const roles = rolesQuery.data?.roles ?? [];
  const defaultRole = roles.find((role) => role.isDefault) ?? null;
  const defaultPermissionKeys = new Set(defaultRole?.permissionKeys ?? []);

  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<number>(ROLE_COLOR_PRESETS[2]);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setError(null);
    setDraftName("");
    setDraftColor(ROLE_COLOR_PRESETS[2]);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    const name = draftName.trim();
    if (name.length === 0 || mutations.createRole.isPending) {
      return;
    }
    try {
      const created = await mutations.createRole.mutateAsync({
        color: draftColor,
        name,
        permissionKeys: [],
        serverId,
      });
      setCreateOpen(false);
      onOpenRoleDetail?.(created.role.id);
    } catch {
      setError(labels.serverRolesError);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={labels.serverRolesBack}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={styles.backButton}
        testID="mobile-server-roles-back"
      >
        <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.headerBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
          {labels.serverRolesRoles}
        </Text>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.subtitle}>
          {rolesQuery.isLoading
            ? labels.serverRolesLoading
            : labels.serverRolesRolesReorder.replace("{count}", String(roles.length))}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={labels.serverRolesCreateRole}
        accessibilityRole="button"
        onPress={openCreate}
        style={({ pressed }) => [styles.createButton, pressed && styles.createButtonPressed]}
        testID="mobile-server-roles-create"
      >
        <MobileLineIcon color={theme.text.onPrimary} name="plus" size={18} strokeWidth={2.2} />
      </Pressable>
    </View>
  );

  if (rolesQuery.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-roles-screen">
        {header}
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
        {header}

        {rolesQuery.isError ? (
          <EmptyState
            action={<Button label={labels.serverRolesRetry} onPress={() => void rolesQuery.refetch()} />}
            description={labels.serverRolesEmptyBody}
            style={styles.state}
            testID="mobile-server-roles-error"
            title={labels.serverRolesEmptyTitle}
          />
        ) : roles.length === 0 ? (
          <EmptyState
            description={labels.serverRolesEmptyBody}
            style={styles.state}
            testID="mobile-server-roles-empty"
            title={labels.serverRolesEmptyTitle}
          />
        ) : (
          <>
            <View style={styles.card}>
              {roles.map((role, index) => {
                const roleColor = colorFromRole(role.color);
                return (
                  <Pressable
                    accessibilityLabel={role.name}
                    accessibilityRole="button"
                    disabled={!onOpenRoleDetail}
                    key={role.id}
                    onPress={() => onOpenRoleDetail?.(role.id)}
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
                      <MobileLineIcon color={theme.control.separatorDot} name="grip" size={14} />
                    )}
                    <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
                    <View style={styles.roleBody}>
                      <Text
                        numberOfLines={1}
                        maxFontSizeMultiplier={2}
                        style={[styles.roleName, { color: roleColor }]}
                      >
                        {role.name}
                      </Text>
                      <Text numberOfLines={1} maxFontSizeMultiplier={2} style={styles.roleSummary}>
                        {role.isDefault && !role.permissionKeys.includes("ADMINISTRATOR")
                          ? labels.serverRolesDefaultRole
                          : getRoleSummary(role, labels)}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={2} style={styles.count}>
                      {role.memberCount}
                    </Text>
                    <MobileLineIcon color={theme.control.chevron} name="chevron-right" size={16} />
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.sectionLabel}>
              <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
                {labels.serverRolesDefaultPermissions}
              </Text>
            </View>
            <View
              style={[styles.card, { marginTop: 0 }]}
              testID="mobile-server-roles-default-permissions"
            >
              <ReadOnlyPermissionRow
                label={labels.serverRolesSendMessages}
                value={defaultPermissionKeys.has("SEND_MESSAGES")}
              />
              <ReadOnlyPermissionRow
                label={labels.serverRolesJoinVoice}
                value={defaultPermissionKeys.has("CONNECT_VOICE")}
              />
              <ReadOnlyPermissionRow
                hint={labels.serverRolesPermissionRestricted}
                label={labels.serverRolesInviteCreate}
                last
                value={defaultPermissionKeys.has("MANAGE_INVITES")}
              />
            </View>
          </>
        )}
      </ScrollView>

      <BottomSheet
        accessibilityLabel={labels.serverRolesCreateRole}
        onClose={() => setCreateOpen(false)}
        open={createOpen}
        snapPoint={380}
        testID="mobile-server-role-create-sheet"
      >
        <View style={styles.sheet}>
          <Text maxFontSizeMultiplier={2} style={styles.sheetTitle}>
            {labels.serverRolesCreateRole}
          </Text>
          <View style={{ gap: 8 }}>
            <Text maxFontSizeMultiplier={2} style={styles.sheetLabel}>
              {labels.serverRolesNameLabel}
            </Text>
            <TextInput
              accessibilityLabel={labels.serverRolesNameLabel}
              autoFocus
              maxLength={48}
              onChangeText={setDraftName}
              placeholder={labels.serverRolesNamePlaceholder}
              placeholderTextColor={theme.text.placeholder}
              style={styles.input}
              testID="mobile-server-role-create-name"
              value={draftName}
            />
          </View>
          <View style={{ gap: 8 }}>
            <Text maxFontSizeMultiplier={2} style={styles.sheetLabel}>
              {labels.serverRolesRoleColor}
            </Text>
            <View style={styles.colorRow}>
              {ROLE_COLOR_PRESETS.map((preset) => (
                <Pressable
                  accessibilityLabel={colorFromRole(preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: preset === draftColor }}
                  key={preset}
                  onPress={() => setDraftColor(preset)}
                  style={[styles.swatch, preset === draftColor && styles.swatchSelected]}
                >
                  <View style={[styles.swatchDot, { backgroundColor: colorFromRole(preset) }]} />
                </Pressable>
              ))}
            </View>
          </View>
          {error ? (
            <Text accessibilityRole="alert" maxFontSizeMultiplier={2} style={styles.roleSummary}>
              {error}
            </Text>
          ) : null}
          <View style={styles.sheetActions}>
            <View style={styles.sheetAction}>
              <Button
                fullWidth
                label={labels.serverRolesCancel}
                onPress={() => setCreateOpen(false)}
                variant="secondary"
              />
            </View>
            <View style={styles.sheetAction}>
              <Button
                busy={mutations.createRole.isPending}
                disabled={draftName.trim().length === 0}
                fullWidth
                label={labels.serverRolesCreate}
                onPress={() => void submitCreate()}
                testID="mobile-server-role-create-submit"
              />
            </View>
          </View>
        </View>
      </BottomSheet>
    </View>
  );
}

function ReadOnlyPermissionRow({
  hint,
  label,
  last,
  value,
}: {
  readonly hint?: string;
  readonly label: string;
  readonly last?: boolean;
  readonly value: boolean;
}) {
  const styles = useThemedStyles(createMobileServerRolesStyles);
  return (
    <View style={[styles.permissionRow, !last && styles.rowDivider]}>
      <View style={styles.permissionBody}>
        <Text maxFontSizeMultiplier={2} style={styles.permissionName}>
          {label}
        </Text>
        {hint ? (
          <Text maxFontSizeMultiplier={2} style={styles.permissionHint}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Toggle accessibilityLabel={label} onValueChange={() => undefined} readOnly value={value} />
    </View>
  );
}
