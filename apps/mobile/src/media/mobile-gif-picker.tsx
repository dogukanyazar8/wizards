import { FlashList } from "@shopify/flash-list";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { MobileCachedImage } from "../app/components/mobile-cached-image";
import { BottomSheet, Button } from "../app/components/kit";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { searchMobileGiphy } from "./mobile-giphy-client";
import { mobileCopy } from "../locale/mobile-copy";

type Gif = Awaited<ReturnType<typeof searchMobileGiphy>>["gifs"][number];

const createStyles = (theme: MobileTheme) => ({
  root: { flex: 1, gap: 12 },
  header: { ...theme.typography.title, color: theme.text.primary },
  searchRow: { flexDirection: "row" as const, gap: 8 },
  input: {
    ...theme.typography.body,
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.default,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    color: theme.text.primary,
    flex: 1,
    paddingHorizontal: 12,
  },
  tile: { flex: 1, margin: 4, minHeight: 132 },
  image: { borderRadius: theme.radii.control, height: 104, width: "100%" as const },
  label: { ...theme.typography.caption, color: theme.text.muted, marginTop: 4 },
  empty: {
    ...theme.typography.body,
    color: theme.text.muted,
    padding: 24,
    textAlign: "center" as const,
  },
});

export function MobileGifPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose(): void;
  onSelect(gifId: string): Promise<boolean>;
}) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  const copy = mobileCopy[locale];
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<readonly Gif[]>([]);
  const [loadedGifIds, setLoadedGifIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open && gifs.length === 0) void runSearch();
    // Fire the initial search only on open. `runSearch` is a plain function (a dep
    // would re-run every render → loop) and `gifs.length` is read only as a guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  async function runSearch() {
    setBusy(true);
    setError(null);
    setLoadedGifIds(new Set());
    try {
      setGifs((await searchMobileGiphy(apiClient, { limit: 24, offset: 0, query })).gifs);
    } catch {
      setError(copy.gifPickerLoadFailed);
    } finally {
      setBusy(false);
    }
  }
  function markGifLoaded(id: string) {
    setLoadedGifIds((current) => {
      if (current.has(id)) return current;
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }
  async function choose(id: string) {
    setSendingId(id);
    try {
      if (await onSelect(id)) onClose();
    } finally {
      setSendingId(null);
    }
  }
  return (
    <BottomSheet
      accessibilityLabel={copy.gifPickerTitle}
      onClose={onClose}
      open={open}
      snapPoint={620}
      testID="mobile-gif-picker"
    >
      <View style={styles.root}>
        <Text style={styles.header}>GIF</Text>
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel={copy.gifPickerSearchGifs}
            autoCapitalize="none"
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            placeholder={copy.gifPickerSearchGifs}
            placeholderTextColor={theme.text.soft}
            style={styles.input}
            value={query}
            testID="mobile-gif-search-input"
          />
          <Button
            label={copy.gifPickerSearch}
            busy={busy}
            onPress={() => void runSearch()}
            testID="mobile-gif-search"
          />
        </View>
        {error ? (
          <Text accessibilityRole="alert" style={styles.empty}>
            {error}
          </Text>
        ) : null}
        <FlashList
          data={gifs}
          numColumns={2}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            !busy ? (
              <Text style={styles.empty}>{copy.gifPickerEmpty}</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.title}
              disabled={sendingId !== null}
              onPress={() => void choose(item.id)}
              style={styles.tile}
              testID={`mobile-gif-result-${item.id}`}
            >
              <MobileCachedImage
                onLoad={() => markGifLoaded(item.id)}
                source={{ uri: item.previewUrl }}
                style={styles.image}
                testID={
                  loadedGifIds.has(item.id) ? `mobile-gif-image-loaded-${item.id}` : undefined
                }
                transition={0}
              />
              <Text numberOfLines={1} style={styles.label}>
                {sendingId === item.id ? (copy.gifPickerSending) : item.title}
              </Text>
            </Pressable>
          )}
          testID="mobile-gif-results"
        />
      </View>
    </BottomSheet>
  );
}
