import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { AuthPrimaryButton } from "../../components/kit/auth/auth-primary-button";
import { AuthScreenBackground } from "../../components/kit/auth/auth-screen-background";
import { AuthSecondaryButton } from "../../components/kit/auth/auth-secondary-button";
import { Icon } from "../../components/kit/icon";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import {
  useTheme,
  useThemePreference,
  useThemedStyles,
} from "../../providers/mobile-theme-provider";
import { MOBILE_LOCALE_OPTIONS } from "../../../locale/mobile-locale-preferences";
import { mobileCopy } from "../../../locale/mobile-copy";
import { AuthWelcomeBrandMark } from "./auth-welcome-brand-mark";
import { createAuthWelcomeScreenStyles } from "./auth-welcome-screen.styles";

export interface AuthWelcomeScreenProps {
  readonly onOpenLanguagePicker: () => void;
  readonly onSignIn: () => void;
  readonly onSignUp: () => void;
}

export const AUTH_WELCOME_TITLE_GRADIENT_COLORS = ["#7C6CF6", "#4F9CF6"] as const;

export function AuthWelcomeScreen({
  onOpenLanguagePicker,
  onSignIn,
  onSignUp,
}: AuthWelcomeScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { locale } = useMobileLocaleRuntime();
  const { resolvedTheme, setMode } = useThemePreference();
  const styles = useThemedStyles(createAuthWelcomeScreenStyles);
  const copy = mobileCopy[locale];
  const localeLabel = MOBILE_LOCALE_OPTIONS.find((option) => option.id === locale)!.label;
  const features = [
    { color: theme.authFeature.encryption, label: copy.authWelcomeFeatureEncryption },
    { color: theme.authFeature.realtime, label: copy.authWelcomeFeatureRealtime },
    { color: theme.authFeature.community, label: copy.authWelcomeFeatureCommunity },
    { color: theme.authFeature.fileShare, label: copy.authWelcomeFeatureFileShare },
    { color: theme.authFeature.voice, label: copy.authWelcomeFeatureVoice },
  ];
  const copyright = copy.authWelcomeCopyrightTemplate.replace(
    "{year}",
    String(new Date().getFullYear()),
  );

  return (
    <AuthScreenBackground centered={false} fill scrollable testID="mobile-auth-welcome-screen">
      <View
        style={[
          styles.screen,
          {
            paddingBottom: Math.max(insets.bottom, theme.layout.auth.welcomeCtaBottomPadding),
            paddingTop: Math.max(insets.top, theme.spacing.section),
          },
        ]}
        testID="mobile-auth-welcome-layout"
      >
        <View style={styles.topControls}>
          <View accessibilityRole="tablist" style={styles.themePill}>
            <Pressable
              accessibilityLabel={copy.authThemeToggleLight}
              accessibilityRole="tab"
              accessibilityState={{ selected: resolvedTheme === "light" }}
              hitSlop={9}
              onPress={() => setMode("light")}
              style={[styles.themeControl, resolvedTheme === "light" && styles.themeControlActive]}
              testID="mobile-auth-welcome-theme-light"
            >
              <Icon
                accessibilityElementsHidden
                name="sunny-outline"
                size={theme.layout.auth.welcomeThemeIcon}
                tone={resolvedTheme === "light" ? "accent" : "muted"}
              />
              <Text
                maxFontSizeMultiplier={2}
                style={
                  resolvedTheme === "light"
                    ? styles.themeControlLabel
                    : styles.themeControlLabelInactive
                }
              >
                {copy.authThemeToggleLight}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.authThemeToggleDark}
              accessibilityRole="tab"
              accessibilityState={{ selected: resolvedTheme === "dark" }}
              hitSlop={9}
              onPress={() => setMode("dark")}
              style={[styles.themeControl, resolvedTheme === "dark" && styles.themeControlActive]}
              testID="mobile-auth-welcome-theme-dark"
            >
              <Icon
                accessibilityElementsHidden
                name="moon-outline"
                size={theme.layout.auth.welcomeThemeIcon}
                tone={resolvedTheme === "dark" ? "accent" : "muted"}
              />
              <Text
                maxFontSizeMultiplier={2}
                style={
                  resolvedTheme === "dark"
                    ? styles.themeControlLabel
                    : styles.themeControlLabelInactive
                }
              >
                {copy.authThemeToggleDark}
              </Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel={localeLabel}
            accessibilityRole="button"
            hitSlop={5}
            onPress={onOpenLanguagePicker}
            style={styles.languageControl}
            testID="mobile-auth-language-picker"
          >
            <Icon
              accessibilityElementsHidden
              name="globe-outline"
              size={theme.layout.auth.welcomeLanguageIcon}
              tone="accent"
            />
            <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.languageControlLabel}>
              {localeLabel}
            </Text>
            <Icon
              accessibilityElementsHidden
              name="chevron-down"
              size={theme.layout.auth.welcomeLanguageChevronIcon}
              tone="muted"
            />
          </Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.brandRow}>
            <LinearGradient colors={theme.gradients.authPrimaryAction} style={styles.brandMark}>
              <AuthWelcomeBrandMark testID="mobile-auth-welcome-brand-mark" />
            </LinearGradient>
            <Text maxFontSizeMultiplier={2} style={styles.brandName}>
              {copy.status}
            </Text>
          </View>

          <View
            accessibilityLabel={`${copy.authWelcomeHeroTitleLine1} ${copy.authWelcomeHeroTitleLine2}`}
            accessibilityRole="header"
          >
            <Text maxFontSizeMultiplier={2} style={styles.heroTitle}>
              {copy.authWelcomeHeroTitleLine1}
            </Text>
            <Svg
              accessible={false}
              accessibilityElementsHidden
              height={theme.typography.authHeroTitle.lineHeight}
              testID="mobile-auth-welcome-hero-title-gradient"
              width="100%"
            >
              <Defs>
                <SvgLinearGradient
                  id="mobile-auth-welcome-title-gradient"
                  x1="0"
                  x2="1"
                  y1="0"
                  y2="0"
                >
                  <Stop offset="0" stopColor={AUTH_WELCOME_TITLE_GRADIENT_COLORS[0]} />
                  <Stop offset="1" stopColor={AUTH_WELCOME_TITLE_GRADIENT_COLORS[1]} />
                </SvgLinearGradient>
              </Defs>
              <SvgText
                fill="url(#mobile-auth-welcome-title-gradient)"
                fontFamily={theme.typography.authHeroTitle.fontFamily}
                fontSize={theme.typography.authHeroTitle.fontSize}
                fontWeight="800"
                letterSpacing={theme.typography.authHeroTitle.letterSpacing}
                x="0"
                y={theme.typography.authHeroTitle.fontSize}
              >
                {copy.authWelcomeHeroTitleLine2}
              </SvgText>
            </Svg>
          </View>

          <Text maxFontSizeMultiplier={2} style={styles.heroBody}>
            {copy.authWelcomeHeroSubtitle}
          </Text>

          <View style={styles.featureChips}>
            {features.map((feature) => (
              <View key={feature.label} style={styles.featureChip}>
                <View style={[styles.featureDot, { backgroundColor: feature.color }]} />
                <Text maxFontSizeMultiplier={2} style={styles.featureChipLabel}>
                  {feature.label}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View
          style={[
            styles.ctaBlock,
            {
              paddingBottom: Math.max(theme.layout.auth.welcomeCtaBottomPadding - insets.bottom, 0),
            },
          ]}
        >
          <AuthPrimaryButton
            iconName="arrow-forward"
            label={copy.authWelcomeSignInAction}
            onPress={onSignIn}
            testID="mobile-auth-welcome-sign-in"
            variant="welcome"
          />
          <AuthSecondaryButton
            iconName="person-add-outline"
            label={copy.authWelcomeCreateAccountAction}
            onPress={onSignUp}
            testID="mobile-auth-welcome-sign-up"
            variant="welcome"
          />
          <View style={styles.copyrightRow}>
            <Text maxFontSizeMultiplier={2} style={styles.copyright}>
              {copyright}
            </Text>
          </View>
        </View>
      </View>
    </AuthScreenBackground>
  );
}
