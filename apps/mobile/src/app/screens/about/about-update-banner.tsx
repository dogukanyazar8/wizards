import type {
  MobileAppUpdateLatest,
  MobileReleaseChange,
  MobileReleaseDetail,
} from "@wizards/types";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState } from "react";
import { Pressable, Text, View, type TextStyle, type ViewStyle } from "react-native";

import type { MobileAboutCopy } from "../../../about/mobile-about-model";
import type { MobileUpdateState } from "../../../about/mobile-update-controller";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { ActionSheet } from "../../components/kit/sheet-primitives";
import { AboutArrowUpIcon, AboutSparkIcon, AboutWrenchIcon } from "./about-icons";
import { AboutCard, AboutGroupLabel } from "./about-primitives";

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function selectVisibleChanges(release: MobileReleaseDetail | null): readonly MobileReleaseChange[] {
  if (!release) {
    return [];
  }

  const newChanges = release.changes.filter((change) => change.type === "new");
  return (newChanges.length > 0 ? newChanges : release.changes).slice(0, 2);
}

function createStyles(theme: ReturnType<typeof useTheme>) {
  return {
    shadow: {
      borderRadius: 24,
      elevation: 12,
      marginHorizontal: 16,
      marginTop: 8,
      shadowColor: theme.about.updateGradientTo,
      shadowOffset: { height: 14, width: 0 },
      shadowOpacity: 0.28,
      shadowRadius: 30,
    },
    gradient: {
      borderRadius: 24,
      overflow: "hidden",
      paddingBottom: 16,
      paddingHorizontal: 18,
      paddingTop: 18,
    },
    badge: {
      alignSelf: "flex-start",
      backgroundColor: theme.about.updateBadgeSurface,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    badgeText: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 9.5,
      letterSpacing: 0.76,
    },
    versionRow: {
      alignItems: "baseline",
      flexDirection: "row",
      gap: 8,
      marginTop: 12,
    },
    version: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 24,
      letterSpacing: -0.48,
    },
    codename: {
      color: theme.about.updateOnGradientMuted,
      flexShrink: 1,
      fontFamily: theme.typography.fontFamilySemiBold,
      fontSize: 14,
    },
    meta: {
      color: theme.about.updateOnGradientMuted,
      fontFamily: theme.typography.fontFamilyMedium,
      fontSize: 12,
      marginTop: 5,
    },
    actions: { flexDirection: "row", gap: 9, marginTop: 15 },
    action: {
      alignItems: "center",
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 44,
      paddingVertical: 12,
    },
    primaryAction: { backgroundColor: theme.about.updateOnGradient, flex: 1 },
    secondaryAction: {
      backgroundColor: theme.about.updateGhostSurface,
      paddingHorizontal: 15,
    },
    primaryActionText: {
      color: theme.about.updatePrimaryText,
      fontFamily: theme.typography.fontFamilyExtraBold,
      fontSize: 13.5,
    },
    secondaryActionText: {
      color: theme.about.updateOnGradient,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13.5,
    },
    pressed: { opacity: 0.82 },
    changesCard: { gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    changeRow: { alignItems: "center", flexDirection: "row", gap: 11 },
    changeIcon: {
      alignItems: "center",
      backgroundColor: theme.about.accentSurface,
      borderRadius: 9,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    changeText: {
      color: theme.about.text,
      flex: 1,
      fontFamily: theme.typography.fontFamilyBold,
      fontSize: 13,
      minWidth: 0,
    },
  } satisfies Record<string, TextStyle | ViewStyle>;
}

function AboutUpdateChangeIcon({ change }: { readonly change: MobileReleaseChange }) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.changeIcon}>
      {change.type === "improved" ? (
        <AboutArrowUpIcon color={theme.about.accent} size={14} />
      ) : change.type === "fixed" ? (
        <AboutWrenchIcon color={theme.about.accent} size={14} />
      ) : (
        <AboutSparkIcon color={theme.about.accent} size={14} />
      )}
    </View>
  );
}

