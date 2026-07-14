import type { ReactNode } from "react";
import { Pressable, Text, View, type PressableProps, type ViewProps } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";

export interface ListRowProps extends Omit<PressableProps, "children"> {
  readonly leading?: ReactNode;
  readonly subtitle?: string;
  readonly title: string;
  readonly trailing?: ReactNode;
}

const createStyles = (theme: MobileTheme) => ({
  root: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minHeight: 56,
    paddingHorizontal: theme.spacing.section,
    paddingVertical: 10,
  },
  disabled: { opacity: 0.5 },
  pressed: { backgroundColor: theme.surface.soft },
  body: { flex: 1, minWidth: 0 },
  title: { ...theme.typography.bodyStrong, color: theme.text.primary },
  subtitle: { ...theme.typography.caption, color: theme.text.muted, marginTop: 2 },
});

export function ListRow({
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  disabled = false,
  leading,
  onPress,
  style,
  subtitle,
  title,
  trailing,
  ...props
}: ListRowProps) {
  const styles = useThemedStyles(createStyles);
  const isDisabled = disabled === true;
  const content = (
    <>
      {leading}
      <View style={styles.body}>
        <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.title}>
          {title}
        </Text>
        {subtitle ? (
          <Text maxFontSizeMultiplier={2} numberOfLines={2} style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        {...props}
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityRole={accessibilityRole ?? "button"}
        accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
        disabled={isDisabled}
        onPress={onPress}
        style={(state) => [
          styles.root,
          isDisabled && styles.disabled,
          state.pressed && !isDisabled && styles.pressed,
          typeof style === "function" ? style(state) : style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      {...(props as ViewProps)}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      style={[
        styles.root,
        isDisabled && styles.disabled,
        typeof style === "function" ? undefined : style,
      ]}
    >
      {content}
    </View>
  );
}
