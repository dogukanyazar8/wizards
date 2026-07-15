import type { ComponentProps, ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export interface AuthCheckboxProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  /** Optional sibling rich inline content while `label` remains the checkbox's accessible name. */
  readonly labelContent?: ReactNode;
  readonly onPress: NonNullable<ComponentProps<typeof Pressable>["onPress"]>;
  readonly testID?: string;
}

const createStyles = (theme: MobileTheme) => ({
  box: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: theme.layout.auth.focusRingRadius,
    borderWidth: theme.layout.border.hairline,
    height: theme.layout.auth.termsCheckbox,
    justifyContent: "center" as const,
    width: theme.layout.auth.termsCheckbox,
  },
  boxRich: {
    left: (theme.sizing.minTouchTarget - theme.layout.auth.termsCheckbox) / 2,
    position: "absolute" as const,
    top: theme.layout.border.hairline,
  },
  boxChecked: {
    backgroundColor: theme.accent.action,
    borderColor: theme.accent.action,
  },
  disabled: { opacity: theme.layout.opacity.disabled },
  label: {
    ...theme.typography.authSubtitle,
    color: theme.text.muted,
    flex: 1,
  },
  root: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tightPlus,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 0,
  },
  richRoot: {
    alignItems: "flex-start" as const,
    flexDirection: "row" as const,
    gap: theme.layout.spacing.tightPlus,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: 0,
  },
  target: {
    flexShrink: 0,
    height: theme.sizing.minTouchTarget,
    marginLeft: -(theme.sizing.minTouchTarget - theme.layout.auth.termsCheckbox) / 2,
    marginRight: -theme.layout.spacing.tightPlus,
    minHeight: theme.sizing.minTouchTarget,
    minWidth: theme.sizing.minTouchTarget,
    position: "relative" as const,
    width: theme.sizing.minTouchTarget,
  },
});

export function AuthCheckbox({
  checked,
  disabled = false,
  label,
  labelContent,
  onPress,
  testID,
}: AuthCheckboxProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const checkboxBox = (
    <View style={[styles.box, labelContent != null && styles.boxRich, checked && styles.boxChecked]}>
      {checked ? (
        <Icon
          accessibilityElementsHidden
          name="checkmark"
          size={theme.layout.auth.checkboxCheckGlyph}
          testID={testID ? `${testID}-check-icon` : undefined}
          tone="inverse"
        />
      ) : null}
    </View>
  );

  if (labelContent == null) {
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={(event) => {
          if (!disabled) {
            onPress(event);
          }
        }}
        style={({ pressed }) => [
          styles.root,
          disabled && styles.disabled,
          pressed && !disabled && { opacity: theme.layout.opacity.pressed },
        ]}
        testID={testID}
      >
        {checkboxBox}
        <Text maxFontSizeMultiplier={2} style={styles.label}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.richRoot, disabled && styles.disabled]}>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={(event) => {
          if (!disabled) {
            onPress(event);
          }
        }}
        style={({ pressed }) => [
          styles.target,
          pressed && !disabled && { opacity: theme.layout.opacity.pressed },
        ]}
        testID={testID}
      >
        {checkboxBox}
      </Pressable>
      <Text maxFontSizeMultiplier={2} style={styles.label}>
        {labelContent}
      </Text>
    </View>
  );
}
