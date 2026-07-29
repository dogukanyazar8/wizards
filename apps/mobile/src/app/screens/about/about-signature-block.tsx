import Ionicons from "@expo/vector-icons/Ionicons";
import { Linking, Pressable, Text, View } from "react-native";

import type { MobileAboutCopy } from "../../../about/mobile-about-model";
import { mobileAboutLinks } from "../../../config/mobile-about-links";
import { useTheme } from "../../providers/mobile-theme-provider";
import { useMobileAboutSettingsStyles } from "../mobile-about-settings-screen.styles";

type SocialLinkKey = keyof typeof mobileAboutLinks;

function AboutSocialChip({
  accessibilityLabel,
  icon,
  linkKey,
}: {
  readonly accessibilityLabel: string;
  readonly icon: "instagram" | "mail" | "x";
  readonly linkKey: SocialLinkKey;
}) {
  const theme = useTheme();
  const styles = useMobileAboutSettingsStyles();
  const url = mobileAboutLinks[linkKey];

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={url === null ? "image" : "link"}
      disabled={url === null}
      onPress={url === null ? undefined : () => void Linking.openURL(url)}
      style={({ pressed }) => [
        styles.socialChip,
        url === null && styles.socialChipUnavailable,
        pressed && styles.pressed,
      ]}
      testID={`mobile-about-social-${linkKey}`}
    >
      {icon === "x" ? (
        <Text allowFontScaling={false} style={styles.socialX}>
          𝕏
        </Text>
      ) : (
        <Ionicons
          color={theme.about.textSecondary}
          name={icon === "instagram" ? "logo-instagram" : "mail-outline"}
          size={icon === "instagram" ? 15 : 14}
        />
      )}
    </Pressable>
  );
}

export function AboutSignatureBlock({
  copy,
  year,
}: {
  readonly copy: MobileAboutCopy;
  readonly year: string;
}) {
  const styles = useMobileAboutSettingsStyles();

  return (
    <View style={styles.signature} testID="mobile-about-signature">
      <View style={styles.socialRow}>
        <AboutSocialChip accessibilityLabel="X" icon="x" linkKey="x" />
        <AboutSocialChip accessibilityLabel="Instagram" icon="instagram" linkKey="instagram" />
        <AboutSocialChip accessibilityLabel="E-posta" icon="mail" linkKey="email" />
      </View>
      <Text maxFontSizeMultiplier={2} style={styles.signatureText}>
        {copy.aboutSignature}
      </Text>
      <Text maxFontSizeMultiplier={2} style={styles.copyrightText}>
        {copy.aboutCopyright.replace("{year}", year)}
      </Text>
    </View>
  );
}
