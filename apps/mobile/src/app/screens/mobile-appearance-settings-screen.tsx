import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";

import {
  MOBILE_ACCENT_OPTIONS,
  MOBILE_FONT_SCALE_STEPS,
  MOBILE_VOICE_APPEARANCE_OPTIONS,
  getMobileFontScaleSliderProgress,
  getMobileFontScaleStepForSliderProgress,
  type MobileAccentId,
  type MobileFontScaleStep,
  type MobileVoiceRoomAppearance,
} from "../../design/mobile-appearance-preferences";
import type { MobileThemeMode } from "../../design/mobile-theme-runtime";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import { useMobileAppearancePreferences, useTheme } from "../providers/mobile-theme-provider";
import {
  useMobileWorkspaceLayoutPreference,
  type MobileWorkspaceLayout,
} from "../providers/mobile-workspace-layout-provider";
import { useMobileAppearanceSettingsStyles } from "./mobile-appearance-settings-screen.styles";

const THEME_MODES: readonly MobileThemeMode[] = ["light", "dark", "system"];
const WORKSPACE_LAYOUTS: readonly MobileWorkspaceLayout[] = ["rail", "compact"];
const FONT_SCALE_MAX_STEP = MOBILE_FONT_SCALE_STEPS.length - 1;

function getThemeModeLabel(locale: MobileLocale, mode: MobileThemeMode): string {
  const copy = mobileCopy[locale];
  switch (mode) {
    case "light":
      return copy.settingsThemeLightValue;
    case "dark":
      return copy.settingsThemeDarkValue;
    case "system":
      return copy.settingsThemeSystemValue;
  }
}

function getAccentLabel(locale: MobileLocale, accent: MobileAccentId): string {
  const copy = mobileCopy[locale];
  switch (accent) {
    case "indigo":
      return copy.appearanceSettingsAccentIndigo;
    case "violet":
      return copy.appearanceSettingsAccentViolet;
    case "blue":
      return copy.appearanceSettingsAccentBlue;
    case "green":
      return copy.appearanceSettingsAccentGreen;
    case "pink":
      return copy.appearanceSettingsAccentPink;
    case "amber":
      return copy.appearanceSettingsAccentAmber;
  }
}

function getLayoutLabel(locale: MobileLocale, layout: MobileWorkspaceLayout): string {
  const copy = mobileCopy[locale];
  return layout === "rail"
    ? copy.appearanceSettingsLayoutRail
    : copy.appearanceSettingsLayoutCompact;
}

function getLayoutHint(locale: MobileLocale, layout: MobileWorkspaceLayout): string {
  const copy = mobileCopy[locale];
  return layout === "rail"
    ? copy.appearanceSettingsLayoutRailHint
    : copy.appearanceSettingsLayoutCompactHint;
}

function SelectionCheck() {
  const styles = useMobileAppearanceSettingsStyles();
  const theme = useTheme();

  return (
    <View style={styles.optionCheck}>
      <Ionicons color={theme.text.onPrimary} name="checkmark" size={9} />
    </View>
  );
}

function ThemePreview({ mode }: { mode: MobileThemeMode }) {
  const styles = useMobileAppearanceSettingsStyles();

  if (mode === "system") {
    return (
      <View style={[styles.themePreview, styles.themePreviewSystem]}>
        <View style={styles.themePreviewSystemLight}>
          <View style={[styles.previewTitleBar, styles.previewSystemBar]} />
          <View style={[styles.previewMutedBar, styles.previewSystemBar]} />
        </View>
        <View style={styles.themePreviewSystemDark}>
          <View style={[styles.previewTitleBarDark, styles.previewSystemBar]} />
          <View style={[styles.previewMutedBarDark, styles.previewSystemBar]} />
        </View>
      </View>
    );
  }

  if (mode === "dark") {
    return (
      <View style={[styles.themePreview, styles.themePreviewDark]}>
        <View style={styles.previewTitleBarDark} />
        <View style={styles.previewMutedBarDark} />
        <View style={styles.previewAccentBarDark} />
      </View>
    );
  }

  return (
    <View style={[styles.themePreview, styles.themePreviewLight]}>
      <View style={styles.previewTitleBar} />
      <View style={styles.previewMutedBar} />
      <View style={styles.previewAccentBar} />
    </View>
  );
}

