import { useQuery } from "@tanstack/react-query";
import { Image, Linking, Pressable, Text, View } from "react-native";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { useThemedStyles } from "../app/providers/mobile-theme-provider";
import type { MobileTheme } from "../design/themes";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileLinkPreview } from "./mobile-link-preview-client";

const createStyles = (theme: MobileTheme) => ({
  root: {
    backgroundColor: theme.surface.soft,
    borderColor: theme.border.subtle,
    borderLeftColor: theme.accent.default,
    borderLeftWidth: 3,
    borderRadius: theme.radii.control,
    borderWidth: 1,
    marginTop: 8,
    overflow: "hidden" as const,
  },
  body: { gap: 3, padding: 10 },
  image: { height: 128, width: "100%" as const },
  site: { ...theme.typography.caption, color: theme.accent.strong },
  title: { ...theme.typography.bodyStrong, color: theme.text.primary },
  description: { ...theme.typography.caption, color: theme.text.muted },
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
          <Text numberOfLines={3} style={styles.description}>
            {preview.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
