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
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
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
import { createMobileServerManagementStyles } from "./mobile-server-management.styles";

export interface MobileServerMembersScreenProps {
  readonly serverId: string;
  onBack(): void;
}

const COPY = {
  back: "Back",
  empty: "There are no members to show.",
  error:
    "Member changes could not be completed. Permissions may have changed; the list was refreshed.",
  kick: "Kick member",
  kickBody: "This removes the member from the server.",
  loadMore: "Could not load more members. Try again.",
  members: "Members",
  offline: "Offline",
  present: "Present",
  roles: "Roles",
  rolesUnavailable: "No assignable roles are available.",
} as const;

type PendingRoleRemoval = {
  readonly member: MobileServerMember;
  readonly roleId: string;
  readonly roleName: string;
};

export function MobileServerMembersScreen({ onBack, serverId }: MobileServerMembersScreenProps) {
  const { apiClient } = useMobileAuth();
  const styles = useThemedStyles(createMobileServerManagementStyles);
  const queryClient = useQueryClient();
  const members = useMobileServerMembersInfiniteQuery(apiClient, serverId);
  const mutations = useMobileServerManagementMutations(apiClient);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [pendingKick, setPendingKick] = useState<MobileServerMember | null>(null);
  const [pendingRoleRemoval, setPendingRoleRemoval] = useState<PendingRoleRemoval | null>(null);
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
        roleIds: buildNextMobileMemberRoleIds({
          assigned,
          currentRoleIds: member.roleIds,
          roleId,
        }),
        serverId,
      });
    } catch {
      setError(COPY.error);
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
      setError(COPY.error);
      await refetchExactMembers();
      throw new Error("mobile-member-kick-failed");
    }
  };

  const renderMember = ({ item }: { readonly item: MobileServerMemberListRow }) => {
    if (item.kind === "header") {
      return (
        <Text style={styles.memberHeader}>
          {item.id === "present" ? COPY.present : COPY.offline}
        </Text>
      );
    }
    const { member } = item;
    const canExpandRoles = member.actions.canManageRoles;
    return (
      <View style={styles.memberRow} testID={`mobile-server-member-${member.id}`}>
        <Avatar
          imageUrl={member.avatarUrl}
          label={member.displayName}
          {...(member.status === "OFFLINE" ? {} : { status: "active" as const })}
        />
        <View style={styles.rowBody}>
          <Text style={styles.body}>{member.displayName}</Text>
          <Text style={styles.caption}>
            {member.status} · @{member.username}
          </Text>
        </View>
        {canExpandRoles ? (
          <Button
            label={COPY.roles}
            onPress={() => setExpandedMemberId(member.id)}
            testID={`mobile-member-${member.id}-roles`}
            variant="ghost"
          />
        ) : null}
        {member.actions.canKick ? (
          <Button
            label={COPY.kick}
            onPress={() => setPendingKick(member)}
            testID={`mobile-member-${member.id}-kick`}
            variant="danger"
          />
        ) : null}
      </View>
    );
  };

  if (members.isLoading) {
    return (
      <View style={styles.root} testID="mobile-server-members-screen">
        <View style={styles.content} testID="mobile-server-members-loading">
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      </View>
    );
  }

  if (members.isError) {
    return (
      <View style={styles.root} testID="mobile-server-members-screen">
        <View style={styles.content}>
          <Text accessibilityRole="alert" style={styles.error}>
            {COPY.error}
          </Text>
          <Button label="Retry" onPress={() => void members.refetch()} />
          <Button label={COPY.back} onPress={onBack} variant="ghost" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-server-members-screen">
      <View style={styles.content}>
        <Button label={COPY.back} onPress={onBack} variant="ghost" />
        <Text style={styles.title}>{COPY.members}</Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.content} testID="mobile-server-members-empty">
          <EmptyState description={COPY.empty} icon="people-outline" title={COPY.members} />
        </View>
      ) : (
        <FlashList
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
        <View style={styles.content}>
          <Text
            accessibilityRole="alert"
            style={styles.error}
            testID="mobile-server-members-load-more-error"
          >
            {COPY.loadMore}
          </Text>
          <Button label="Retry" onPress={() => void fetchNextPage()} variant="secondary" />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <BottomSheet
        accessibilityLabel={COPY.roles}
        onClose={() => setExpandedMemberId(null)}
        open={expandedMember !== null}
        testID="mobile-member-roles-sheet"
      >
        <View style={styles.sheet}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {COPY.roles}
          </Text>
          {roles.isLoading ? <ActivityIndicator /> : null}
          {!roles.isLoading && (roles.data?.roles.length ?? 0) === 0 ? (
            <Text style={styles.body}>{COPY.rolesUnavailable}</Text>
          ) : null}
          {expandedMember &&
            roles.data?.roles.map((role) => {
              const assigned = expandedMember.roleIds.includes(role.id);
              return (
                <Pressable
                  accessibilityLabel={`${role.name} role`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: assigned }}
                  key={role.id}
                  onPress={() => {
                    if (assigned) {
                      setPendingRoleRemoval({
                        member: expandedMember,
                        roleId: role.id,
                        roleName: role.name,
                      });
                    } else {
                      void mutateRoles(expandedMember, role.id, true).catch(() => undefined);
                    }
                  }}
                  style={styles.roleRow}
                  testID={`mobile-member-${expandedMember.id}-role-${role.id}`}
                >
                  <View
                    style={[
                      styles.roleDot,
                      { backgroundColor: `#${role.color.toString(16).padStart(6, "0")}` },
                    ]}
                  />
                  <Text style={styles.body}>{role.name}</Text>
                </Pressable>
              );
            })}
        </View>
      </BottomSheet>
      <DestructiveConfirmationSheet
        body={pendingRoleRemoval ? `Remove ${pendingRoleRemoval.roleName} from this member?` : ""}
        busy={mutations.updateMemberRoles.isPending}
        confirmLabel="Remove role"
        onCancel={() => setPendingRoleRemoval(null)}
        onConfirm={async () => {
          if (!pendingRoleRemoval) return;
          await mutateRoles(pendingRoleRemoval.member, pendingRoleRemoval.roleId, false);
          setPendingRoleRemoval(null);
        }}
        open={pendingRoleRemoval !== null}
        testID="mobile-member-role-remove-confirm"
        title="Remove role"
      />
      <DestructiveConfirmationSheet
        body={COPY.kickBody}
        busy={mutations.kickMember.isPending}
        confirmLabel={COPY.kick}
        onCancel={() => setPendingKick(null)}
        onConfirm={kick}
        open={pendingKick !== null}
        testID="mobile-member-kick-confirm"
        title={COPY.kick}
      />
    </View>
  );
}
