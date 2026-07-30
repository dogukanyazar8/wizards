import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";

import {
  getAboutBetaConsentRequest,
  settleAboutBetaConsent,
  subscribeAboutBetaConsent,
} from "../../../about/open-about-beta-consent";
import { writeMobileAboutPreference } from "../../../about/mobile-about-preferences";
import { mobileCopy } from "../../../locale/mobile-copy";
import { BottomSheet, type BottomSheetPresentation } from "../../components/kit/bottom-sheet";
import { MOBILE_ABOUT_BETA_CONSENT_OVERLAY_ID } from "../../components/kit/overlay-registry";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import {
  AboutCheckIcon,
  AboutFlaskIcon,
  AboutShieldCheckIcon,
  AboutSparkIcon,
  AboutWarningTriangleIcon,
} from "./about-icons";
import { AboutConsentSheetShell } from "./about-primitives";
import { useAboutBetaConsentSheetStyles } from "./about-beta-consent-sheet.styles";

export function AboutBetaConsentSheet() {
  const theme = useTheme();
  const styles = useAboutBetaConsentSheetStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const request = useSyncExternalStore(
    subscribeAboutBetaConsent,
    getAboutBetaConsentRequest,
    getAboutBetaConsentRequest,
  );
  const titleFocusRef = useRef<View | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request !== null) {
      setAccepted(false);
      setSaving(false);
    }
  }, [request?.id]);

  const presentation = useMemo<BottomSheetPresentation>(
    () => ({
      backdropStyle: styles.backdrop,
      contentStyle: styles.content,
      handleAreaStyle: styles.hiddenHandleArea,
      handleStyle: styles.hiddenHandle,
      panelStyle: styles.panel,
    }),
    [styles],
  );
  const dismiss = () => {
    if (!saving) {
      settleAboutBetaConsent(false);
    }
  };
  const confirm = async () => {
    if (!accepted || saving) {
      return;
    }

    setSaving(true);
    try {
      await writeMobileAboutPreference(AsyncStorage, "betaConsentAt", new Date().toISOString());
      setSaving(false);
      settleAboutBetaConsent(true);
    } catch {
      // Consent is not valid unless it is durable. Keep the sheet open so a
      // transient storage failure cannot enable a beta channel without proof.
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      accessibilityLabel={copy.betaTitle}
      initialFocusRef={titleFocusRef}
      onClose={dismiss}
      open={request !== null}
      overlayId={MOBILE_ABOUT_BETA_CONSENT_OVERLAY_ID}
      panEnabled={!saving}
      presentation={presentation}
      sizing="content"
      testID="mobile-about-beta-consent-sheet"
    >
      <AboutConsentSheetShell testID="mobile-about-beta-consent-shell">
        <View style={styles.headerIcon} testID="mobile-about-beta-header-icon">
          <AboutFlaskIcon color={theme.about.accent} size={21} />
        </View>
        <View accessible accessibilityRole="header" ref={titleFocusRef} style={styles.titleFocus}>
          <Text maxFontSizeMultiplier={2} style={styles.title}>
            {copy.betaTitle}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.intro}>
          {copy.betaIntro}
        </Text>

        <View style={styles.conditions} testID="mobile-about-beta-conditions">
          <View style={styles.condition} testID="mobile-about-beta-condition-benefit">
            <View style={[styles.conditionIcon, styles.conditionIconBenefit]}>
              <AboutSparkIcon color={theme.about.accent} size={14} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.conditionText}>
              {copy.betaBenefit}
            </Text>
          </View>
          <View style={styles.condition} testID="mobile-about-beta-condition-risk">
            <View style={[styles.conditionIcon, styles.conditionIconRisk]}>
              <AboutWarningTriangleIcon color={theme.about.warningText} size={14} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.conditionText}>
              {copy.betaRisk}
            </Text>
          </View>
          <View style={styles.condition} testID="mobile-about-beta-condition-safety">
            <View style={[styles.conditionIcon, styles.conditionIconSafety]}>
              <AboutShieldCheckIcon color={theme.about.successText} size={14} />
            </View>
            <Text maxFontSizeMultiplier={2} style={styles.conditionText}>
              {copy.betaSafety}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityLabel={copy.betaConsent}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          onPress={() => setAccepted((current) => !current)}
          style={styles.consentRow}
          testID="mobile-about-beta-consent-row"
        >
          <View
            style={[styles.checkbox, accepted ? styles.checkboxChecked : styles.checkboxIdle]}
            testID="mobile-about-beta-consent-checkbox"
          >
            {accepted ? (
              <AboutCheckIcon color={theme.about.updateOnGradient} size={12} strokeWidth={3.2} />
            ) : null}
          </View>
          <Text maxFontSizeMultiplier={2} style={styles.consentLabel}>
            {copy.betaConsent}
          </Text>
        </Pressable>

        <Pressable
          accessibilityHint={!accepted ? copy.betaConsentDisabledHint : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: !accepted || saving }}
          disabled={!accepted || saving}
          onPress={() => void confirm()}
          style={({ pressed }) => [
            styles.primary,
            (!accepted || saving) && styles.primaryDisabled,
            pressed && accepted && !saving && styles.primaryPressed,
          ]}
          testID="mobile-about-beta-consent-confirm"
        >
          <Text maxFontSizeMultiplier={2} style={styles.primaryLabel}>
            {copy.betaJoin}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          onPress={dismiss}
          style={({ pressed }) => [styles.cancel, pressed && styles.cancelPressed]}
          testID="mobile-about-beta-consent-cancel"
        >
          <Text maxFontSizeMultiplier={2} style={styles.cancelLabel}>
            {copy.betaCancel}
          </Text>
        </Pressable>
      </AboutConsentSheetShell>
    </BottomSheet>
  );
}
