import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { mobileAboutMetrics } from "../../../design/tokens";
import { useTheme } from "../../providers/mobile-theme-provider";
import {
  AuthWelcomeBrandMark,
  type AuthWelcomeBrandWaveformHeights,
} from "../auth/auth-welcome-brand-mark";
import {
  AboutChevronLeftIcon,
  AboutChevronRightIcon,
  AboutCloseIcon,
  AboutSearchIcon,
} from "./about-icons";
import { useMobileAboutPrimitiveStyles } from "./about-primitives.styles";

/**
 * The eleven shapes the thirteen "Hakkında" screens are built from
 * (00 §6). A screen that needs something one of these almost does extends the
 * component here rather than copying it — two nearly-identical rows are how the
 * 44px minimum and the −16px hairline drift apart.
 */

export interface AboutScreenHeaderAction {
  readonly accessibilityLabel: string;
  readonly icon: ReactNode;
  /** Present for 1c's "Bildir"; absent for the square icon buttons. */
  readonly label?: string;
  readonly onPress: () => void;
  readonly testID?: string;
}

export function AboutScreenHeader({
  action,
  backAccessibilityLabel,
  onBack,
  testID,
  title,
  trailing,
  variant = "back",
}: {
  readonly action?: AboutScreenHeaderAction;
  readonly backAccessibilityLabel: string;
  readonly onBack: () => void;
  readonly testID?: string;
  readonly title: string;
  /** Non-interactive status at the right edge, such as 2b's server total badge. */
  readonly trailing?: ReactNode;
  /** §3.11: 2f is a form, so it closes rather than going back. */
  readonly variant?: "back" | "close";
}) {
  const theme = useTheme();
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <View style={styles.header} {...(testID === undefined ? {} : { testID })}>
      <Pressable
        accessibilityLabel={backAccessibilityLabel}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        {...(testID === undefined ? {} : { testID: `${testID}-back` })}
      >
        {variant === "close" ? (
          <AboutCloseIcon
            color={theme.about.text}
            size={17}
            {...(testID === undefined ? {} : { testID: `${testID}-close-icon` })}
          />
        ) : (
          <AboutChevronLeftIcon
            color={theme.about.text}
            size={17}
            {...(testID === undefined ? {} : { testID: `${testID}-back-icon` })}
          />
        )}
      </Pressable>
      <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      {action ? (
        <Pressable
          accessibilityLabel={action.accessibilityLabel}
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [
            action.label === undefined ? styles.headerButton : styles.headerActionLabelled,
            pressed && styles.pressed,
          ]}
          {...(action.testID === undefined ? {} : { testID: action.testID })}
        >
          {action.icon}
          {action.label === undefined ? null : (
            <Text allowFontScaling={false} style={styles.headerActionLabel}>
              {action.label}
            </Text>
          )}
        </Pressable>
      ) : (
        (trailing ?? null)
      )}
    </View>
  );
}

/**
 * §3.2/§4.12: the collapsed 1b header appears once the scroll passes 12px and
 * fades in over 160 ms. The opacity is driven on the UI thread from the scroll's
 * shared value, so it never waits on a JS-thread frame; with reduced motion on
 * it snaps rather than easing.
 */
