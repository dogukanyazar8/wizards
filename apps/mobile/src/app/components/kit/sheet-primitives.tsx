import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, type ComponentProps, type ReactNode } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import type { MobileTheme } from "../../../design/themes";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";
import { useTheme, useThemedStyles } from "../../providers/mobile-theme-provider";
import { BottomSheet, type BottomSheetPresentation } from "./bottom-sheet";

export type SheetIconName = ComponentProps<typeof Ionicons>["name"];
export type SheetTone = "accent" | "danger" | "neutral" | "success" | "warning";

interface SheetToneColors {
  readonly border: string;
  readonly foreground: string;
  readonly surface: string;
}

/**
 * A sheet never invents its own palette: every badge, selected row and header
 * pulls the same tinted trio the screen rows already use, so a policy sheet and
 * the row that opened it read as one control.
 */
export function resolveSheetTone(theme: MobileTheme, tone: SheetTone): SheetToneColors {
  switch (tone) {
    case "danger":
      return {
        border: theme.status.danger,
        foreground: theme.status.dangerOnBase,
        surface: theme.status.dangerSoft,
      };
    case "success":
      return {
        border: theme.status.success,
        foreground: theme.status.successText,
        surface: theme.status.successSoft,
      };
    case "warning":
      return {
        border: theme.status.warning,
        foreground: theme.status.warning,
        surface: theme.status.warningSoft,
      };
    case "neutral":
      return {
        border: theme.border.default,
        foreground: theme.text.secondary,
        surface: theme.surface.soft,
      };
    case "accent":
    default:
      return {
        border: theme.accent.softBorder,
        foreground: theme.accent.strong,
        surface: theme.accent.soft,
      };
  }
}

/** Sheets stay well inside the fold even when a caller hands them a long list. */
const SHEET_MAX_HEIGHT_RATIO = 0.86;

export function useSheetPresentation(
  ratio: number = SHEET_MAX_HEIGHT_RATIO,
): BottomSheetPresentation {
  const windowHeight = useWindowDimensions().height;
  return useMemo(
    () => ({ panelStyle: { maxHeight: Math.round(windowHeight * ratio) } }),
    [ratio, windowHeight],
  );
}

const createStyles = (theme: MobileTheme) => ({
  badge: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    height: 38,
    justifyContent: "center" as const,
    width: 38,
  },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...theme.typography.title, color: theme.text.primary },
  subtitle: { ...theme.typography.caption, color: theme.text.muted },
  close: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.soft,
    borderRadius: theme.radii.pill,
    height: 30,
    justifyContent: "center" as const,
    width: 30,
  },
  root: { gap: 14 },
  options: { gap: 6 },
  option: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.radii.row,
    borderWidth: 1,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionSelected: { backgroundColor: theme.accent.soft, borderColor: theme.accent.softBorder },
  optionPressed: { opacity: 0.72 },
  optionDisabled: { opacity: 0.48 },
  optionIcon: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    height: 34,
    justifyContent: "center" as const,
    width: 34,
  },
  optionText: { flex: 1, gap: 1 },
  optionLabel: { ...theme.typography.bodyStrong, color: theme.text.primary },
  optionLabelSelected: { color: theme.accent.strong },
  optionDescription: { ...theme.typography.caption, color: theme.text.muted },
  check: {
    alignItems: "center" as const,
    borderColor: theme.border.default,
    borderRadius: theme.radii.pill,
    borderWidth: 1.5,
    height: 22,
    justifyContent: "center" as const,
    width: 22,
  },
  checkSelected: { backgroundColor: theme.accent.action, borderColor: theme.accent.action },
  actionLabelDestructive: { color: theme.status.dangerOnBase },
  chevron: { opacity: 0.7 },
});

export interface SheetHeaderProps {
  readonly icon?: SheetIconName;
  /** Optional trailing dismiss affordance; the backdrop and drag still close. */
  readonly onClose?: () => void;
  readonly subtitle?: string;
  readonly testID?: string;
  readonly title: string;
  readonly tone?: SheetTone;
  readonly closeAccessibilityLabel?: string;
}