export function AboutUpdateBanner({
  copy,
  dateLabel,
  formatSize,
  latest,
  onOpenReleaseNote,
  onRequestUpdate,
  onSkipVersion,
  release,
  skippedVersion,
  state,
}: {
  readonly copy: MobileAboutCopy;
  readonly dateLabel: string;
  readonly formatSize: (bytes: number) => string;
  readonly latest: MobileAppUpdateLatest;
  readonly onOpenReleaseNote: (version: string) => void;
  readonly onRequestUpdate: () => void;
  readonly onSkipVersion: (version: string) => Promise<boolean>;
  readonly release: MobileReleaseDetail | null;
  readonly skippedVersion: string | null;
  readonly state: MobileUpdateState;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const [skipSheetOpen, setSkipSheetOpen] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const visibleChanges = useMemo(() => selectVisibleChanges(release), [release]);

  if (
    state !== "available" ||
    skippedVersion === latest.version ||
    dismissedVersion === latest.version
  ) {
    return null;
  }

  const sizeLabel = latest.sizeBytes === undefined ? "" : formatSize(latest.sizeBytes);
  const metaTemplate = latest.mandatory ? copy.updateMetaRequired : copy.updateMeta;

  return (
    <>
      <View style={styles.shadow} testID="mobile-about-update-banner">
        <LinearGradient
          colors={[theme.about.updateGradientFrom, theme.about.updateGradientTo]}
          // expo-linear-gradient has no degree input. These endpoints are the
          // handoff's measured 160° approximation in RN's normalized space.
          end={{ x: 0.88, y: 1 }}
          start={{ x: 0.12, y: 0 }}
          style={styles.gradient}
          testID="mobile-about-update-gradient"
        >
          <View style={styles.badge}>
            <Text allowFontScaling={false} style={styles.badgeText}>
              {copy.updateReady}
            </Text>
          </View>
          <View style={styles.versionRow}>
            <Text maxFontSizeMultiplier={2} style={styles.version}>
              {latest.version}
            </Text>
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.codename}>
              {latest.codename ? `“${latest.codename}”` : ""}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.meta}>
            {fill(metaTemplate, { date: dateLabel, size: sizeLabel }).replace(/^\s*·\s*/, "")}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onRequestUpdate}
              style={({ pressed }) => [
                styles.action,
                styles.primaryAction,
                pressed && styles.pressed,
              ]}
              testID="mobile-about-update-now"
            >
              <Text maxFontSizeMultiplier={2} style={styles.primaryActionText}>
                {copy.updateActionNow}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onLongPress={latest.mandatory ? undefined : () => setSkipSheetOpen(true)}
              onPress={() => onOpenReleaseNote(latest.version)}
              style={({ pressed }) => [
                styles.action,
                styles.secondaryAction,
                pressed && styles.pressed,
              ]}
              testID="mobile-about-update-whats-new"
            >
              <Text maxFontSizeMultiplier={2} style={styles.secondaryActionText}>
                {copy.updateActionWhatsNew}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </View>

      {visibleChanges.length > 0 ? (
        <>
          <AboutGroupLabel label={copy.updateInThisRelease} />
          <AboutCard style={styles.changesCard} testID="mobile-about-update-changes">
            {visibleChanges.map((change, index) => (
              <View
                key={`${change.type}-${change.title}-${index}`}
                style={styles.changeRow}
                testID={`mobile-about-update-change-${index}`}
              >
                <AboutUpdateChangeIcon change={change} />
                <Text maxFontSizeMultiplier={2} style={styles.changeText}>
                  {change.title}
                </Text>
              </View>
            ))}
          </AboutCard>
        </>
      ) : null}

      <ActionSheet
        actions={
          latest.mandatory
            ? []
            : [
                {
                  id: "skip",
                  label: copy.updateActionSkip,
                  onPress: () => {
                    void onSkipVersion(latest.version).then((saved) => {
                      if (saved) {
                        setDismissedVersion(latest.version);
                      }
                    });
                  },
                  testID: "mobile-about-update-skip",
                },
              ]
        }
        onClose={() => setSkipSheetOpen(false)}
        open={skipSheetOpen && !latest.mandatory}
        testID="mobile-about-update-skip-sheet"
        title={copy.updateActionSkip}
      />
    </>
  );
}