export function AboutStickyHeader({
  backAccessibilityLabel,
  onBack,
  scrollY,
  testID,
  title,
  trailingLabel,
  visible,
}: {
  readonly backAccessibilityLabel: string;
  readonly onBack: () => void;
  readonly scrollY: SharedValue<number>;
  readonly testID?: string;
  readonly title: string;
  readonly trailingLabel?: string;
  /** Mirrors the UI-thread threshold for accessibility tree visibility. */
  readonly visible?: boolean;
}) {
  const theme = useTheme();
  const styles = useMobileAboutPrimitiveStyles();
  const reduceMotion = useReducedMotion() === true;

  const animatedStyle = useAnimatedStyle(() => {
    const visible = scrollY.value > mobileAboutMetrics.stickyHeaderThreshold ? 1 : 0;

    return {
      opacity: reduceMotion
        ? visible
        : withTiming(visible, {
            duration: mobileAboutMetrics.stickyHeaderDurationMs,
            easing: Easing.out(Easing.cubic),
          }),
    };
  }, [reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden={visible === false}
      importantForAccessibility={visible === false ? "no-hide-descendants" : "auto"}
      pointerEvents="box-none"
      style={[styles.stickyHeader, animatedStyle]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View style={styles.stickyHeaderRow}>
        <Pressable
          accessibilityLabel={backAccessibilityLabel}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.stickyHeaderButton, pressed && styles.pressed]}
          {...(testID === undefined ? {} : { testID: `${testID}-back` })}
        >
          <AboutChevronLeftIcon color={theme.about.text} size={16} />
        </Pressable>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.stickyHeaderTitle}>
          {title}
        </Text>
        {trailingLabel === undefined ? null : (
          <Text maxFontSizeMultiplier={2} style={styles.stickyHeaderTrailing}>
            {trailingLabel}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

export interface AboutGroupLabelPadding {
  readonly bottom?: number;
  readonly horizontal?: number;
  readonly top?: number;
}

/** §2: 10.5/700 uppercase, 4px above its card. 1b compresses the block. */
export function AboutGroupLabel({
  label,
  padding,
  testID,
}: {
  readonly label: string;
  readonly padding?: AboutGroupLabelPadding;
  readonly testID?: string;
}) {
  const styles = useMobileAboutPrimitiveStyles();
  const paddingStyle: ViewStyle = {
    ...(padding?.bottom === undefined ? {} : { paddingBottom: padding.bottom }),
    ...(padding?.horizontal === undefined ? {} : { paddingHorizontal: padding.horizontal }),
    ...(padding?.top === undefined ? {} : { paddingTop: padding.top }),
  };

  return (
    <View style={[styles.groupLabelBlock, paddingStyle]}>
      <Text
        // §4.11 exempts badges and group labels from Dynamic Type; the tracking
        // is what makes them read as labels, and it does not survive scaling.
        allowFontScaling={false}
        style={styles.groupLabel}
        {...(testID === undefined ? {} : { testID })}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * §1.4's r24 card. It does not draw hairlines between its children: the rows
 * do, from their own `isFirst`, so a card can mix rows with anything else.
 */
export function AboutCard({
  children,
  padding,
  style,
  testID,
}: {
  readonly children: ReactNode;
  readonly padding?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}) {
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <View
      style={[styles.card, padding === undefined ? null : { padding }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      {children}
    </View>
  );
}

export function AboutRow({
  accessibilityLabel,
  isFirst = false,
  leading,
  onPress,
  paddingVertical,
  showChevron = false,
  subtitle,
  testID,
  title,
  trailing,
  value,
}: {
  readonly accessibilityLabel?: string;
  /** Every row but the first draws the hairline above itself (§2). */
  readonly isFirst?: boolean;
  readonly leading?: ReactNode;
  readonly onPress?: () => void;
  readonly paddingVertical?: number;
  readonly showChevron?: boolean;
  readonly subtitle?: string;
  readonly testID?: string;
  readonly title: string;
  readonly trailing?: ReactNode;
  readonly value?: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutPrimitiveStyles();
  const rowStyle = [
    styles.row,
    subtitle === undefined ? null : styles.rowWithSubtitle,
    paddingVertical === undefined ? null : { paddingVertical },
    isFirst ? null : styles.rowDivider,
  ];

  const content = (
    <>
      {leading}
      <View style={styles.rowText}>
        <Text maxFontSizeMultiplier={2} style={styles.rowTitle}>
          {title}
        </Text>
        {subtitle === undefined ? null : (
          <Text maxFontSizeMultiplier={2} style={styles.rowSubtitle}>
            {subtitle}
          </Text>
        )}
      </View>
      {value === undefined ? null : (
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.rowValue}>
          {value}
        </Text>
      )}
      {trailing}
      {showChevron ? <AboutChevronRightIcon color={theme.about.iconTint} size={14} /> : null}
    </>
  );

  // A row that only carries information is a `View`: announcing it as a button
  // promises a tap that does nothing.
  if (!onPress) {
    return (
      <View style={rowStyle} {...(testID === undefined ? {} : { testID })}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? (value ? `${title}, ${value}` : title)}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...rowStyle, pressed && styles.pressed]}
      {...(testID === undefined ? {} : { testID })}
    >
      {content}
    </Pressable>
  );
}

/**
 * §2's 44×26 toggle. `kit/toggle.tsx` is 46×27 with a 21px thumb — a different
 * handoff's geometry — so this one is written here rather than reshaping a
 * control twenty other screens already use.
 */
export function AboutToggle({
  accessibilityLabel,
  disabled = false,
  onValueChange,
  testID,
  value,
}: {
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly onValueChange: (next: boolean) => void;
  readonly testID?: string;
  readonly value: boolean;
}) {
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.toggleTrack,
        value ? styles.toggleTrackOn : styles.toggleTrackOff,
        disabled && styles.toggleDisabled,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      <View
        style={[styles.toggleKnob, value ? styles.toggleKnobOn : styles.toggleKnobOff]}
        {...(testID === undefined ? {} : { testID: `${testID}-knob` })}
      />
    </Pressable>
  );
}

export type AboutTypePillVariant = "fixed" | "improved" | "new";

/**
 * §3.3's change-type chip. 1c pins it to 62px so four rows share one text
 * column; 2a lets it size to its label.
 */
export function AboutTypePill({
  label,
  testID,
  variant,
  width = mobileAboutMetrics.typePillWidth,
}: {
  readonly label: string;
  readonly testID?: string;
  readonly variant: AboutTypePillVariant;
  readonly width?: number | "auto";
}) {
  const styles = useMobileAboutPrimitiveStyles();
  const surface =
    variant === "new"
      ? styles.typePillNew
      : variant === "improved"
        ? styles.typePillImproved
        : styles.typePillFixed;
  const labelStyle =
    variant === "new"
      ? styles.typePillNewLabel
      : variant === "improved"
        ? styles.typePillImprovedLabel
        : styles.typePillFixedLabel;

  return (
    <View
      style={[styles.typePill, surface, width === "auto" ? null : { width }]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Text
        // A 9px chip cannot scale without wrapping out of its fixed 62px.
        allowFontScaling={false}
        numberOfLines={1}
        style={[styles.typePillLabel, labelStyle]}
      >
        {label}
      </Text>
    </View>
  );
}

/** §7.25: one field for 2b's version search and 2e's help search. */
export function AboutSearchField({
  accessibilityLabel,
  autoFocus = false,
  clearAccessibilityLabel,
  onChangeText,
  onSubmitEditing,
  placeholder,
  testID,
  value,
}: {
  readonly accessibilityLabel?: string;
  readonly autoFocus?: boolean;
  readonly clearAccessibilityLabel?: string;
  readonly onChangeText: (next: string) => void;
  readonly onSubmitEditing?: () => void;
  readonly placeholder: string;
  readonly testID?: string;
  readonly value: string;
}) {
  const theme = useTheme();
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <View
      style={styles.searchField}
      {...(testID === undefined ? {} : { testID: `${testID}-container` })}
    >
      <AboutSearchIcon
        color={theme.about.iconTint}
        size={16}
        {...(testID === undefined ? {} : { testID: `${testID}-icon` })}
      />
      <TextInput
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxFontSizeMultiplier={2}
        onChangeText={onChangeText}
        placeholder={placeholder}
        // §7.22 forbids `iconTint` as a text colour, so the placeholder takes
        // the muted text token instead.
        placeholderTextColor={theme.about.textMuted}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
        {...(onSubmitEditing === undefined ? {} : { onSubmitEditing })}
        {...(testID === undefined ? {} : { testID })}
      />
      {value.length === 0 ? null : (
        <Pressable
          accessibilityLabel={clearAccessibilityLabel ?? accessibilityLabel ?? placeholder}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
          {...(testID === undefined ? {} : { testID: `${testID}-clear` })}
        >
          <AboutCloseIcon
            color={theme.about.iconTint}
            size={14}
            {...(testID === undefined ? {} : { testID: `${testID}-clear-icon` })}
          />
        </Pressable>
      )}
    </View>
  );
}

/** §3.8/§7.27: the single filled action, pinned to the bottom of 2c/2f/2g. */
export function AboutStickyFooterButton({
  busy = false,
  disabled = false,
  label,
  mode = "fixed",
  onLayout,
  onPress,
  testID,
}: {
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly mode?: "fixed" | "flow";
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled || busy }}
      disabled={disabled || busy}
      onLayout={onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.footerButton,
        mode === "fixed" ? styles.footerButtonPinned : styles.footerButtonFlow,
        (disabled || busy) && styles.footerButtonDisabled,
        pressed && !disabled && !busy && styles.pressed,
      ]}
      {...(testID === undefined ? {} : { testID })}
    >
      {busy ? (
        <ActivityIndicator
          color={styles.footerButtonLabel.color}
          size="small"
          {...(testID === undefined ? {} : { testID: `${testID}-spinner` })}
        />
      ) : (
        <Text maxFontSizeMultiplier={2} style={styles.footerButtonLabel}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** §3.9/§3.13: the shell 2d and 2h share, sitting in the device corner. */
export function AboutConsentSheetShell({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const styles = useMobileAboutPrimitiveStyles();

  return (
    <View style={styles.sheet} {...(testID === undefined ? {} : { testID })}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.sheetGrabber}
      />
      {children}
    </View>
  );
}

/**
 * §1.5's size ladder. The corner radius is not proportional across the whole
 * table — 50px takes 14 where the ratio would give 12.5 — so the four sizes the
 * handoff names are listed rather than computed.
 */
const ABOUT_BRAND_LOGO_RADII: Readonly<Record<number, number>> = Object.freeze({
  46: 11.5,
  50: 14,
  52: 13,
  60: 15,
});

/** The canonical 13/52 ratio, for a size the handoff does not name. */
const ABOUT_BRAND_LOGO_RADIUS_RATIO = 13 / 52;

export function resolveAboutBrandLogoRadius(size: number): number {
  return ABOUT_BRAND_LOGO_RADII[size] ?? size * ABOUT_BRAND_LOGO_RADIUS_RATIO;
}

/**
 * The app icon, wherever the About surfaces draw it. It wraps the canonical
 * brand mark rather than re-drawing the bars: §1.5 says the five heights are the
 * design system's, and a second copy would be free to drift from it.
 */
export function AboutBrandLogo({
  accessibilityLabel,
  size,
  testID,
  waveformHeights,
}: {
  readonly accessibilityLabel?: string;
  readonly size: number;
  readonly testID?: string;
  readonly waveformHeights?: AuthWelcomeBrandWaveformHeights;
}) {
  const styles = useMobileAboutPrimitiveStyles();
  const reduceMotion = useReducedMotion() === true;

  return (
    <View
      style={styles.brandLogo}
      {...(accessibilityLabel === undefined
        ? { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" }
        : { accessibilityLabel, accessibilityRole: "image" })}
    >
      <AuthWelcomeBrandMark
        animated={!reduceMotion}
        cornerRadius={resolveAboutBrandLogoRadius(size)}
        size={size}
        variant={waveformHeights === undefined ? "about" : "auth"}
        {...(waveformHeights === undefined ? {} : { waveformHeights })}
        {...(testID === undefined ? {} : { testID })}
      />
    </View>
  );
}
