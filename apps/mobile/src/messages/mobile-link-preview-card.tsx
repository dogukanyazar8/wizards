import { useQuery } from "@tanstack/react-query";
import { Image, Linking, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import { mobileMessagingMetrics as metrics } from "../design/tokens";
import type { MobileTheme } from "../design/themes";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileLinkPreview } from "./mobile-link-preview-client";

/**
 * MSG-1e §2 "1e".7 link preview: a screen-tone block with no border at all —
 * inside the channel it is one of the two allowed surface tones, so a frame
 * would make it a third.
 */
export const createMobileLinkPreviewStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.messaging.screen,
    borderRadius: metrics.channel.linkPreviewRadius,
    borderWidth: 0,
    marginTop: 2,
    maxWidth: metrics.channel.linkPreviewMaxWidth,
    overflow: "hidden" as const,
  },
  body: {
    gap: 3,
    paddingHorizontal: metrics.channel.linkPreviewPaddingHorizontal,
    paddingVertical: metrics.channel.linkPreviewPaddingVertical,
  },
  image: { height: 128, width: "100%" as const },
  site: {
    color: theme.messaging.groupLabel,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 9.5,
    letterSpacing: 0.95,
    lineHeight: 13,
    textTransform: "uppercase" as const,
  },
  title: {
    color: theme.messaging.textPrimary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 13,
    letterSpacing: -0.13,
    lineHeight: 17,
  },
  description: {
    color: theme.messaging.textSecondary,
    fontFamily: theme.typography.fontFamilyMedium,
    fontSize: 11.5,
    lineHeight: 16.7,
  },
});

export function MobileLinkPreviewCard({ messageId, url }: { messageId: string; url: string }) {
  const { apiClient } = useMobileAuth();
  const styles = useThemedStyles(createMobileLinkPreviewStyles);
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
