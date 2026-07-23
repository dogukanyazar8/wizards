import Ionicons from "@expo/vector-icons/Ionicons";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { BottomSheet } from "./bottom-sheet";
import { Icon } from "./icon";
import { useSheetPresentation } from "./sheet-primitives";
import { useMobileHaptics } from "../../providers/mobile-haptics-provider";

export interface ContextMenuAction {
  destructive?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
  id: string;
  label: string;
  onPress(): void;
}

export interface ContextMenuProps {
  readonly accessibilityLabel: string;
  readonly actions: readonly ContextMenuAction[];
  readonly children: ReactNode;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly testID?: string;
}

const createStyles = (theme: MobileTheme) => ({
  trigger: { alignSelf: "stretch" as const },
  menu: { gap: 4 },
  action: {
    alignItems: "center" as const,
    borderRadius: theme.radii.control,
    flexDirection: "row" as const,
    gap: theme.spacing.row,
    minHeight: theme.sizing.minTouchTarget,
    paddingHorizontal: theme.spacing.section,
    paddingVertical: 10,
  },
  actionPressed: { backgroundColor: theme.surface.soft },
  actionDisabled: { opacity: 0.48 },
  actionLabel: { ...theme.typography.bodyStrong, color: theme.text.primary, flex: 1 },
  destructiveLabel: { color: theme.status.danger },
});

export function ContextMenu({
  accessibilityLabel,
  actions,
  children,
  disabled = false,
  onPress,
  testID = "mobile-context-menu",
}: ContextMenuProps) {
  const styles = useThemedStyles(createStyles);
  const haptics = useMobileHaptics();
  const presentation = useSheetPresentation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        delayLongPress={350}
        disabled={disabled}
        onLongPress={() => {
          haptics.impact();
          setOpen(true);
        }}
        onPress={onPress}
        style={styles.trigger}
        testID={`${testID}-trigger`}
      >
        {children}
      </Pressable>
      <BottomSheet
        accessibilityLabel={accessibilityLabel}
        onClose={() => setOpen(false)}
        open={open}
        presentation={presentation}
        sizing="content"
        testID={`${testID}-sheet`}
      >
        <View accessibilityRole="menu" style={styles.menu} testID={`${testID}-options`}>
          {actions.map((action) => {
            const isDisabled = action.disabled === true;
            return (
              <Pressable
                accessibilityLabel={action.label}
                accessibilityRole="menuitem"
                accessibilityState={{ disabled: isDisabled }}
                disabled={isDisabled}
                key={action.id}
                onPress={() => {
                  action.destructive ? haptics.notification("warning") : haptics.selection();
                  setOpen(false);
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  pressed && !isDisabled && styles.actionPressed,
                  isDisabled && styles.actionDisabled,
                ]}
              >
                {action.icon ? (
                  <Icon
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    name={action.icon}
                    tone={action.destructive ? "danger" : "secondary"}
                  />
                ) : null}
                <Text
                  maxFontSizeMultiplier={2}
                  style={[styles.actionLabel, action.destructive && styles.destructiveLabel]}
                >
                  {action.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>
    </>
  );
}
