import type { MobileReleaseChange, MobileReleaseDetail } from "@wizards/types";
import { Pressable, Text, View } from "react-native";

import type { MobileAboutCopy } from "../../../about/mobile-about-model";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useMobileAboutSettingsStyles } from "../mobile-about-settings-screen.styles";
import {
  AboutArrowUpIcon,
  AboutChevronRightIcon,
  AboutSparkIcon,
  AboutWrenchIcon,
} from "./about-icons";
import { AboutCard } from "./about-primitives";

const VISIBLE_CHANGE_COUNT = 3;

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function AboutChangeIcon({
  index,
  type,
}: {
  readonly index: number;
  readonly type: MobileReleaseChange["type"];
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();

  if (type === "new") {
    return (
      <View
        style={[styles.changeIcon, styles.changeIconNew]}
        testID={`mobile-about-change-icon-${index}`}
      >
        <AboutSparkIcon color={theme.about.accent} size={14} />
      </View>
    );
  }
  if (type === "improved") {
    return (
      <View
        style={[styles.changeIcon, styles.changeIconImproved]}
        testID={`mobile-about-change-icon-${index}`}
      >
        <AboutArrowUpIcon color={theme.about.successText} size={14} />
      </View>
    );
  }

  return (
    <View
      style={[styles.changeIcon, styles.changeIconFixed]}
      testID={`mobile-about-change-icon-${index}`}
    >
      <AboutWrenchIcon color={theme.about.warningText} size={14} />
    </View>
  );
}

export function AboutWhatsNewCard({
  copy,
  dateLabel,
  isNew,
  onPress,
  release,
}: {
  readonly copy: MobileAboutCopy;
  readonly dateLabel: string;
  readonly isNew: boolean;
  readonly onPress: () => void;
  readonly release: MobileReleaseDetail;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  const visible = release.changes.slice(0, VISIBLE_CHANGE_COUNT);
  const hidden = release.changes.slice(VISIBLE_CHANGE_COUNT);
  const improved = hidden.filter((change) => change.type === "improved").length;
  const fixed = hidden.filter((change) => change.type === "fixed").length;
  const showMore = hidden.length > 0;

  return (
    <AboutCard style={styles.whatsNewCard} testID="mobile-about-whats-new-card">
      <Pressable
        accessibilityLabel={copy.aboutWhatsNewSeeAll}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.whatsNewPressable, pressed && styles.pressed]}
      >
        <View style={styles.releaseHeader}>
          <Text maxFontSizeMultiplier={2} style={styles.releaseTitle}>
            {release.version} {release.codename ? `“${release.codename}”` : ""}
          </Text>
          {isNew ? (
            <View style={styles.newBadge} testID="mobile-about-new-badge">
              <Text allowFontScaling={false} style={styles.newBadgeText}>
                {copy.aboutNewBadge}
              </Text>
            </View>
          ) : null}
          <Text maxFontSizeMultiplier={2} style={styles.releaseDate}>
            {dateLabel}
          </Text>
        </View>
        <View style={styles.changes}>
          {visible.map((change, index) => (
            <View key={`${change.type}-${change.title}-${index}`} style={styles.changeRow}>
              <AboutChangeIcon index={index} type={change.type} />
              <View style={styles.changeText}>
                <Text maxFontSizeMultiplier={2} style={styles.changeTitle}>
                  {change.title}
                </Text>
                {change.detail ? (
                  <Text maxFontSizeMultiplier={2} style={styles.changeDetail}>
                    {change.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
        {showMore ? (
          <>
            <View style={styles.whatsNewHairline} testID="mobile-about-whats-new-hairline" />
            <View style={styles.moreRow}>
              <Text maxFontSizeMultiplier={2} style={styles.moreText}>
                {fill(copy.aboutWhatsNewMoreChanges, {
                  fixed: String(fixed),
                  improved: String(improved),
                })}
              </Text>
              <AboutChevronRightIcon color={theme.about.accent} size={14} />
            </View>
          </>
        ) : null}
      </Pressable>
    </AboutCard>
  );
}
