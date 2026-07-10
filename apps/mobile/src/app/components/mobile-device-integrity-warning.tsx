import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { activeMobileCopy } from "../../locale/mobile-locale-preferences";
import { styles } from "./mobile-device-integrity-warning.styles";

const copy = activeMobileCopy;

export function MobileDeviceIntegrityWarning({
  onDismiss,
  visible,
}: {
  onDismiss(): void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.warning}
      testID="mobile-device-integrity-warning"
    >
      <View style={styles.icon}>
        <Ionicons name="shield-outline" size={20} color={styles.iconGlyph.color} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{copy.deviceIntegrityWarningTitle}</Text>
        <Text style={styles.description}>{copy.deviceIntegrityWarningDescription}</Text>
      </View>
      <Pressable
        accessibilityLabel={copy.deviceIntegrityDismissAction}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onDismiss}
        style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        testID="mobile-device-integrity-warning-dismiss"
      >
        <Ionicons name="close" size={20} color={styles.dismissGlyph.color} />
      </Pressable>
    </View>
  );
}