/** Compact icon + title + hint block every redesigned sheet opens with. */
export function SheetHeader({
  closeAccessibilityLabel,
  icon,
  onClose,
  subtitle,
  testID,
  title,
  tone = "accent",
}: SheetHeaderProps) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const toneColors = resolveSheetTone(theme, tone);

  return (
    <View style={styles.header} {...(testID ? { testID } : {})}>
      {icon ? (
        <View
          style={[
            styles.badge,
            { backgroundColor: toneColors.surface, borderColor: toneColors.border },
          ]}
        >
          <Ionicons color={toneColors.foreground} name={icon} size={19} />
        </View>
      ) : null}
      <View style={styles.headerText}>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {onClose && closeAccessibilityLabel ? (
        <Pressable
          accessibilityLabel={closeAccessibilityLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.close, pressed && styles.optionPressed]}
          {...(testID ? { testID: `${testID}-close` } : {})}
        >
          <Ionicons color={theme.text.secondary} name="close" size={17} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface SheetOptionRowProps {
  readonly description?: string;
  readonly disabled?: boolean;
  readonly icon?: SheetIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly testID: string;
  readonly tone?: SheetTone;
}

/** Icon-led radio row: one tap picks and the sheet reports the pick back. */
export function SheetOptionRow({
  description,
  disabled = false,
  icon,
  label,
  onPress,
  selected,
  testID,
  tone = "accent",
}: SheetOptionRowProps) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const toneColors = resolveSheetTone(theme, tone);

  return (
    <Pressable
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        disabled && styles.optionDisabled,
        pressed && !disabled && styles.optionPressed,
      ]}
      testID={testID}
    >
      {icon ? (
        <View style={[styles.optionIcon, { backgroundColor: toneColors.surface }]}>
          <Ionicons color={toneColors.foreground} name={icon} size={17} />
        </View>
      ) : null}
      <View style={styles.optionText}>
        <Text
          maxFontSizeMultiplier={2}
          numberOfLines={1}
          style={[styles.optionLabel, selected && styles.optionLabelSelected]}
        >
          {label}
        </Text>
        {description ? (
          <Text numberOfLines={2} style={styles.optionDescription}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[styles.check, selected && styles.checkSelected]}>
        {selected ? <Ionicons color={theme.text.onPrimary} name="checkmark" size={14} /> : null}
      </View>
    </Pressable>
  );
}

export interface SheetAction {
  readonly description?: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly icon?: SheetIconName;
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly tone?: SheetTone;
}

export interface SheetActionRowProps {
  readonly action: SheetAction;
  readonly onPress: () => void;
  readonly testID: string;
}

/** Icon-led command row: same metrics as the radio row, trailing chevron instead of a check. */
export function SheetActionRow({ action, onPress, testID }: SheetActionRowProps) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const tone = action.tone ?? (action.destructive === true ? "danger" : "accent");
  const toneColors = resolveSheetTone(theme, tone);
  const isDisabled = action.disabled === true;

  return (
    <Pressable
      accessibilityLabel={
        action.description ? `${action.label}. ${action.description}` : action.label
      }
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        isDisabled && styles.optionDisabled,
        pressed && !isDisabled && styles.optionPressed,
      ]}
      testID={testID}
    >
      {action.icon ? (
        <View style={[styles.optionIcon, { backgroundColor: toneColors.surface }]}>
          <Ionicons color={toneColors.foreground} name={action.icon} size={17} />
        </View>
      ) : null}
      <View style={styles.optionText}>
        <Text
          maxFontSizeMultiplier={2}
          numberOfLines={1}
          style={[
            styles.optionLabel,
            action.destructive === true && styles.actionLabelDestructive,
          ]}
        >
          {action.label}
        </Text>
        {action.description ? (
          <Text numberOfLines={2} style={styles.optionDescription}>
            {action.description}
          </Text>
        ) : null}
      </View>
      <Ionicons
        color={theme.text.soft}
        name="chevron-forward"
        size={16}
        style={styles.chevron}
      />
    </Pressable>
  );
}

export interface ActionSheetProps {
  readonly accessibilityLabel?: string;
  readonly actions: readonly SheetAction[];
  readonly children?: ReactNode;
  readonly closeAccessibilityLabel?: string;
  readonly icon?: SheetIconName;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly subtitle?: string;
  readonly testID: string;
  readonly title: string;
  readonly tone?: SheetTone;
}

