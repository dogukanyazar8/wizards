import type { ComponentProps } from "react";
import { Image, Pressable, Text, View } from "react-native";

import whisprIcon from "../../../../../assets/whispr-icon.png";
import type { MobileTheme } from "../../../../design/themes";
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
  brandImage: {
    borderRadius: theme.layout.auth.logoSquircleRadius,
    height: theme.layout.auth.topBarLogo,
    width: theme.layout.auth.topBarLogo,
    ...theme.elevation.authBrandMark,
  },
  brandName: {
    ...theme.typography.title,
    color: theme.text.primary,
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
        <Image accessibilityIgnoresInvertColors source={whisprIcon} style={styles.brandImage} />
        <Text maxFontSizeMultiplier={2} style={styles.brandName}>
          Whispr
        </Text>
      </View>
      <View style={styles.spacer} />
    </View>
  );
}
