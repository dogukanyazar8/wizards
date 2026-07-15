import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";

import type { MobileTheme } from "../../../../design/themes";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { Icon } from "../icon";

export interface AuthCheckboxProps {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly label: string;
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
});

export function AuthCheckbox({
  checked,
  disabled = false,
  label,
  onPress,
  testID,
}: AuthCheckboxProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);

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
      <View style={[styles.box, checked && styles.boxChecked]}>
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
      <Text maxFontSizeMultiplier={2} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}
