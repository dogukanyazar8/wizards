import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MobileReleaseDetail, MobileReleaseSummary } from "@wizards/types";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SectionList, Text, View } from "react-native";

import {
  groupReleasesByYear,
  type MobileAboutCopy,
  type MobileReleaseYearGroup,
} from "../../../about/mobile-about-model";
import { readMobileAboutPreferences } from "../../../about/mobile-about-preferences";
import {
  flattenMobileReleasePages,
  getMobileReleaseTotal,
  MOBILE_ABOUT_SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
  useMobileAboutReleaseQuery,
  useMobileAboutReleasesQuery,
} from "../../../about/mobile-about-queries";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { mobileCopy } from "../../../locale/mobile-copy";
import { EmptyState } from "../../components/kit/empty-state";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutArrowDownIcon, AboutChevronRightIcon } from "./about-icons";
import {
  AboutCard,
  AboutGroupLabel,
  AboutRow,
  AboutScreenHeader,
  AboutSearchField,
} from "./about-primitives";
import { useMobileAboutReleaseHistoryStyles } from "./about-release-history-screen.styles";

type MobileAboutReleaseHistoryScreenProps = {
  readonly installedVersion: string;
  readonly onBack: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
};

type ReleaseHistorySection = {
  readonly data: readonly MobileReleaseYearGroup[];
  readonly year: string;
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function formatReleaseDate(value: string, locale: "en" | "tr"): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
  })
    .format(new Date(parsed))
    .replace(/\.$/, "");
}

function formatReleaseMeta(
  copy: MobileAboutCopy,
  locale: "en" | "tr",
  release: MobileReleaseSummary,
): string {
  const parts = [
    formatReleaseDate(release.releasedAt, locale),
    fill(copy.whatsNewHistoryChangeCount, { count: String(release.changeCount) }),
  ];
  if (release.highlight) {
    parts.push(release.highlight);
  }
  return parts.join(" · ");
}

function mergeInstalledRelease(
  releases: readonly MobileReleaseSummary[],
  installedRelease: MobileReleaseDetail | undefined,
  installedVersion: string,
): readonly MobileReleaseSummary[] {
  const existing = releases.find((release) => release.version === installedVersion);
  if (existing) {
    return releases.map((release) =>
      release.version === installedVersion ? { ...release, installed: true } : release,
    );
  }
  return installedRelease ? [{ ...installedRelease, installed: true }, ...releases] : releases;
}

function releaseMatchesQuery(
  release: MobileReleaseSummary,
  installedRelease: MobileReleaseDetail | undefined,
  query: string,
  locale: "en" | "tr",
): boolean {
  if (query.length === 0) {
    return true;
  }

  const installedChanges =
    installedRelease?.version === release.version
      ? installedRelease.changes.flatMap((change) => [change.title, change.detail ?? ""])
      : [];
  const searchable = [
    release.version,
    release.codename ?? "",
    release.highlight ?? "",
    ...installedChanges,
  ]
    .join(" ")
    .toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");

  return searchable.includes(query);
}

