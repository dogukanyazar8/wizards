import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ComponentType } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from "react-native";
import type {
  MobileBugReportCategory,
  MobileHelpArticle,
  MobileHelpCategory,
} from "@wizards/types";

import {
  inferBugReportCategoryFromHelpQuery,
  type MobileAboutCopy,
} from "../../../about/mobile-about-model";
import {
  cacheMobileHelpArticle,
  readCachedMobileHelpArticles,
  type CachedMobileHelpArticle,
} from "../../../about/mobile-help-cache";
import {
  getMobileHelpSearchQueryOptions,
  MOBILE_HELP_SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
  useMobileHelpArticlesQuery,
} from "../../../about/mobile-about-queries";
import { recordMobileHelpArticleView } from "../../../about/mobile-about-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import type { AboutIconProps } from "./about-icons";
import {
  AboutChatBubbleIcon,
  AboutChevronRightIcon,
  AboutPersonIcon,
  AboutServerListIcon,
  AboutVideoCameraIcon,
} from "./about-icons";
import {
  AboutCard,
  AboutGroupLabel,
  AboutScreenHeader,
  AboutSearchField,
} from "./about-primitives";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useMobileNetworkStatus } from "../../providers/mobile-network-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { formatMobileCompactCount } from "../../../locale/mobile-number-format";
import { mobileCopy } from "../../../locale/mobile-copy";
import { MobileMarkdownDocument } from "../../../legal/mobile-legal-document-screen";
import { useMobileAboutHelpCenterStyles } from "./about-help-center-screen.styles";

type MobileHelpCenterScreenProps = {
  readonly onBack: () => void;
  readonly onOpenBugReport: (category?: MobileBugReportCategory) => void;
};

