import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { activeMobileCopy as copy } from "../../locale/mobile-locale-preferences";
import { mobileRadii, mobileSizing, mobileSpacing } from "../../design/tokens";
import { BottomSheet } from "./kit";
import { useTheme, useThemedStyles } from "../providers/mobile-theme-provider";
import { MOBILE_MESSAGE_EMOJI_DATA, type MobileEmojiCategory } from "./message-emoji-data";
import { useMobileHaptics } from "../providers/mobile-haptics-provider";

const CATEGORIES: readonly MobileEmojiCategory[] = ["faces", "gestures", "symbols"];

export function MessageEmojiPicker({
  isOpen,
  onClose,
  onSelect,
}: {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSelect: (emoji: string) => void;
}) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const { selection } = useMobileHaptics();
  const [category, setCategory] = useState<MobileEmojiCategory>("faces");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const emojis = useMemo(
    () =>
      MOBILE_MESSAGE_EMOJI_DATA.filter(
        (entry) =>
          (normalizedQuery.length > 0 || entry.category === category) &&
          (normalizedQuery.length === 0 ||
            entry.keywords.some((keyword) => keyword.includes(normalizedQuery))),
      ),
    [category, normalizedQuery],
  );

  return (
    <BottomSheet
      accessibilityLabel={copy.messageEmojiPickerTitle}
      onClose={onClose}
      open={isOpen}
      testID="mobile-message-emoji-picker"
    >
      <Text style={styles.title}>{copy.messageEmojiPickerTitle}</Text>
      <TextInput
        accessibilityLabel={copy.messageEmojiSearchLabel}
        onChangeText={setQuery}
        placeholder={copy.messageEmojiSearchPlaceholder}
        placeholderTextColor={theme.text.soft}
        style={styles.search}
        testID="mobile-message-emoji-search"
        value={query}
      />
      <View style={styles.tabs} testID="mobile-message-emoji-categories">
        {CATEGORIES.map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: item === category }}
            key={item}
            onPress={() => {
              selection();
              setCategory(item);
            }}
            style={[styles.tab, item === category && styles.tabSelected]}
            testID={`mobile-message-emoji-category-${item}`}
          >
            <Text style={[styles.tabText, item === category && styles.tabTextSelected]}>
              {copy.messageEmojiCategoryLabels[item]}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={emojis}
        keyExtractor={(item) => item.emoji}
        numColumns={6}
        renderItem={({ item }) => (
          <Pressable
            accessibilityLabel={item.emoji}
            accessibilityRole="button"
            onPress={() => {
              selection();
              onSelect(item.emoji);
              onClose();
            }}
            style={styles.emoji}
            testID={`mobile-message-emoji-${item.emoji}`}
          >
            <Text style={styles.emojiText}>{item.emoji}</Text>
          </Pressable>
        )}
        style={styles.grid}
        testID="mobile-message-emoji-grid"
      />
    </BottomSheet>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    emoji: {
      alignItems: "center",
      justifyContent: "center",
      minHeight: mobileSizing.minTouchTarget,
      flex: 1,
    },
    emojiText: { fontSize: 26 },
    grid: { maxHeight: 240 },
    search: {
      minHeight: mobileSizing.minTouchTarget,
      borderColor: theme.border.subtle,
      borderRadius: mobileRadii.control,
      borderWidth: 1,
      color: theme.text.primary,
      paddingHorizontal: mobileSpacing.row,
    },
    tab: {
      borderRadius: mobileRadii.pill,
      flex: 1,
      minHeight: mobileSizing.minTouchTarget,
      alignItems: "center",
      justifyContent: "center",
    },
    tabSelected: { backgroundColor: theme.accent.soft },
    tabText: { color: theme.text.muted, fontSize: 12, fontWeight: "800" },
    tabTextSelected: { color: theme.accent.strong },
    tabs: { flexDirection: "row", gap: mobileSpacing.row },
    title: { color: theme.text.primary, fontSize: 18, fontWeight: "900" },
  });