function LayoutPreview({ layout }: { layout: MobileWorkspaceLayout }) {
  const styles = useMobileAppearanceSettingsStyles();
  const body = (
    <View style={styles.layoutPreviewBody}>
      <View style={styles.layoutPreviewTitleBar} />
      <View style={styles.layoutPreviewBarWide} />
      <View style={styles.layoutPreviewBarNarrow} />
    </View>
  );

  if (layout === "rail") {
    return (
      <View style={[styles.layoutPreview, styles.layoutPreviewRail]}>
        <View style={styles.layoutRail}>
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[styles.layoutRailDot, index === 0 && styles.layoutRailDotActive]}
            />
          ))}
        </View>
        {body}
      </View>
    );
  }

  return (
    <View style={[styles.layoutPreview, styles.layoutPreviewCompact]}>
      {body}
      <View style={styles.layoutTabBar}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[styles.layoutTabDot, index === 0 && styles.layoutTabDotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function FontScaleSlider({
  label,
  onChange,
  step,
}: {
  label: string;
  onChange(step: MobileFontScaleStep): void;
  step: MobileFontScaleStep;
}) {
  const styles = useMobileAppearanceSettingsStyles();
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const stepRef = useRef(step);
  stepRef.current = step;

  const commitStep = useCallback(
    (nextStep: number) => {
      const clamped = Math.max(0, Math.min(FONT_SCALE_MAX_STEP, nextStep)) as MobileFontScaleStep;
      if (clamped !== stepRef.current) {
        onChange(clamped);
      }
    },
    [onChange],
  );

  const stepFromPosition = useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return stepRef.current;
    }
    return getMobileFontScaleStepForSliderProgress(Math.max(0, Math.min(width, x)) / width);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          commitStep(stepFromPosition(event.nativeEvent.locationX));
        },
        onPanResponderMove: (event) => {
          commitStep(stepFromPosition(event.nativeEvent.locationX));
        },
        onStartShouldSetPanResponder: () => true,
      }),
    [commitStep, stepFromPosition],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const progress = getMobileFontScaleSliderProgress(step);

  return (
    <View
      accessibilityActions={[{ name: "decrement" }, { name: "increment" }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityValue={{ max: FONT_SCALE_MAX_STEP, min: 0, now: step }}
      onAccessibilityAction={(event) => {
        commitStep(step + (event.nativeEvent.actionName === "increment" ? 1 : -1));
      }}
      style={styles.sliderTouch}
      testID="mobile-appearance-settings-font-scale-slider"
      {...panResponder.panHandlers}
    >
      <View onLayout={handleLayout} style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: trackWidth * progress }]} />
        <View style={[styles.sliderThumb, { left: trackWidth * progress }]} />
      </View>
    </View>
  );
}