type CategoryTile = {
  readonly icon: ComponentType<AboutIconProps>;
  readonly key: MobileHelpCategory;
  readonly title: string;
  readonly tone: "account" | "chat" | "media" | "server";
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function categoryTitle(copy: MobileAboutCopy, category: MobileHelpCategory): string {
  switch (category) {
    case "account":
      return copy.helpCategoryAccount;
    case "chat":
      return copy.helpCategoryChat;
    case "media":
      return copy.helpCategoryMedia;
    case "server":
      return copy.helpCategoryServer;
  }
}

function reportCategoryTitle(copy: MobileAboutCopy, category: MobileBugReportCategory): string {
  switch (category) {
    case "voice":
      return copy.reportCategoryVoice;
    case "chat":
      return copy.reportCategoryChat;
    case "notification":
      return copy.reportCategoryNotification;
    case "performance":
      return copy.reportCategoryPerformance;
    case "other":
      return copy.reportCategoryOther;
  }
}

function HelpArticleRow({
  article,
  categoryLabel,
  index,
  locale,
  onPress,
  rank,
  testID,
}: {
  readonly article: MobileHelpArticle;
  readonly categoryLabel?: string;
  readonly index: number;
  readonly locale: "en" | "tr";
  readonly onPress: () => void;
  readonly rank?: number;
  readonly testID: string;
}) {
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useMobileAboutHelpCenterStyles();
  const meta = fill(copy.helpReadMeta, {
    minutes: String(article.readMinutes),
    views: formatMobileCompactCount(article.views, locale),
  });

  return (
    <Pressable
      accessibilityLabel={`${article.title}, ${meta}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.articleRow,
        index > 0 && styles.articleRowDivider,
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {rank === undefined ? (
        <Text allowFontScaling={false} style={styles.searchCategory}>
          {categoryLabel}
        </Text>
      ) : (
        <Text
          allowFontScaling={false}
          style={styles.articleRank}
          testID={`mobile-help-popular-rank-${rank}`}
        >
          {String(rank)}
        </Text>
      )}
      <View style={styles.articleText}>
        <Text maxFontSizeMultiplier={2} style={styles.articleTitle}>
          {article.title}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.articleMeta}>
          {meta}
        </Text>
      </View>
      <View style={styles.chevron}>
        <AboutChevronRightIcon color={theme.about.iconTint} size={14} />
      </View>
    </Pressable>
  );
}

function WriteButton({
  onPress,
  testID,
}: {
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const { locale } = useMobileLocaleRuntime();
  const styles = useMobileAboutHelpCenterStyles();

  return (
    <Pressable
      accessibilityLabel={mobileCopy[locale].helpContactAction}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.writeButton, pressed && styles.pressed]}
      testID={testID}
    >
      <Text maxFontSizeMultiplier={2} style={styles.writeButtonLabel}>
        {mobileCopy[locale].helpContactAction}
      </Text>
    </Pressable>
  );
}

function ContactRow({
  onOpenBugReport,
}: {
  readonly onOpenBugReport: (category?: MobileBugReportCategory) => void;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutHelpCenterStyles();

  return (
    <AboutCard style={styles.contactCard} testID="mobile-help-contact">
      <View style={styles.contactText}>
        <Text maxFontSizeMultiplier={2} style={styles.contactTitle}>
          {copy.helpContact}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.contactMeta}>
          {copy.helpContactMeta}
        </Text>
      </View>
      <WriteButton onPress={() => onOpenBugReport(undefined)} testID="mobile-help-contact-write" />
    </AboutCard>
  );
}

function EmptySearchRow({
  category,
  onOpenBugReport,
}: {
  readonly category: MobileBugReportCategory;
  readonly onOpenBugReport: (category?: MobileBugReportCategory) => void;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutHelpCenterStyles();

  return (
    <AboutCard style={styles.contactCard} testID="mobile-help-empty-result">
      <View style={styles.contactText}>
        <Text maxFontSizeMultiplier={2} style={styles.contactTitle}>
          {copy.helpNotFound}
        </Text>
        <Text maxFontSizeMultiplier={2} style={styles.contactMeta}>
          {fill(copy.helpNotFoundMeta, {
            category: reportCategoryTitle(copy, category),
          })}
        </Text>
      </View>
      <WriteButton onPress={() => onOpenBugReport(category)} testID="mobile-help-empty-write" />
    </AboutCard>
  );
}

function CategoryGrid({
  categories,
}: {
  readonly categories: readonly {
    readonly articleCount: number;
    readonly key: MobileHelpCategory;
  }[];
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const theme = useTheme();
  const styles = useMobileAboutHelpCenterStyles();
  const counts = new Map(categories.map((entry) => [entry.key, entry.articleCount]));
  const tiles: readonly CategoryTile[] = [
    {
      icon: AboutPersonIcon,
      key: "account",
      title: copy.helpCategoryAccount,
      tone: "account",
    },
    {
      icon: AboutChatBubbleIcon,
      key: "chat",
      title: copy.helpCategoryChat,
      tone: "chat",
    },
    {
      icon: AboutVideoCameraIcon,
      key: "media",
      title: copy.helpCategoryMedia,
      tone: "media",
    },
    {
      icon: AboutServerListIcon,
      key: "server",
      title: copy.helpCategoryServer,
      tone: "server",
    },
  ];
  const rows = [tiles.slice(0, 2), tiles.slice(2, 4)];

  const iconColor = (tone: CategoryTile["tone"]) => {
    switch (tone) {
      case "account":
        return theme.about.accent;
      case "chat":
        return theme.about.successText;
      case "media":
        return theme.about.warningText;
      case "server":
        return theme.about.textSecondary;
    }
  };

  const iconToneStyle = (tone: CategoryTile["tone"]) => {
    switch (tone) {
      case "account":
        return styles.categoryAccountIcon;
      case "chat":
        return styles.categoryChatIcon;
      case "media":
        return styles.categoryMediaIcon;
      case "server":
        return styles.categoryServerIcon;
    }
  };

  return (
    <>
      <AboutGroupLabel
        label={copy.helpCategories}
        padding={{ bottom: 8, horizontal: 20, top: 16 }}
        testID="mobile-help-categories-label"
      />
      <View style={styles.categoryGrid} testID="mobile-help-category-grid">
        {rows.map((row, rowIndex) => (
          <View
            key={`category-row-${rowIndex}`}
            style={styles.categoryGridRow}
            testID={`mobile-help-category-grid-row-${rowIndex}`}
          >
            {row.map((tile) => {
              const Icon = tile.icon;
              return (
                <View
                  key={tile.key}
                  style={styles.categoryTile}
                  testID={`mobile-help-category-tile-${tile.key}`}
                >
                  <View style={[styles.categoryIconBox, iconToneStyle(tile.tone)]}>
                    <Icon color={iconColor(tile.tone)} size={16} />
                  </View>
                  <Text maxFontSizeMultiplier={2} style={styles.categoryTitle}>
                    {tile.title}
                  </Text>
                  <Text maxFontSizeMultiplier={2} style={styles.categoryCount}>
                    {fill(copy.helpCategoryCount, {
                      count: String(counts.get(tile.key) ?? 0),
                    })}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </>
  );
}

export function MobileHelpCenterScreen({ onBack, onOpenBugReport }: MobileHelpCenterScreenProps) {
  const { apiClient } = useMobileAuth();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const networkStatus = useMobileNetworkStatus();
  const theme = useTheme();
  const styles = useMobileAboutHelpCenterStyles();
  const [searchText, setSearchText] = useState("");
  const [cachedArticles, setCachedArticles] = useState<readonly CachedMobileHelpArticle[]>([]);
  const [openArticle, setOpenArticle] = useState<MobileHelpArticle | null>(null);
  const debouncedSearch = useDebouncedValue(searchText, MOBILE_HELP_SEARCH_DEBOUNCE_MS);
  const normalizedSearch = debouncedSearch.trim();
  const online = networkStatus !== "offline";
  const popularQuery = useMobileHelpArticlesQuery(apiClient, { popular: true }, online);
  const searchQuery = useQuery(
    getMobileHelpSearchQueryOptions(apiClient, normalizedSearch, online),
  );
  const searchActive =
    online && normalizedSearch.length >= 2 && normalizedSearch === searchText.trim();
  const emptyCategory = inferBugReportCategoryFromHelpQuery(normalizedSearch);

  useEffect(() => {
    let active = true;
    void readCachedMobileHelpArticles().then((articles) => {
      if (active) {
        setCachedArticles(articles);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const openHelpArticle = (article: MobileHelpArticle) => {
    void recordMobileHelpArticleView(apiClient, article.slug).catch(() => {
      // The count is analytics, never a navigation gate.
    });
    void cacheMobileHelpArticle(article);

    if (article.bodyMarkdown !== null) {
      setOpenArticle(article);
      return;
    }

    void Linking.openURL(article.url).catch(() => {
      // The platform owns URL error presentation; the help list stays usable.
    });
  };

  const popularArticles = popularQuery.data?.articles.slice(0, 4) ?? [];
  const searchArticles = searchQuery.data?.articles ?? [];
  const fallbackArticles = popularQuery.data === undefined ? cachedArticles : [];
  const popularCategories = popularQuery.data?.categories ?? [];
  const showInitialLoading =
    online &&
    popularQuery.data === undefined &&
    fallbackArticles.length === 0 &&
    popularQuery.isPending;

  if (openArticle?.bodyMarkdown) {
    return (
      <View style={styles.root} testID="mobile-help-article-reader">
        <AboutScreenHeader
          backAccessibilityLabel={copy.authBackAction}
          onBack={() => setOpenArticle(null)}
          testID="mobile-help-article-header"
          title={openArticle.title}
        />
        <ScrollView
          contentContainerStyle={styles.readerContent}
          showsVerticalScrollIndicator={false}
        >
          <MobileMarkdownDocument
            bodyMarkdown={openArticle.bodyMarkdown}
            testID="mobile-help-article-body"
          />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.root} testID="mobile-help-center-screen">
      <AboutScreenHeader
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-help-header"
        title={copy.helpTitle}
      />
      <View style={styles.searchSpacing}>
        <AboutSearchField
          accessibilityLabel={copy.helpSearch}
          onChangeText={setSearchText}
          placeholder={copy.helpSearch}
          testID="mobile-help-search"
          value={searchText}
        />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-help-scroll"
      >
        {searchActive ? (
          searchQuery.data === undefined ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.about.accent} size="small" />
            </View>
          ) : searchArticles.length === 0 ? (
            <EmptySearchRow category={emptyCategory} onOpenBugReport={onOpenBugReport} />
          ) : (
            <AboutCard style={styles.popularCard} testID="mobile-help-search-results">
              {searchArticles.map((article, index) => (
                <HelpArticleRow
                  article={article}
                  categoryLabel={categoryTitle(copy, article.category)}
                  index={index}
                  key={article.slug}
                  locale={locale}
                  onPress={() => openHelpArticle(article)}
                  testID={`mobile-help-search-row-${article.slug}`}
                />
              ))}
            </AboutCard>
          )
        ) : showInitialLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator
              color={theme.about.accent}
              size="small"
              testID="mobile-help-loading"
            />
          </View>
        ) : fallbackArticles.length > 0 ? (
          <>
            <AboutGroupLabel
              label={copy.helpRecent}
              padding={{ bottom: 8, horizontal: 20, top: 16 }}
              testID="mobile-help-recent-label"
            />
            <AboutCard style={styles.popularCard} testID="mobile-help-recent-card">
              {fallbackArticles.map((article, index) => (
                <HelpArticleRow
                  article={article}
                  index={index}
                  key={article.slug}
                  locale={locale}
                  onPress={() => openHelpArticle(article)}
                  rank={index + 1}
                  testID={`mobile-help-recent-row-${article.slug}`}
                />
              ))}
            </AboutCard>
          </>
        ) : (
          <>
            <AboutGroupLabel
              label={copy.helpPopular}
              padding={{ bottom: 8, horizontal: 20, top: 16 }}
              testID="mobile-help-popular-label"
            />
            <AboutCard style={styles.popularCard} testID="mobile-help-popular-card">
              {popularArticles.map((article, index) => (
                <HelpArticleRow
                  article={article}
                  index={index}
                  key={article.slug}
                  locale={locale}
                  onPress={() => openHelpArticle(article)}
                  rank={index + 1}
                  testID={`mobile-help-popular-row-${article.slug}`}
                />
              ))}
            </AboutCard>
            <CategoryGrid categories={popularCategories} />
          </>
        )}
        <ContactRow onOpenBugReport={onOpenBugReport} />
      </ScrollView>
    </View>
  );
}