function ReleaseStatusChip({
  label,
  testID,
  variant,
}: {
  readonly label: string;
  readonly testID: string;
  readonly variant: "installed" | "skipped";
}) {
  const styles = useMobileAboutReleaseHistoryStyles();

  return (
    <View
      style={[
        styles.statusChip,
        variant === "installed" ? styles.installedChip : styles.skippedChip,
      ]}
      testID={testID}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.statusChipLabel,
          variant === "installed" ? styles.installedChipLabel : styles.skippedChipLabel,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function ReleaseHistoryRow({
  copy,
  index,
  installedVersion,
  locale,
  onOpenReleaseNote,
  release,
  skippedVersion,
}: {
  readonly copy: MobileAboutCopy;
  readonly index: number;
  readonly installedVersion: string;
  readonly locale: "en" | "tr";
  readonly onOpenReleaseNote: (version: string) => void;
  readonly release: MobileReleaseSummary;
  readonly skippedVersion: string | null;
}) {
  const theme = useTheme();
  const styles = useMobileAboutReleaseHistoryStyles();
  const installed = release.version === installedVersion;
  const skipped = release.version === skippedVersion;
  const meta = formatReleaseMeta(copy, locale, release);

  return (
    <Pressable
      accessibilityLabel={`${release.version}, ${meta}`}
      accessibilityRole="button"
      onPress={() => onOpenReleaseNote(release.version)}
      style={({ pressed }) => [
        styles.releaseRow,
        index > 0 && styles.releaseRowDivider,
        pressed && styles.pressed,
      ]}
      testID={`mobile-about-release-row-${release.version}`}
    >
      <View
        style={[styles.marker, installed && styles.installedMarker]}
        testID={`mobile-about-release-marker-${release.version}`}
      >
        <View
          style={[styles.dot, installed ? styles.installedDot : styles.timelineDot]}
          testID={`mobile-about-release-dot-${release.version}`}
        />
      </View>
      <View style={styles.releaseText}>
        <View style={styles.titleLine}>
          <Text maxFontSizeMultiplier={2} style={styles.versionTitle}>
            {release.version}
            {release.codename ? <Text style={styles.codename}> “{release.codename}”</Text> : null}
          </Text>
          {installed ? (
            <ReleaseStatusChip
              label={copy.historyInstalled}
              testID={`mobile-about-release-installed-${release.version}`}
              variant="installed"
            />
          ) : null}
          {skipped ? (
            <ReleaseStatusChip
              label={copy.historySkipped}
              testID={`mobile-about-release-skipped-${release.version}`}
              variant="skipped"
            />
          ) : null}
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.releaseMeta}>
          {meta}
        </Text>
      </View>
      <View style={styles.chevron}>
        <AboutChevronRightIcon color={theme.about.iconTint} size={14} />
      </View>
    </Pressable>
  );
}

function ReleaseYearCard({
  copy,
  group,
  installedVersion,
  isFetchingNextPage,
  locale,
  onLoadOlder,
  onOpenReleaseNote,
  showLoadOlder,
  skippedVersion,
}: {
  readonly copy: MobileAboutCopy;
  readonly group: MobileReleaseYearGroup;
  readonly installedVersion: string;
  readonly isFetchingNextPage: boolean;
  readonly locale: "en" | "tr";
  readonly onLoadOlder: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
  readonly showLoadOlder: boolean;
  readonly skippedVersion: string | null;
}) {
  const theme = useTheme();
  const styles = useMobileAboutReleaseHistoryStyles();

  return (
    <AboutCard style={styles.yearCard} testID={`mobile-about-release-card-${group.year}`}>
      {group.releases.map((release, index) => (
        <ReleaseHistoryRow
          copy={copy}
          index={index}
          installedVersion={installedVersion}
          key={release.version}
          locale={locale}
          onOpenReleaseNote={onOpenReleaseNote}
          release={release}
          skippedVersion={skippedVersion}
        />
      ))}
      {showLoadOlder ? (
        <Pressable
          accessibilityLabel={copy.historyLoadOlder}
          accessibilityRole="button"
          disabled={isFetchingNextPage}
          onPress={onLoadOlder}
          style={({ pressed }) => [styles.loadOlderRow, pressed && styles.pressed]}
          testID="mobile-about-release-load-older"
        >
          {isFetchingNextPage ? (
            <ActivityIndicator
              color={theme.about.accent}
              size="small"
              testID="mobile-about-release-load-older-indicator"
            />
          ) : (
            <>
              <Text maxFontSizeMultiplier={2} style={styles.loadOlderLabel}>
                {copy.historyLoadOlder}
              </Text>
              <AboutArrowDownIcon color={theme.about.accent} size={14} />
            </>
          )}
        </Pressable>
      ) : null}
    </AboutCard>
  );
}

export function MobileAboutReleaseHistoryScreen({
  installedVersion,
  onBack,
  onOpenReleaseNote,
}: MobileAboutReleaseHistoryScreenProps) {
  const auth = useMobileAuth();
  const theme = useTheme();
  const styles = useMobileAboutReleaseHistoryStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const [searchText, setSearchText] = useState("");
  const [skippedVersion, setSkippedVersion] = useState<string | null>(null);
  const debouncedSearchText = useDebouncedValue(searchText, MOBILE_ABOUT_SEARCH_DEBOUNCE_MS);
  const releasesQuery = useMobileAboutReleasesQuery(auth.apiClient, installedVersion);
  const installedReleaseQuery = useMobileAboutReleaseQuery(auth.apiClient, installedVersion);
  const installedRelease = installedReleaseQuery.data;
  const loadedReleases = useMemo(
    () =>
      mergeInstalledRelease(
        flattenMobileReleasePages(releasesQuery.data),
        installedRelease,
        installedVersion,
      ),
    [installedRelease, installedVersion, releasesQuery.data],
  );
  const normalizedSearch = (
    searchText.trim().length === 0 ? "" : debouncedSearchText.trim()
  ).toLocaleLowerCase(locale === "tr" ? "tr-TR" : "en-US");
  const filteredReleases = useMemo(
    () =>
      loadedReleases.filter((release) =>
        releaseMatchesQuery(release, installedRelease, normalizedSearch, locale),
      ),
    [installedRelease, loadedReleases, locale, normalizedSearch],
  );
  const sections = useMemo<readonly ReleaseHistorySection[]>(
    () =>
      groupReleasesByYear(filteredReleases).map((group) => ({
        data: [group],
        year: group.year,
      })),
    [filteredReleases],
  );
  const total = getMobileReleaseTotal(releasesQuery.data);
  const lastSectionYear = sections.at(-1)?.year;
  const searchActive = normalizedSearch.length > 0;

  useEffect(() => {
    let active = true;
    void readMobileAboutPreferences(AsyncStorage).then((preferences) => {
      if (active) {
        setSkippedVersion(preferences.skippedVersion);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const loadOlder = () => {
    if (!releasesQuery.hasNextPage || releasesQuery.isFetchingNextPage) {
      return;
    }
    void releasesQuery.fetchNextPage();
  };

  const retry = () => {
    void Promise.all([releasesQuery.refetch(), installedReleaseQuery.refetch()]);
  };

  const hasUsableReleaseData = releasesQuery.data !== undefined && installedRelease !== undefined;
  const isLoading =
    !hasUsableReleaseData && (releasesQuery.isPending || installedReleaseQuery.isPending);
  const isError = !hasUsableReleaseData;

  return (
    <View style={styles.root} testID="mobile-about-release-history-screen">
      <AboutScreenHeader
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-about-release-history-header"
        title={copy.historyTitle}
        trailing={
          <View style={styles.totalBadge}>
            <Text
              accessibilityRole="text"
              allowFontScaling={false}
              style={styles.totalBadgeLabel}
              testID="mobile-about-release-total"
            >
              {String(total)}
            </Text>
          </View>
        }
      />
      <View style={styles.searchSpacing}>
        <AboutSearchField
          accessibilityLabel={copy.historySearch}
          clearAccessibilityLabel={copy.historySearchClear}
          onChangeText={setSearchText}
          placeholder={copy.historySearch}
          testID="mobile-about-release-search"
          value={searchText}
        />
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator
            color={theme.about.accent}
            size="small"
            testID="mobile-about-release-loading"
          />
        </View>
      ) : isError ? (
        <AboutCard style={styles.stateCard} testID="mobile-about-release-error">
          <AboutRow
            isFirst
            onPress={retry}
            title={copy.whatsNewLoadFailed}
            trailing={
              <Text maxFontSizeMultiplier={2} style={styles.loadOlderLabel}>
                {copy.retryAction}
              </Text>
            }
          />
        </AboutCard>
      ) : (
        <SectionList
          contentContainerStyle={styles.listContent}
          keyExtractor={(group) => group.year}
          ListEmptyComponent={
            <EmptyState
              description={copy.historyEmptyDescription}
              icon="search-outline"
              style={styles.emptyState}
              testID="mobile-about-release-empty"
              title={copy.historyEmptyTitle}
            />
          }
          ListFooterComponent={
            searchActive && releasesQuery.hasNextPage ? (
              <Pressable
                accessibilityLabel={copy.historyLoadOlder}
                accessibilityRole="button"
                onPress={loadOlder}
                style={({ pressed }) => [styles.searchScopeRow, pressed && styles.pressed]}
                testID="mobile-about-release-search-scope"
              >
                <Text maxFontSizeMultiplier={2} style={styles.searchScopeLabel}>
                  {fill(copy.historySearchScope, { count: String(loadedReleases.length) })}
                </Text>
              </Pressable>
            ) : null
          }
          renderItem={({ item, section }) => (
            <ReleaseYearCard
              copy={copy}
              group={item}
              installedVersion={installedVersion}
              isFetchingNextPage={releasesQuery.isFetchingNextPage}
              locale={locale}
              onLoadOlder={loadOlder}
              onOpenReleaseNote={onOpenReleaseNote}
              showLoadOlder={
                !searchActive &&
                releasesQuery.hasNextPage === true &&
                section.year === lastSectionYear
              }
              skippedVersion={skippedVersion}
            />
          )}
          renderSectionHeader={({ section }) => (
            <AboutGroupLabel
              label={section.year}
              padding={{ bottom: 8, horizontal: 20, top: 16 }}
              testID={`mobile-about-release-year-${section.year}`}
            />
          )}
          sections={sections}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          style={styles.list}
          testID="mobile-about-release-list"
        />
      )}
    </View>
  );
}
