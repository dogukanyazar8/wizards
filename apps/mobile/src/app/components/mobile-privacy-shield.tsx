import { useEffect, useState } from "react";
import { AppState, View, type AppStateStatus } from "react-native";

import type { MobileTheme } from "../../design/themes";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { shouldShowMobilePrivacyShield } from "../../security/mobile-privacy-shield";
import { useThemedStyles } from "../providers/mobile-theme-provider";

const createStyles = (theme: MobileTheme) => ({
  shield: {
    backgroundColor: theme.surface.base,
    bottom: 0,
    elevation: 10_000,
    left: 0,
    position: "absolute" as const,
    right: 0,
    top: 0,
    zIndex: 10_000,
  },
});

export function MobilePrivacyShield() {
  const styles = useThemedStyles(createStyles);
  const [visible, setVisible] = useState(() =>
    shouldShowMobilePrivacyShield(AppState.currentState),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      setVisible(shouldShowMobilePrivacyShield(status));
    });
    return () => subscription.remove();
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLabel={copy.privacyShieldAccessibilityLabel}
      accessible
      importantForAccessibility="yes"
      pointerEvents="auto"
      style={styles.shield}
      testID="mobile-privacy-shield"
    />
  );
}
