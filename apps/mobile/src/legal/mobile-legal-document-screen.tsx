import { useQuery } from "@tanstack/react-query";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { MobileLegalDocumentBlock, MobileLegalDocumentId } from "@wizards/types";

import { useMobileAuth } from "../auth/mobile-auth-context";
import { Skeleton } from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useTheme, useThemedStyles } from "../app/providers/mobile-theme-provider";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import type { MobileTheme } from "../design/themes";
import { mobileCopy } from "../locale/mobile-copy";
import { mobileQueryKeys } from "../query/mobile-query-keys";
import { fetchMobileLegalDocument } from "./mobile-legal-client";

/**
 * Reads a legal document inside the app instead of bouncing to the browser.
 * The text is the same file the web serves, parsed server-side into blocks, so
 * the wording can never drift between surfaces and a correction needs no app
 * release. Typography is ours: headings, subheadings and bullets get the same
 * rhythm as every other settings screen.
 */
export function MobileLegalDocumentScreen({
  documentId,
  onBack,
}: {
  readonly documentId: MobileLegalDocumentId;
  readonly onBack: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const theme = useTheme();
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  const documentQuery = useQuery({
    // Legal text changes on the order of months; there is no reason to refetch it
    // while the user scrolls back and forth between the three documents.
    gcTime: 60 * 60_000,
    queryFn: () => fetchMobileLegalDocument(apiClient, documentId),
    queryKey: mobileQueryKeys.legalDocument(documentId),
    staleTime: 60 * 60_000,
  });
  const document = documentQuery.data ?? null;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.root}
      testID="mobile-legal-document-screen"
    >
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-legal-document-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {document?.title ?? copy.legalDocumentTitle}
        </Text>
      </View>

      {document ? (
        <>
          <View style={styles.heroCard}>
            <View style={styles.heroBadge}>
              <MobileLineIcon color={theme.accent.strong} name="shield" size={13} />
              <Text style={styles.heroBadgeText} numberOfLines={2}>
                {document.badge}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{document.title}</Text>
            <Text style={styles.heroDescription}>{document.description}</Text>
            {document.lastUpdated ? (
              <View style={styles.heroMetaRow}>
                <MobileLineIcon color={theme.text.soft} name="calendar" size={13} />
                <Text style={styles.heroMetaText}>
                  {copy.legalDocumentLastUpdated.replace("{date}", document.lastUpdated)}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.documentCard} testID="mobile-legal-document-body">
            {document.blocks.map((block, index) => (
              <LegalBlock block={block} key={`${block.kind}-${index}`} />
            ))}
          </View>
        </>
      ) : documentQuery.isError ? (
        <View style={styles.stateCard} testID="mobile-legal-document-error">
          <Text style={styles.stateText}>{copy.legalDocumentError}</Text>
          <Pressable
            accessibilityLabel={copy.retryAction}
            accessibilityRole="button"
            onPress={() => void documentQuery.refetch()}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
            testID="mobile-legal-document-retry"
          >
            <Text style={styles.retryButtonText}>{copy.retryAction}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.stateCard} testID="mobile-legal-document-loading">
          <Skeleton borderRadius={10} height={18} width="62%" />
          <Skeleton borderRadius={8} height={13} width="94%" />
          <Skeleton borderRadius={8} height={13} width="88%" />
          <Skeleton borderRadius={8} height={13} width="72%" />
        </View>
      )}
    </ScrollView>
  );
}

function LegalBlock({ block }: { readonly block: MobileLegalDocumentBlock }) {
  const styles = useThemedStyles(createStyles);

  if (block.kind === "heading") {
    return <Text style={styles.heading}>{block.text}</Text>;
  }

  if (block.kind === "subheading") {
    return <Text style={styles.subheading}>{block.text}</Text>;
  }

  if (block.kind === "meta") {
    return <Text style={styles.meta}>{block.text}</Text>;
  }

  if (block.kind === "bullet") {
    return (
      <View style={styles.bulletRow}>
        <View style={styles.bulletDot} />
        <Text style={styles.bulletText}>{block.text}</Text>
      </View>
    );
  }

  return <Text style={styles.paragraph}>{block.text}</Text>;
}

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.surface.base, flex: 1 },
  content: { gap: 12, paddingBottom: 48, paddingHorizontal: 20, paddingTop: 8 },
  header: {
    alignItems: "center" as const,
    flexDirection: "row" as const,
    gap: 12,
    paddingVertical: 8,
  },
  backButton: {
    alignItems: "center" as const,
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 13,
    borderWidth: 1,
    height: 36,
    justifyContent: "center" as const,
    width: 36,
  },
  headerTitle: {
    color: theme.text.primary,
    flex: 1,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 19,
    minWidth: 0,
  },
  heroCard: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  heroBadge: {
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    backgroundColor: theme.accent.soft,
    borderRadius: 999,
    flexDirection: "row" as const,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    color: theme.accent.strong,
    flexShrink: 1,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 11.5,
  },
  heroTitle: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  heroDescription: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 19,
  },
  heroMetaRow: { alignItems: "center" as const, flexDirection: "row" as const, gap: 6 },
  heroMetaText: {
    color: theme.text.soft,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 11.5,
  },
  documentCard: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  heading: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyExtraBold,
    fontSize: 15.5,
    marginTop: 10,
  },
  subheading: {
    color: theme.text.primary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13.5,
    marginTop: 6,
  },
  paragraph: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
  },
  meta: {
    color: theme.text.soft,
    fontFamily: theme.typography.fontFamilySemiBold,
    fontSize: 12,
  },
  bulletRow: { flexDirection: "row" as const, gap: 9, paddingLeft: 2 },
  bulletDot: {
    backgroundColor: theme.accent.strong,
    borderRadius: 999,
    height: 5,
    marginTop: 8,
    width: 5,
  },
  bulletText: {
    color: theme.text.muted,
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 20,
    minWidth: 0,
  },
  stateCard: {
    backgroundColor: theme.surface.card,
    borderColor: theme.border.subtle,
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  stateText: {
    color: theme.text.muted,
    fontFamily: theme.typography.fontFamily,
    fontSize: 13,
    lineHeight: 19,
  },
  retryButton: {
    alignItems: "center" as const,
    alignSelf: "flex-start" as const,
    backgroundColor: theme.accent.action,
    borderRadius: 12,
    justifyContent: "center" as const,
    minHeight: 38,
    paddingHorizontal: 16,
  },
  retryButtonText: {
    color: theme.text.onPrimary,
    fontFamily: theme.typography.fontFamilyBold,
    fontSize: 13,
  },
  pressed: { opacity: 0.78 },
});
