import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import type { MobileServerMember } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import {
  Avatar,
  BottomSheet,
  Button,
  DestructiveConfirmationSheet,
  EmptyState,
  Skeleton,
} from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { activeMobileCopy } from "../locale/mobile-locale-preferences";
import { useOpenMobileProfileCard } from "../social/profile-card";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { useMobileServerManagementMutations } from "../query/use-mobile-server-management-mutations";
import {
  useMobileAssignableRolesQuery,
  useMobileServerMembersInfiniteQuery,
} from "./mobile-server-management-query";
import {
  buildMobileServerMemberRows,
  buildNextMobileMemberRoleIds,
  type MobileServerMemberListRow,
} from "./mobile-server-member-model";
import { createMobileServerMembersStyles } from "./mobile-server-members-screen.styles";
import { mobileServerMembersCopy } from "../locale/mobile-workspace-copy";
import { SheetHeader, useSheetPresentation } from "../app/components/kit";

export interface MobileServerMembersScreenProps {
  readonly serverId: string;
  onBack(): void;
  /** 11c: a member row opens their full profile with this server as context. */
  onOpenMemberProfile?(userId: string): void;
}

function localizeStatus(
  status: string,
  labels: (typeof mobileServerMembersCopy)[keyof typeof mobileServerMembersCopy],
): string {
  return labels.status[status] ?? status;
}

