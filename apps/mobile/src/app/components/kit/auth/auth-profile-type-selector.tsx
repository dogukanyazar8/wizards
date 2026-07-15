import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { activeMobileCopy } from "../../../../locale/mobile-locale-preferences";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export type MobileAuthProfileType = "corporate" | "gamer" | "personal";

type MobileAuthProfileOption = {
  readonly iconName: ComponentProps<typeof Ionicons>["name"];
  readonly preview: boolean;
  readonly value: MobileAuthProfileType;
};

export const MOBILE_AUTH_PROFILE_OPTIONS: readonly MobileAuthProfileOption[] = [
  { iconName: "person-outline", preview: false, value: "personal" },
  { iconName: "game-controller-outline", preview: true, value: "gamer" },
  { iconName: "briefcase-outline", preview: true, value: "corporate" },
] as const;

export interface AuthProfileTypeSelectorProps {
  readonly onChange: (value: MobileAuthProfileType) => void;
  readonly testID?: string;
  readonly value: MobileAuthProfileType;
}

function getProfileLabel(value: MobileAuthProfileType) {
  const copy = activeMobileCopy;

  switch (value) {
    case "gamer":
      return copy.authProfileGamer;
    case "corporate":
      return copy.authProfileCorporate;
    default:
      return copy.authProfilePersonal;
  }
}

const createStyles = (theme: MobileTheme) => ({
  check: {
    alignItems: "center" as const,
    backgroundColor: theme.accent.action,
    borderColor: theme.surface.base,
    borderWidth: theme.layout.spacing.micro,
    borderRadius: theme.radii.pill,
    bottom: -theme.layout.auth.profileSelectionBadgeBottomOffset,
    height: theme.layout.auth.profileSelectionBadge,
    justifyContent: "center" as const,
    position: "absolute" as const,
    right: theme.layout.auth.profileSelectionBadgeRightOffset,
    width: theme.layout.auth.profileSelectionBadge,
  },
  grid: {
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tight,
    minWidth: 0,
  },
  icon: {
    alignItems: "center" as const,
    borderRadius: theme.radii.pill,
    height: theme.layout.auth.profileIcon,
    justifyContent: "center" as const,
    width: theme.layout.auth.profileIcon,
  },
  label: {
    ...theme.typography.authSubtitle,
    color: theme.text.secondary,
    textAlign: "center" as const,
  },
  option: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.profileRadius,
    borderWidth: theme.layout.border.hairline,
    flex: 1,
    gap: theme.layout.spacing.small,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 0,
    paddingHorizontal: theme.layout.spacing.tight,
    paddingVertical: theme.layout.spacing.tight,
    position: "relative" as const,
  },
  preview: {
    ...theme.typography.authEyebrow,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.layout.spacing.small,
    paddingVertical: theme.layout.spacing.micro,
    position: "absolute" as const,
    right: theme.layout.auth.profilePreviewOffsetRight,
    textTransform: "uppercase" as const,
    top: -theme.layout.auth.profilePreviewOffsetTop,
  },
});

export function AuthProfileTypeSelector({ onChange, testID, value }: AuthProfileTypeSelectorProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = activeMobileCopy;

  return (
    <View style={styles.grid} testID={testID}>
      {MOBILE_AUTH_PROFILE_OPTIONS.map((option) => {
        const accent = theme.authProfile[option.value];
        const selected = option.value === value;
        const label = getProfileLabel(option.value);
        const optionTestID = testID ? `${testID}-option-${option.value}` : undefined;

        return (
          <Pressable
            key={option.value}
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && {
                backgroundColor: theme.accent.soft,
                borderColor: theme.accent.default,
                borderWidth: theme.layout.auth.profileSelectionBorderWidth,
              },
              pressed && { opacity: theme.layout.opacity.pressed },
            ]}
            testID={optionTestID}
          >
            <View style={[styles.icon, { backgroundColor: accent.iconSoft }]}>
              <Ionicons
                accessibilityElementsHidden
                color={accent.icon}
                importantForAccessibility="no"
                name={option.iconName}
                size={theme.layout.auth.profileGlyph}
                testID={optionTestID ? `${optionTestID}-glyph` : undefined}
              />
            </View>
            <Text
              maxFontSizeMultiplier={2}
              numberOfLines={1}
              style={[styles.label, selected && { color: theme.accent.default }]}
            >
              {label}
            </Text>
            {option.preview ? (
              <Text
                style={[styles.preview, { backgroundColor: accent.badgeSoft, color: accent.badgeText }]}
                testID={testID ? `${testID}-preview-${option.value}` : undefined}
              >
                {copy.authProfilePreviewLabel}
              </Text>
            ) : null}
            {selected ? (
              <View style={styles.check}>
                <Icon
                  accessibilityElementsHidden
                  name="checkmark"
                  size={theme.layout.auth.profileCheckGlyph}
                  testID={optionTestID ? `${optionTestID}-check` : undefined}
                  tone="inverse"
                />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