export function MobileAppearanceSettingsScreen({ onBack }: { onBack(): void }) {
  const styles = useMobileAppearanceSettingsStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const {
    accent,
    fontScaleStep,
    mode,
    setAccent,
    setFontScaleStep,
    setMode,
    setVoiceRoomAppearance,
    voiceRoomAppearance,
  } = useMobileAppearancePreferences();
  const { layout, setLayout } = useMobileWorkspaceLayoutPreference();

  const selectTheme = useCallback(
    (nextMode: MobileThemeMode) => {
      selection();
      setMode(nextMode);
    },
    [selection, setMode],
  );
  const selectAccent = useCallback(
    (nextAccent: MobileAccentId) => {
      selection();
      setAccent(nextAccent);
    },
    [selection, setAccent],
  );
  const selectLayout = useCallback(
    (nextLayout: MobileWorkspaceLayout) => {
      selection();
      setLayout(nextLayout);
    },
    [selection, setLayout],
  );
  const selectVoiceAppearance = useCallback(
    (nextAppearance: MobileVoiceRoomAppearance) => {
      selection();
      setVoiceRoomAppearance(nextAppearance);
    },
    [selection, setVoiceRoomAppearance],
  );

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-appearance-settings-screen"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.authBackAction}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          testID="mobile-appearance-settings-back"
        >
          <View style={styles.backVisual}>
            <Ionicons color={theme.text.primary} name="chevron-back" size={18} />
          </View>
        </Pressable>
        <View style={styles.headerText}>
          <Text numberOfLines={1} style={styles.title}>
            {copy.appearanceSettingsTitle}
          </Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {copy.appearanceSettingsSubtitle}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionHeading}>{copy.appearanceSettingsThemeHeading}</Text>
      <View style={styles.optionRow}>
        {THEME_MODES.map((themeMode) => {
          const selected = mode === themeMode;
          return (
            <Pressable
              accessibilityLabel={getThemeModeLabel(locale, themeMode)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              key={themeMode}
              onPress={() => selectTheme(themeMode)}
              style={({ pressed }) => [
                styles.optionCard,
                selected && styles.optionCardSelected,
                pressed && styles.pressed,
              ]}
              testID={`mobile-appearance-settings-theme-${themeMode}`}
            >
              <ThemePreview mode={themeMode} />
              <View style={styles.optionLabelRow}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {getThemeModeLabel(locale, themeMode)}
                </Text>
                {selected ? <SelectionCheck /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{copy.appearanceSettingsVoiceRoomHeading}</Text>
      <View style={styles.optionRow}>
        {MOBILE_VOICE_APPEARANCE_OPTIONS.map((appearance) => {
          const selected = voiceRoomAppearance === appearance;
          return (
            <Pressable
              accessibilityLabel={getThemeModeLabel(locale, appearance)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              key={appearance}
              onPress={() => selectVoiceAppearance(appearance)}
              style={({ pressed }) => [
                styles.optionCard,
                selected && styles.optionCardSelected,
                pressed && styles.pressed,
              ]}
              testID={`mobile-appearance-settings-voice-${appearance}`}
            >
              <ThemePreview mode={appearance} />
              <View style={styles.optionLabelRow}>
                <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                  {getThemeModeLabel(locale, appearance)}
                </Text>
                {selected ? <SelectionCheck /> : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{copy.appearanceSettingsAccentHeading}</Text>
      <View style={styles.accentCard}>
        {MOBILE_ACCENT_OPTIONS.map((option) => {
          const selected = accent === option.id;
          return (
            <Pressable
              accessibilityLabel={getAccentLabel(locale, option.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              key={option.id}
              onPress={() => selectAccent(option.id)}
              style={({ pressed }) => [styles.accentSwatchTarget, pressed && styles.pressed]}
              testID={`mobile-appearance-settings-accent-${option.id}`}
            >
              {selected ? (
                <View style={[styles.accentSwatchRing, { borderColor: option.color }]} />
              ) : null}
              <View
                style={[
                  styles.accentSwatch,
                  { backgroundColor: option.color },
                  selected && styles.accentSwatchSelected,
                ]}
              >
                {selected ? (
                  <Ionicons color={theme.text.onPrimary} name="checkmark" size={14} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{copy.appearanceSettingsLayoutHeading}</Text>
      <View style={styles.optionRow}>
        {WORKSPACE_LAYOUTS.map((workspaceLayout) => {
          const selected = layout === workspaceLayout;
          return (
            <Pressable
              accessibilityLabel={getLayoutLabel(locale, workspaceLayout)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              key={workspaceLayout}
              onPress={() => selectLayout(workspaceLayout)}
              style={({ pressed }) => [
                styles.optionCard,
                selected && styles.optionCardSelected,
                pressed && styles.pressed,
              ]}
              testID={`mobile-appearance-settings-layout-${workspaceLayout}`}
            >
              <LayoutPreview layout={workspaceLayout} />
              <View style={styles.optionLabelColumn}>
                <View style={styles.optionLabelRow}>
                  <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                    {getLayoutLabel(locale, workspaceLayout)}
                  </Text>
                  {selected ? <SelectionCheck /> : null}
                </View>
                <Text style={styles.optionHint}>{getLayoutHint(locale, workspaceLayout)}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>{copy.appearanceSettingsTextSizeHeading}</Text>
      <View style={styles.textSizeCard}>
        <Text
          accessibilityLabel={copy.appearanceSettingsTextSizeSmall}
          style={styles.textSizeSmall}
        >
          A
        </Text>
        <FontScaleSlider
          label={copy.appearanceSettingsTextSizeSlider}
          onChange={setFontScaleStep}
          step={fontScaleStep}
        />
        <Text
          accessibilityLabel={copy.appearanceSettingsTextSizeLarge}
          style={styles.textSizeLarge}
        >
          A
        </Text>
      </View>
    </ScrollView>
  );
}