/**
 * Command sheet. The sheet dismisses before the action runs, so a screen the
 * action navigates away from never has to unwind an open overlay.
 */
export function ActionSheet({
  accessibilityLabel,
  actions,
  children,
  closeAccessibilityLabel,
  icon,
  onClose,
  open,
  subtitle,
  testID,
  title,
  tone = "accent",
}: ActionSheetProps) {
  const styles = useThemedStyles(createStyles);
  const haptics = useMobileHaptics();
  const presentation = useSheetPresentation();

  return (
    <BottomSheet
      accessibilityLabel={accessibilityLabel ?? title}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID={testID}
    >
      <View style={styles.root}>
        <SheetHeader
          {...(closeAccessibilityLabel ? { closeAccessibilityLabel, onClose } : {})}
          {...(icon ? { icon } : {})}
          {...(subtitle ? { subtitle } : {})}
          testID={`${testID}-header`}
          title={title}
          tone={tone}
        />
        <View accessibilityRole="menu" style={styles.options} testID={`${testID}-actions`}>
          {actions.map((action) => (
            <SheetActionRow
              action={action}
              key={action.id}
              onPress={() => {
                if (action.destructive === true) {
                  haptics.notification("warning");
                } else {
                  haptics.selection();
                }
                onClose();
                action.onPress();
              }}
              testID={action.testID ?? `${testID}-${action.id}`}
            />
          ))}
        </View>
        {children}
      </View>
    </BottomSheet>
  );
}

export interface SheetOption<TValue extends string> {
  readonly description?: string;
  readonly disabled?: boolean;
  readonly icon?: SheetIconName;
  readonly label: string;
  readonly tone?: SheetTone;
  readonly value: TValue;
}

export interface OptionSheetProps<TValue extends string> {
  readonly accessibilityLabel?: string;
  readonly children?: ReactNode;
  readonly closeAccessibilityLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: SheetIconName;
  readonly onClose: () => void;
  readonly onSelect: (value: TValue) => void;
  readonly open: boolean;
  readonly options: readonly SheetOption<TValue>[];
  /** Suffixed onto `testID` per row; defaults to the option value. */
  readonly optionTestID?: (value: TValue) => string;
  readonly selectedValue?: TValue | null;
  readonly subtitle?: string;
  readonly testID: string;
  readonly title: string;
  readonly tone?: SheetTone;
}

/**
 * Single-choice sheet. It sizes to its own rows instead of a guessed snap
 * point, so three options never rent the same height as ten.
 */
export function OptionSheet<TValue extends string>({
  accessibilityLabel,
  children,
  closeAccessibilityLabel,
  disabled = false,
  icon,
  onClose,
  onSelect,
  open,
  options,
  optionTestID,
  selectedValue = null,
  subtitle,
  testID,
  title,
  tone = "accent",
}: OptionSheetProps<TValue>) {
  const styles = useThemedStyles(createStyles);
  const haptics = useMobileHaptics();
  const presentation = useSheetPresentation();

  return (
    <BottomSheet
      accessibilityLabel={accessibilityLabel ?? title}
      onClose={onClose}
      open={open}
      presentation={presentation}
      sizing="content"
      testID={testID}
    >
      <View style={styles.root}>
        <SheetHeader
          {...(closeAccessibilityLabel ? { closeAccessibilityLabel, onClose } : {})}
          {...(icon ? { icon } : {})}
          {...(subtitle ? { subtitle } : {})}
          testID={`${testID}-header`}
          title={title}
          tone={tone}
        />
        <View accessibilityRole="radiogroup" style={styles.options} testID={`${testID}-options`}>
          {options.map((option) => (
            <SheetOptionRow
              {...(option.description ? { description: option.description } : {})}
              disabled={disabled || option.disabled === true}
              {...(option.icon ? { icon: option.icon } : {})}
              key={option.value}
              label={option.label}
              onPress={() => {
                haptics.selection();
                onSelect(option.value);
              }}
              selected={option.value === selectedValue}
              testID={`${testID}-${optionTestID ? optionTestID(option.value) : option.value}`}
              tone={option.tone ?? tone}
            />
          ))}
        </View>
        {children}
      </View>
    </BottomSheet>
  );
}
