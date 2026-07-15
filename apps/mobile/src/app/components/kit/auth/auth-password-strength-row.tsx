import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { activeMobileCopy } from "../../../../locale/mobile-locale-preferences";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";

export function isMobileAuthPasswordStrong(password: string) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

export interface AuthPasswordStrengthRowProps {
  readonly password: string;
  readonly testID?: string;
}

const createStyles = (theme: MobileTheme) => ({
  hint: {
    ...theme.typography.authSubtitle,
    color: theme.text.placeholder,
    flex: 1,
  },
  hintStrong: { color: theme.status.success },
  root: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tight,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 0,
  },
});

export function AuthPasswordStrengthRow({ password, testID }: AuthPasswordStrengthRowProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const isStrong = isMobileAuthPasswordStrong(password);

  return (
    <View accessibilityLiveRegion="polite" style={styles.root} testID={testID}>
      <Ionicons
        accessibilityElementsHidden
        color={isStrong ? theme.status.success : theme.text.placeholder}
        importantForAccessibility="no"
        name={isStrong ? "shield-checkmark" : "shield-checkmark-outline"}
        size={theme.layout.auth.passwordHintShieldIcon}
        testID={testID ? `${testID}-shield-icon` : undefined}
      />
      <Text
        maxFontSizeMultiplier={2}
        style={[styles.hint, isStrong && styles.hintStrong]}
        testID={testID ? `${testID}-hint` : undefined}
      >
        {activeMobileCopy.authPasswordStrengthHint}
      </Text>
    </View>
  );
}
