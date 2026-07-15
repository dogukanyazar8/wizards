import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { AuthWelcomeBrandMark } from "../../../screens/auth/auth-welcome-brand-mark";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export interface AuthTopBarProps {
  readonly backAccessibilityLabel: string;
  readonly onBack: NonNullable<ComponentProps<typeof Pressable>["onPress"]>;
  readonly testID?: string;
}

const createStyles = (theme: MobileTheme) => ({
  backHitTarget: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  backVisual: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.backButtonRadius,
    borderWidth: theme.layout.border.hairline,
    height: theme.layout.auth.backButton,
    justifyContent: "center" as const,
    width: theme.layout.auth.backButton,
  },
  brand: {
    alignItems: "center" as const,
    flex: 1,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tightPlus,
    justifyContent: "center" as const,
    minWidth: 0,
  },
  brandMark: {
    height: theme.layout.auth.topBarLogo,
    width: theme.layout.auth.topBarLogo,
  },
  brandName: {
    ...theme.typography.authWelcomeBrand,
    color: theme.text.primary,
    fontSize: 18,
    lineHeight: 24,
  },
  spacer: {
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
  },
  root: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    minWidth: 0,
  },
});

export function AuthTopBar({ backAccessibilityLabel, onBack, testID }: AuthTopBarProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.root} testID={testID}>
      <Pressable
        accessibilityLabel={backAccessibilityLabel}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [
          styles.backHitTarget,
          pressed && { opacity: theme.layout.opacity.pressed },
        ]}
        testID={testID ? `${testID}-back` : undefined}
      >
        <View style={styles.backVisual}>
          <Icon
            accessibilityElementsHidden
            name="arrow-back"
            size={theme.layout.auth.topBarBackIcon}
            testID={testID ? `${testID}-back-icon` : undefined}
            tone="primary"
          />
        </View>
      </Pressable>
      <View accessibilityRole="image" accessibilityLabel="Whispr" style={styles.brand}>
        <View style={styles.brandMark} testID={testID ? `${testID}-brand-surface` : undefined}>
          <AuthWelcomeBrandMark
            cornerRadius={theme.layout.auth.topBarLogoRadius}
            size={theme.layout.auth.topBarLogo}
            {...(testID === undefined ? {} : { testID: `${testID}-brand-mark` })}
          />
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.brandName}>
          Whispr
        </Text>
      </View>
      <View style={styles.spacer} />
    </View>
  );
}
