import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { useMobileAppLockScreenStyles } from "./mobile-app-lock-screen.styles";

const copy = activeMobileCopy;

/**
 * Full-screen biometric lock gate. It never traps the user: the prompt keeps the
 * device-passcode fallback enabled and this screen always offers a sign-out
 * escape hatch so a broken sensor can be worked around.
 */
export function MobileAppLockScreen({
  onRetry,
  onSignOut,
  visible,
}: {
  onRetry(): void;
  onSignOut(): void;
  visible: boolean;
}) {
  const styles = useMobileAppLockScreenStyles();

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.overlay}
      testID="mobile-app-lock-screen"
    >
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="lock-closed" size={30} color={styles.iconGlyph.color} />
        </View>
        <Text style={styles.title}>{copy.appLockScreenTitle}</Text>
        <Text style={styles.description}>{copy.appLockScreenDescription}</Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={copy.appLockRetryAction}
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.retryButtonPressed]}
            testID="mobile-app-lock-retry"
          >
            <Text style={styles.retryLabel}>{copy.appLockRetryAction}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={copy.appLockSignOutAction}
            accessibilityRole="button"
            onPress={onSignOut}
            style={({ pressed }) => [styles.signOutButton, pressed && styles.signOutButtonPressed]}
            testID="mobile-app-lock-sign-out"
          >
            <Text style={styles.signOutLabel}>{copy.appLockSignOutAction}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
