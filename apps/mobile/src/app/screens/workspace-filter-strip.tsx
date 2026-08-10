import { Pressable, Text, View } from "react-native";

import { copy } from "../mobile-root-screen-shared";
import { useHomeScreenStyles } from "./home-screen.styles";
import type { MobileWorkspaceFilterId } from "../mobile-sunucular-model";

const FILTER_SEGMENTS = [
  { id: "all", label: () => copy.workspaceFilterAll },
  { id: "unread", label: () => copy.workspaceFilterUnread },
  { id: "voice", label: () => copy.workspaceFilterVoice },
] as const satisfies readonly { id: MobileWorkspaceFilterId; label: () => string }[];

/**
 * 6a/6b filter strip. Three equal segments in one track; the selection is kept
 * per user *and* per server by `useMobileWorkspaceFilter`, so switching servers
 * does not carry a filter over.
 *
 * The two hints are live, not decorative: the unread badge disappears at zero,
 * and the voice dot only lights when a room in *this* server has people in it.
 */
export function WorkspaceFilterStrip({
  filter,
  hasLiveVoice,
  onChange,
  unreadChannelCount,
}: {
  filter: MobileWorkspaceFilterId;
  hasLiveVoice: boolean;
  onChange(filter: MobileWorkspaceFilterId): void;
  unreadChannelCount: number;
}) {
  const styles = useHomeScreenStyles();

  return (
    <View style={styles.mobileWorkspaceFilterTrack} testID="mobile-workspace-filter-strip">
      {FILTER_SEGMENTS.map((segment) => {
        const isActive = segment.id === filter;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={segment.id}
            onPress={() => onChange(segment.id)}
            style={[
              styles.mobileWorkspaceFilterSegment,
              isActive && styles.mobileWorkspaceFilterSegmentActive,
            ]}
            testID={`mobile-workspace-filter-${segment.id}`}
          >
            <Text
              style={[
                styles.mobileWorkspaceFilterLabel,
                isActive && styles.mobileWorkspaceFilterLabelActive,
              ]}
            >
              {segment.label()}
            </Text>
            {segment.id === "unread" && unreadChannelCount > 0 ? (
              <Text
                style={styles.mobileWorkspaceFilterBadge}
                testID="mobile-workspace-filter-unread-badge"
              >
                {unreadChannelCount}
              </Text>
            ) : null}
            {segment.id === "voice" && hasLiveVoice ? (
              <View
                style={styles.mobileWorkspaceFilterVoiceDot}
                testID="mobile-workspace-filter-voice-dot"
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
