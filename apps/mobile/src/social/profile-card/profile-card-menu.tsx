import { Pressable, Text, View } from "react-native";

import { useTheme } from "../../app/providers/mobile-theme-provider";
import { MobileLineIcon, type MobileLineIconName } from "../../design/mobile-line-icons";
import { useProfileCardStyles } from "./profile-card.styles";

export interface ProfileCardMenuItem {
  readonly destructive?: boolean;
  readonly icon: MobileLineIconName;
  readonly id: string;
  readonly label: string;
  onPress(): void;
}

/**
 * The 196px anchored menu from handoff 1b. `kit/context-menu` is a bottom sheet,
 * which is the wrong shape here: this menu hangs off the card's three-dot button
 * and has to stay inside the card's own layer. 11e adds its "Not ekle" row by
 * prepending one item — the structure takes any number of rows.
 */
export function ProfileCardMenu({ items }: { readonly items: readonly ProfileCardMenuItem[] }) {
  const styles = useProfileCardStyles();
  const theme = useTheme();

  return (
    <View accessibilityRole="menu" style={styles.menu} testID="mobile-profile-card-menu">
      {items.map((item, index) => (
        <Pressable
          accessibilityLabel={item.label}
          accessibilityRole="menuitem"
          key={item.id}
          onPress={item.onPress}
          style={({ pressed }) => [
            styles.menuItem,
            index < items.length - 1 && styles.menuItemDivided,
            pressed && styles.menuItemPressed,
          ]}
          testID={`mobile-profile-card-menu-${item.id}`}
        >
          <MobileLineIcon
            color={item.destructive ? theme.status.dangerOnBase : theme.profileCard.menuIcon}
            name={item.icon}
            size={15}
          />
          <Text style={[styles.menuLabel, item.destructive && styles.menuLabelDanger]}>
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
