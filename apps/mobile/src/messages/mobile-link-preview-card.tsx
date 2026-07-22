import { useQuery } from "@tanstack/react-query";
import { Image, Linking, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileLinkPreview } from "./mobile-link-preview-client";

// 8b link preview card: flat soft surface, uppercase site row, tight typography.
const createStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 7,
    maxWidth: 230,
    overflow: "hidden" as const,
  },
  body: { gap: 2, paddingHorizontal: 11, paddingVertical: 9 },
  image: { height: 128, width: "100%" as const },
  site: {
    color: theme.text.visualFaint,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 10.5,
    letterSpacing: 0.84,
    lineHeight: 14,
    textTransform: "uppercase" as const,
  },
  title: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 12.5,
    lineHeight: 17,
  },
  description: {
    color: theme.text.visualSecondary,
    fontFamily: theme.typography.fontFamily,
    fontSize: 11.5,
    lineHeight: 16.1,
  },
});

export function MobileLinkPreviewCard({ messageId, url }: { messageId: string; url: string }) {
  const { apiClient } = useMobileAuth();
  const styles = useThemedStyles(createStyles);
  const query = useQuery({
    queryKey: mobileQueryKeys.linkPreview(messageId),
    queryFn: () => fetchMobileLinkPreview(apiClient, url),
    staleTime: 10 * 60_000,
    retry: 1,
  });
  if (!query.data || (!query.data.title && !query.data.description && !query.data.imageUrl))
    return null;
  const preview = query.data;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={preview.title ?? preview.siteName ?? preview.url}
      onPress={() => void Linking.openURL(preview.url)}
      style={styles.root}
      testID={`mobile-link-preview-${messageId}`}
    >
      {preview.imageUrl ? (
        <Image
          source={{ uri: preview.imageUrl }}
          style={styles.image}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <View style={styles.body}>
        {preview.siteName ? <Text style={styles.site}>{preview.siteName}</Text> : null}
        {preview.title ? (
          <Text numberOfLines={2} style={styles.title}>
            {preview.title}
          </Text>
        ) : null}
        {preview.description ? (
          <Text numberOfLines={2} style={styles.description}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
