import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { DMConversationDTO } from "@wizards/types";

import { copy } from "../../mobile-root-screen-shared";
import {
  getGroupCapabilities,
  getGroupMemberRows,
  type MobileGroupMemberSheetAction,
  type MobileGroupMemberSource,
} from "../../mobile-group-chat-model";
import { MobileLineIcon } from "../../../design/mobile-line-icons";
import { GroupMemberActionsSheet } from "../../components/group-management-sheets";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useGroupChatStyles, useGroupPressStyle } from "../group-chat.styles";
import { GroupMemberCardRow } from "./group-info-screen";

/**
 * Grup sohbetleri 2a–2f, Faz 5 §C1.6 — the full roster behind 2e's `Tümü`.
 *
 * It is the same rows in the same order as the card above it, because both read
 * `getGroupMemberRows`: the card is the first four of this list, never a second
 * ordering that could disagree with it.
 */
export function MobileGroupMembersScreen({
  conversation,
  onBack,
  onInvite,
  onMemberAction,
  viewerId,
}: {
  readonly conversation: DMConversationDTO | null;
  onBack(): void;
  onInvite(): void;
  onMemberAction(action: MobileGroupMemberSheetAction, userId: string): void;
  readonly viewerId: string;
}) {
  const styles = useGroupChatStyles();
  const tokens = useTheme().groupChat;
  const pressStyle = useGroupPressStyle();
  const [sheetTarget, setSheetTarget] = useState<MobileGroupMemberSource | null>(null);
  const members = useMemo<readonly MobileGroupMemberSource[]>(
    () => conversation?.participants ?? [],
    [conversation?.participants],
  );
  const rows = useMemo(() => getGroupMemberRows(members, viewerId), [members, viewerId]);
  const capabilities = getGroupCapabilities(conversation?.role, conversation?.permissions);

  return (
    <View style={styles.screen} testID="mobile-group-members-screen">
      <View style={styles.detailHeader}>
        <Pressable
          accessibilityLabel={copy.dmBackAction}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onBack}
          style={styles.stepHeaderBack}
          testID="mobile-group-members-back"
        >
          <MobileLineIcon
            color={tokens.stepHeader.backIconColor}
            name="back-arrow"
            size={tokens.stepHeader.backIcon}
          />
        </Pressable>
        <Text numberOfLines={1} style={styles.detailHeaderTitle}>
          {copy.groupMembersTitle}
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={[styles.detailBody, styles.detailScrollContent]}
        style={{ flex: 1 }}
      >
        <View style={styles.fieldLabelRow}>
          <Text style={styles.listSectionLabel}>
            {copy.groupInfoMembers}{" "}
            <Text style={styles.listSectionCount}>
              {conversation?.memberCount ?? members.length}
            </Text>
          </Text>
        </View>
        <View style={styles.memberCard}>
          {capabilities.canAddMembers ? (
            <Pressable
              accessibilityRole="button"
              onPress={onInvite}
              style={({ pressed }) => [
                styles.memberRow,
                styles.memberRowDivider,
                pressed && pressStyle,
              ]}
              testID="mobile-group-members-add"
            >
              <View style={styles.memberAddIcon}>
                <MobileLineIcon
                  color={tokens.memberRow.addIconColor}
                  name="plus"
                  size={tokens.memberRow.addIcon}
                />
              </View>
              <Text style={styles.memberAddLabel}>{copy.groupAddMemberAction}</Text>
            </Pressable>
          ) : null}
          {rows.map((row, index) => (
            <GroupMemberCardRow
              key={row.member.userId}
              onOpenActions={() => setSheetTarget(row.member)}
              row={row}
              showDivider={index < rows.length - 1}
            />
          ))}
        </View>
      </ScrollView>
      <GroupMemberActionsSheet
        onClose={() => setSheetTarget(null)}
        onSelect={(action, userId) => {
          setSheetTarget(null);
          onMemberAction(action, userId);
        }}
        open={sheetTarget !== null}
        target={sheetTarget}
        viewerId={viewerId}
        viewerRole={conversation?.role}
      />
    </View>
  );
}