function colorFromRole(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function MobileServerMembersScreen({
  onBack,
  onOpenMemberProfile,
  serverId,
}: MobileServerMembersScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const labels = mobileServerMembersCopy[locale];
  const theme = useTheme();
  const styles = useThemedStyles(createMobileServerMembersStyles);
  const sheetPresentation = useSheetPresentation();
  const queryClient = useQueryClient();
  const members = useMobileServerMembersInfiniteQuery(apiClient, serverId);
  const openProfileCard = useOpenMobileProfileCard();
  const mutations = useMobileServerManagementMutations(apiClient);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [pendingKick, setPendingKick] = useState<MobileServerMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expandedMember = useMemo(
    () =>
      members.data?.pages
        .flatMap((page) => page.members)
        .find((member) => member.id === expandedMemberId) ?? null,
    [expandedMemberId, members.data?.pages],
  );
  const roles = useMobileAssignableRolesQuery(
    apiClient,
    serverId,
    expandedMember?.actions.canManageRoles === true,
  );
  const rows = useMemo(
    () => buildMobileServerMemberRows(members.data?.pages ?? []),
    [members.data?.pages],
  );
  const fetchNextPage = members.fetchNextPage;

  const refetchExactMembers = async () => {
    await queryClient.invalidateQueries({
      exact: true,
      queryKey: mobileQueryKeys.workspaceMembers(serverId),
    });
    await members.refetch();
  };

  const mutateRoles = async (member: MobileServerMember, roleId: string, assigned: boolean) => {
    setError(null);
    try {
      await mutations.updateMemberRoles.mutateAsync({
        memberId: member.id,
        roleIds: buildNextMobileMemberRoleIds({ assigned, currentRoleIds: member.roleIds, roleId }),
        serverId,
      });
    } catch {
      setError(labels.error);
      await refetchExactMembers();
      throw new Error("mobile-member-role-update-failed");
    }
  };

  const kick = async () => {
    if (!pendingKick) {
      return;
    }
    setError(null);
    try {
      await mutations.kickMember.mutateAsync({ memberId: pendingKick.id, serverId });
      setPendingKick(null);
    } catch {
      setError(labels.error);
      await refetchExactMembers();
      throw new Error("mobile-member-kick-failed");
    }
  };

  const headerNode = (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={labels.back}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        testID="mobile-server-members-back"
      >
        <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} strokeWidth={2.2} />
      </Pressable>
      <View style={styles.headerBody}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
          {labels.members}
        </Text>
      </View>
    </View>
  );

  const renderMember = ({ item }: { readonly item: MobileServerMemberListRow }) => {
    if (item.kind === "header") {
      return (
        <View style={styles.sectionLabel}>
          <Text maxFontSizeMultiplier={2} style={styles.sectionLabelText}>
            {item.id === "present" ? labels.present : labels.offline}
          </Text>
        </View>
      );
    }
    const { member } = item;
    const display = member.displayName ?? member.username;
    const openProfile = onOpenMemberProfile
      ? () => onOpenMemberProfile(member.userId)
      : undefined;
    return (
      <View style={styles.memberRow} testID={`mobile-server-member-${member.id}`}>
        <Pressable
          accessibilityLabel={display}
          accessibilityRole="button"
          disabled={!openProfile}
          onPress={openProfile}
          style={({ pressed }) => [styles.identityTrigger, pressed && styles.pressed]}
          testID={`mobile-server-member-${member.id}-profile`}
        >
          {/* 11b: the avatar is the quick-card handle. The row keeps whatever
              the container wired for the name/body press (full profile), so the
              existing moderation affordances are untouched. */}
          <Pressable
            accessibilityLabel={activeMobileCopy.profileCardOpenActionTemplate.replace(
              "{name}",
              display,
            )}
            accessibilityRole="button"
            hitSlop={4}
            onPress={() => openProfileCard(member.userId, serverId)}
            testID={`mobile-server-member-${member.id}-card`}
          >
            <Avatar
              imageUrl={member.avatarUrl}
              label={display}
              {...(member.status === "OFFLINE" ? {} : { status: "active" as const })}
            />
          </Pressable>
          <View style={styles.rowBody}>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.memberName}>
              {display}
            </Text>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.memberMeta}>
              {localizeStatus(member.status, labels)} · @{member.username}
            </Text>
          </View>
        </Pressable>
        <View style={styles.actions}>
          {member.actions.canManageRoles ? (
            <Pressable
              accessibilityLabel={labels.roles}
              accessibilityRole="button"
              onPress={() => setExpandedMemberId(member.id)}
              style={({ pressed }) => [styles.rolesButton, pressed && styles.pressed]}
              testID={`mobile-member-${member.id}-roles`}
            >
              <Text maxFontSizeMultiplier={2} style={styles.rolesButtonText}>
                {labels.roles}
              </Text>
            </Pressable>
          ) : null}
          {member.actions.canKick ? (
            <Pressable
              accessibilityLabel={labels.kick}
              accessibilityRole="button"
              onPress={() => setPendingKick(member)}
              style={({ pressed }) => [styles.kickButton, pressed && styles.pressed]}
              testID={`mobile-member-${member.id}-kick`}
            >
              <Text maxFontSizeMultiplier={2} style={styles.kickButtonText}>
                {labels.kick}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  if (members.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-members-screen">
        {headerNode}
        <View style={styles.sectionLabel}>
          <Text style={styles.sectionLabelText}>{labels.present}</Text>
        </View>
        <View testID="mobile-server-members-loading">
          {[0, 1, 2, 3].map((index) => (
            <View key={index} style={styles.skeletonCard}>
              <Skeleton height={44} />
              <Skeleton height={12} width="60%" />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (members.isError) {
    return (
      <View style={styles.root} testID="mobile-server-members-screen">
        {headerNode}
        <Text accessibilityRole="alert" style={styles.error}>
          {labels.error}
        </Text>
        <View style={styles.stateActions}>
          <Button label={labels.retry} onPress={() => void members.refetch()} />
          <Button label={labels.back} onPress={onBack} variant="ghost" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-server-members-screen">
      {headerNode}
      {rows.length === 0 ? (
        <EmptyState
          description={labels.empty}
          icon="people-outline"
          style={styles.state}
          testID="mobile-server-members-empty"
          title={labels.members}
        />
      ) : (
        <FlashList
          contentContainerStyle={styles.listContent}
          data={rows}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (members.hasNextPage && !members.isFetchingNextPage) {
              void members.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.4}
          renderItem={renderMember}
          style={styles.list}
          testID="mobile-server-members-list"
        />
      )}
      {members.isFetchNextPageError ? (
        <View style={styles.stateActions}>
          <Text
            accessibilityRole="alert"
            style={styles.error}
            testID="mobile-server-members-load-more-error"
          >
            {labels.loadMore}
          </Text>
          <Button label={labels.retry} onPress={() => void fetchNextPage()} variant="secondary" />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <BottomSheet
        accessibilityLabel={labels.roles}
        onClose={() => setExpandedMemberId(null)}
        open={expandedMember !== null}
        presentation={sheetPresentation}
        sizing="content"
        testID="mobile-member-roles-sheet"
      >
        <View style={styles.sheet}>
          <SheetHeader
            closeAccessibilityLabel={labels.close}
            icon="shield-outline"
            onClose={() => setExpandedMemberId(null)}
            subtitle={labels.rolesHint}
            testID="mobile-member-roles-header"
            title={labels.roles}
          />
          {roles.isLoading ? <ActivityIndicator /> : null}
          {!roles.isLoading && (roles.data?.roles.length ?? 0) === 0 ? (
            <Text style={styles.sheetHint}>{labels.rolesUnavailable}</Text>
          ) : null}
          {expandedMember &&
            roles.data?.roles.map((role) => {
              const assigned = expandedMember.roleIds.includes(role.id);
              return (
                <Pressable
                  accessibilityLabel={role.name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: assigned }}
                  key={role.id}
                  onPress={() =>
                    void mutateRoles(expandedMember, role.id, !assigned).catch(() => undefined)
                  }
                  style={[styles.roleRow, assigned && styles.roleRowSelected]}
                  testID={`mobile-member-${expandedMember.id}-role-${role.id}`}
                >
                  <View style={[styles.roleDot, { backgroundColor: colorFromRole(role.color) }]} />
                  <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.roleName}>
                    {role.name}
                  </Text>
                  {assigned ? (
                    <Ionicons color={theme.accent.default} name="checkmark" size={20} />
                  ) : null}
                </Pressable>
              );
            })}
        </View>
      </BottomSheet>
      <DestructiveConfirmationSheet
        body={labels.kickBody}
        busy={mutations.kickMember.isPending}
        confirmLabel={labels.kick}
        icon="person-remove-outline"
        onCancel={() => setPendingKick(null)}
        onConfirm={kick}
        open={pendingKick !== null}
        testID="mobile-member-kick-confirm"
        title={labels.kick}
      />
    </View>
  );
}
