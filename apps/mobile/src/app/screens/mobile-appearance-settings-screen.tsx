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
import {
  MOBILE_MESSAGE_FONT_SIZES,
  getMobileMessageBodyStyle,
  type MobileMessageFontSize,
} from "../../design/mobile-message-typography";
import { MobileLineIcon } from "../../design/mobile-line-icons";
import type { MobileThemeMode } from "../../design/mobile-theme-runtime";
import { mobileCopy, type MobileLocale } from "../../locale/mobile-copy";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../providers/mobile-locale-provider";
import {
  useMobileAppearancePreferences,
  useMobileMessageBodyStyle,
  useTheme,
} from "../providers/mobile-theme-provider";
import {
  useMobileWorkspaceLayoutPreference,
  type MobileWorkspaceLayout,
} from "../providers/mobile-workspace-layout-provider";
import { useMobileAppearanceSettingsStyles } from "./mobile-appearance-settings-screen.styles";

const THEME_MODES: readonly MobileThemeMode[] = ["light", "dark", "system"];
const MESSAGE_FONT_SIZE_MAX_STEP = MOBILE_MESSAGE_FONT_SIZES.length - 1;
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

function getMessageFontSizeLabel(locale: MobileLocale, size: MobileMessageFontSize): string {
  const copy = mobileCopy[locale];
  switch (size) {
    case "small":
      return copy.appearanceSettingsMessageFontSizeSmall;
    case "medium":
      return copy.appearanceSettingsMessageFontSizeMedium;
    case "large":
      return copy.appearanceSettingsMessageFontSizeLarge;
    case "xlarge":
      return copy.appearanceSettingsMessageFontSizeXlarge;
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

function ThemePreview({ mode, selected }: { mode: MobileThemeMode; selected: boolean }) {
  const styles = useMobileAppearanceSettingsStyles();
  const edge = selected ? styles.themePreviewSelected : undefined;

  if (mode === "system") {
    return (
      <View style={[styles.themePreview, styles.themePreviewSystem, edge]}>
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
      <View style={[styles.themePreview, styles.themePreviewDark, edge]}>
        <View style={styles.previewTitleBarDark} />
        <View style={styles.previewMutedBarDark} />
        <View style={styles.previewAccentBarDark} />
      </View>
    );
  }

  return (
    <View style={[styles.themePreview, styles.themePreviewLight, edge]}>
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

/**
 * §2 "1i".5 message-size slider.
 *
 * Unlike the interface scale above it, this one is NOT continuous: a drag
 * resolves to the nearest of four stops and commits only when the stop changes,
 * which is also what makes the per-stop haptic meaningful (§9 forbids a free
 * slider). When "follow system text size" is on the control is inert and dimmed
 * — the OS owns the size then, so offering a step would be a lie.
 */
function MessageFontSizeSlider({
  disabled,
  label,
  onChange,
  size,
}: {
  disabled: boolean;
  label: string;
  onChange(size: MobileMessageFontSize): void;
  size: MobileMessageFontSize;
}) {
  const styles = useMobileAppearanceSettingsStyles();
  const { selection } = useMobileHaptics();
  const [trackWidth, setTrackWidth] = useState(0);
  const trackWidthRef = useRef(0);
  const indexRef = useRef(MOBILE_MESSAGE_FONT_SIZES.indexOf(size));
  indexRef.current = MOBILE_MESSAGE_FONT_SIZES.indexOf(size);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const commitIndex = useCallback(
    (nextIndex: number) => {
      if (disabledRef.current) {
        return;
      }
      const clamped = Math.max(0, Math.min(MESSAGE_FONT_SIZE_MAX_STEP, nextIndex));
      if (clamped !== indexRef.current) {
        // One tick per stop crossed, so a drag feels like four detents.
        selection();
        onChange(MOBILE_MESSAGE_FONT_SIZES[clamped]!);
      }
    },
    [onChange, selection],
  );

  const indexFromPosition = useCallback((x: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return indexRef.current;
    }
    const progress = Math.max(0, Math.min(width, x)) / width;
    return Math.round(progress * MESSAGE_FONT_SIZE_MAX_STEP);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: (event) => commitIndex(indexFromPosition(event.nativeEvent.locationX)),
        onPanResponderMove: (event) => commitIndex(indexFromPosition(event.nativeEvent.locationX)),
        onStartShouldSetPanResponder: () => !disabledRef.current,
      }),
    [commitIndex, indexFromPosition],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    trackWidthRef.current = event.nativeEvent.layout.width;
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const index = MOBILE_MESSAGE_FONT_SIZES.indexOf(size);
  const progress = index / MESSAGE_FONT_SIZE_MAX_STEP;

  return (
    <View
      accessibilityActions={[{ name: "decrement" }, { name: "increment" }]}
      accessibilityLabel={label}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{
        max: MESSAGE_FONT_SIZE_MAX_STEP,
        min: 0,
        now: index,
        text: size,
      }}
      onAccessibilityAction={(event) => {
        commitIndex(index + (event.nativeEvent.actionName === "increment" ? 1 : -1));
      }}
      style={[styles.messageSliderTouch, disabled && styles.messageSliderDisabled]}
      testID="mobile-appearance-settings-message-font-slider"
      {...panResponder.panHandlers}
    >
      <View onLayout={handleLayout} style={styles.messageSliderTrack}>
        <View style={[styles.messageSliderFill, { width: trackWidth * progress }]} />
        <View pointerEvents="none" style={styles.messageSliderStops}>
          {MOBILE_MESSAGE_FONT_SIZES.map((stop, stopIndex) => (
            <View
              key={stop}
              style={[
                styles.messageSliderStop,
                stopIndex <= index && styles.messageSliderStopFilled,
              ]}
            />
          ))}
        </View>
        <View style={[styles.messageSliderThumb, { left: trackWidth * progress }]} />
      </View>
    </View>
  );
}

/** §2 "1i".6 toggle: 46x28 track, 24px thumb that parks on the active side. */
function SettingsToggle({
  label,
  onToggle,
  value,
  testID,
}: {
  label: string;
  onToggle(next: boolean): void;
  value: boolean;
  testID: string;
}) {
  const styles = useMobileAppearanceSettingsStyles();
  const { selection } = useMobileHaptics();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        selection();
        onToggle(!value);
      }}
      style={[styles.toggleTrack, value && styles.toggleTrackOn]}
      testID={testID}
    >
      <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
    </Pressable>
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
    messageCompact,
    messageFollowSystemFont,
    messageFontSize,
    mode,
    setAccent,
    setFontScaleStep,
    setMessageCompact,
    setMessageFollowSystemFont,
    setMessageFontSize,
    setMode,
    setVoiceRoomAppearance,
    voiceRoomAppearance,
  } = useMobileAppearancePreferences();
  // The one body-size resolver the chats use, so the preview cannot drift from
  // what a real DM renders — including the follow-system clamp.
  const previewBodyStyle = useMobileMessageBodyStyle("dm");
  // §2 "1i".7: with follow-system on, the label reports the EFFECTIVE px the
  // clamp produced, not the raw step.
  const messageFontSizeValue = copy.appearanceSettingsMessageFontSizeValue
    .replace("{name}", getMessageFontSizeLabel(locale, messageFontSize))
    .replace("{px}", String(previewBodyStyle.fontSize));
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
        </View>
      </View>

      {/* 1. TEMA */}
      <Text style={styles.sectionHeading}>{copy.appearanceSettingsThemeHeading}</Text>
      <View style={[styles.settingsCard, styles.optionRow]}>
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
              <ThemePreview mode={themeMode} selected={selected} />
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

      {/* 2. SES ODASI GÖRÜNÜMÜ — K6: kept, in the new card language. */}
      <Text style={styles.sectionHeading}>{copy.appearanceSettingsVoiceRoomHeading}</Text>
      <View style={[styles.settingsCard, styles.optionRow]}>
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
              <ThemePreview mode={appearance} selected={selected} />
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

      {/* 3. AKSAN RENGİ — K6: all six swatches kept. */}
      <Text style={styles.sectionHeading}>{copy.appearanceSettingsAccentHeading}</Text>
      <View style={[styles.settingsCard, styles.accentCard]}>
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

      {/* 4. MESAJ YAZI BOYUTU — the new control. */}
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeadingInline}>
          {copy.appearanceSettingsMessageFontSizeHeading}
        </Text>
        <Text
          style={styles.sectionHeadingValue}
          testID="mobile-appearance-settings-message-font-value"
        >
          {messageFontSizeValue}
        </Text>
      </View>
      <Text style={styles.sectionHint}>{copy.appearanceSettingsMessageFontSizeHint}</Text>
      <View style={[styles.settingsCard, styles.messageSizeCardBody]}>
        <View
          style={styles.messagePreviewBlock}
          testID="mobile-appearance-settings-message-preview"
        >
          <View style={styles.messagePreviewBubbleIn}>
            <Text
              style={[styles.messagePreviewBodyIn, previewBodyStyle]}
              testID="mobile-appearance-settings-preview-body-in"
            >
              {copy.appearanceSettingsMessagePreviewIncoming}
            </Text>
            <Text
              style={styles.messagePreviewClockIn}
              testID="mobile-appearance-settings-preview-clock-in"
            >
              {copy.appearanceSettingsMessagePreviewTime}
            </Text>
          </View>
          <View style={styles.messagePreviewBubbleOut}>
            <Text
              style={[styles.messagePreviewBodyOut, previewBodyStyle]}
              testID="mobile-appearance-settings-preview-body-out"
            >
              {copy.appearanceSettingsMessagePreviewOutgoing}
            </Text>
            <Text
              style={styles.messagePreviewClockOut}
              testID="mobile-appearance-settings-preview-clock-out"
            >
              {copy.appearanceSettingsMessagePreviewTime}
            </Text>
          </View>
        </View>
        <View style={styles.messageSliderRow}>
          <Text style={styles.messageSliderSmallA}>A</Text>
          <MessageFontSizeSlider
            disabled={messageFollowSystemFont}
            label={copy.appearanceSettingsMessageFontSizeSlider}
            onChange={setMessageFontSize}
            size={messageFontSize}
          />
          <Text style={styles.messageSliderLargeA}>A</Text>
        </View>
        <View style={styles.messageSliderLabels}>
          {MOBILE_MESSAGE_FONT_SIZES.map((stop) => (
            <Text
              key={stop}
              style={[
                styles.messageSliderLabel,
                stop === messageFontSize && styles.messageSliderLabelActive,
              ]}
            >
              {getMessageFontSizeLabel(locale, stop)}
            </Text>
          ))}
        </View>
      </View>

      {/* 5. METİN BOYUTU (arayüz) — K6: the existing global scale, kept. */}
      <Text style={styles.sectionHeading}>{copy.appearanceSettingsTextSizeHeading}</Text>
      <Text style={styles.sectionHint}>{copy.appearanceSettingsTextSizeHint}</Text>
      <View style={[styles.settingsCard, styles.textSizeCard]}>
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

      {/* 6. DÜZEN — K6: the existing workspace layout choice, kept. */}
      <Text style={styles.sectionHeading}>{copy.appearanceSettingsLayoutHeading}</Text>
      <View style={[styles.settingsCard, styles.optionRow]}>
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

      {/* 7. Toggle kartı — both default OFF, both persisted by the M0 provider. */}
      <View style={styles.settingsRowCard}>
        <View style={styles.toggleRow}>
          <View style={[styles.toggleIconTile, styles.toggleIconTileAccent]}>
            <MobileLineIcon color={theme.messaging.accent} name="grip" size={19} />
          </View>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>{copy.appearanceSettingsCompactTitle}</Text>
            <Text style={styles.toggleSubtitle}>{copy.appearanceSettingsCompactSubtitle}</Text>
          </View>
          <SettingsToggle
            label={copy.appearanceSettingsCompactTitle}
            onToggle={setMessageCompact}
            testID="mobile-appearance-settings-compact-toggle"
            value={messageCompact}
          />
        </View>
        <View style={styles.toggleRowDivider} />
        <View style={styles.toggleRow}>
          <View style={[styles.toggleIconTile, styles.toggleIconTileOnline]}>
            <MobileLineIcon color={theme.messaging.onlineText} name="activity" size={19} />
          </View>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>{copy.appearanceSettingsFollowSystemTitle}</Text>
            <Text style={styles.toggleSubtitle}>{copy.appearanceSettingsFollowSystemSubtitle}</Text>
          </View>
          <SettingsToggle
            label={copy.appearanceSettingsFollowSystemTitle}
            onToggle={setMessageFollowSystemFont}
            testID="mobile-appearance-settings-follow-system-toggle"
            value={messageFollowSystemFont}
          />
        </View>
      </View>

      {/* 8. Alt not. */}
      <Text style={styles.footerNote}>{copy.appearanceSettingsMessageFontSizeNote}</Text>
    </ScrollView>
  );
}
