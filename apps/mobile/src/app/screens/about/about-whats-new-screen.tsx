import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  MobileReleaseChangeType,
  MobileReleaseDetail,
  MobileReleaseSummary,
} from "@wizards/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  filterReleaseChanges,
  type MobileAboutCopy,
  type MobileReleaseChangeFilter,
} from "../../../about/mobile-about-model";
import {
  readMobileAboutPreferences,
  writeMobileAboutPreference,
} from "../../../about/mobile-about-preferences";
import {
  flattenMobileReleasePages,
  getMobileReleaseTotal,
  useMobileAboutReleaseQuery,
  useMobileAboutReleasesQuery,
} from "../../../about/mobile-about-queries";
import { mobileCopy } from "../../../locale/mobile-copy";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { Skeleton } from "../../components/kit/skeleton";
import { useToast } from "../../components/kit/toast";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutBellIcon, AboutChevronRightIcon } from "./about-icons";
import {
  AboutCard,
  AboutGroupLabel,
  AboutRow,
  AboutScreenHeader,
  AboutTypePill,
} from "./about-primitives";
import { useMobileAboutWhatsNewStyles } from "./about-whats-new-screen.styles";

const WHATS_NEW_PAGE_SIZE = 4;
const PREVIOUS_RELEASE_COUNT = 3;

type MobileAboutWhatsNewScreenProps = {
  readonly installedVersion: string;
  readonly onBack: () => void;
  readonly onOpenReleaseHistory: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
};

const FILTERS: readonly {
  readonly copyKey:
    "whatsNewFilterAll" | "whatsNewFilterFixed" | "whatsNewFilterImproved" | "whatsNewFilterNew";
  readonly value: MobileReleaseChangeFilter;
}[] = [
  { copyKey: "whatsNewFilterAll", value: "all" },
  { copyKey: "whatsNewFilterNew", value: "new" },
  { copyKey: "whatsNewFilterImproved", value: "improved" },
  { copyKey: "whatsNewFilterFixed", value: "fixed" },
];

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function formatReleaseDate(value: string, locale: "en" | "tr", withYear: boolean): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
    .format(new Date(parsed))
    .replace(/\.$/, "");
}

function typeLabel(copy: MobileAboutCopy, type: MobileReleaseChangeType): string {
  if (type === "new") {
    return copy.whatsNewTypeNew;
  }
  if (type === "improved") {
    return copy.whatsNewTypeImproved;
  }
  return copy.whatsNewTypeFixed;
}

function formatHistoryMeta(
  copy: MobileAboutCopy,
  locale: "en" | "tr",
  release: MobileReleaseSummary,
): string {
  const count = fill(copy.whatsNewHistoryChangeCount, {
    count: String(release.changeCount),
  });
  const parts = [formatReleaseDate(release.releasedAt, locale, false), count];
  if (release.highlight) {
    parts.push(release.highlight);
  }
  return parts.join(" · ");
}

function WhatsNewLoading() {
  const styles = useMobileAboutWhatsNewStyles();

  return (
    <>
      <AboutCard
        style={[styles.currentCard, styles.skeletonCurrent]}
        testID="mobile-about-current-skeleton"
      >
        <Skeleton height={20} width={150} />
        <Skeleton height={24} width={116} />
        <Skeleton height={18} width="100%" />
        <Skeleton height={20} width="100%" />
        <Skeleton height={20} width="92%" />
        <Skeleton height={20} width="96%" />
      </AboutCard>
      <AboutCard style={styles.skeletonHistory} testID="mobile-about-history-skeleton">
        <Skeleton height={44} width="100%" />
        <Skeleton height={44} width="100%" />
        <Skeleton height={44} width="100%" />
      </AboutCard>
    </>
  );
}

function CurrentReleaseCard({
  copy,
  filter,
  locale,
  onOpenReleaseNote,
  release,
}: {
  readonly copy: MobileAboutCopy;
  readonly filter: MobileReleaseChangeFilter;
  readonly locale: "en" | "tr";
  readonly onOpenReleaseNote: (version: string) => void;
  readonly release: MobileReleaseDetail;
}) {
  const theme = useTheme();
  const styles = useMobileAboutWhatsNewStyles();
  const filtered = useMemo(
    () => filterReleaseChanges(release.changes, filter),
    [filter, release.changes],
  );

  return (
    <AboutCard style={styles.currentCard} testID="mobile-about-current-card">
      <View style={styles.currentTopRow}>
        <View style={styles.currentBadge}>
          <Text allowFontScaling={false} style={styles.currentBadgeLabel}>
            {copy.whatsNewCurrent}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={2} style={styles.currentDate}>
          {formatReleaseDate(release.releasedAt, locale, true)}
        </Text>
      </View>

      <View style={styles.currentVersionRow}>
        <Text
          maxFontSizeMultiplier={2}
          style={styles.currentVersion}
          testID="mobile-about-current-version"
        >
          {release.version}
        </Text>
        {release.codename ? (
          <Text maxFontSizeMultiplier={2} style={styles.currentCodename}>
            “{release.codename}”
          </Text>
        ) : null}
      </View>

      {release.summary ? (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.currentSummary}
          testID="mobile-about-current-summary"
        >
          {release.summary}
        </Text>
      ) : null}

      <View style={styles.changeList}>
        {filtered.isEmpty ? (
          <Text maxFontSizeMultiplier={2} style={styles.emptyRow}>
            {copy.whatsNewEmpty}
          </Text>
        ) : (
          filtered.changes.map((change, index) => (
            <View
              key={`${change.type}-${change.title}-${index}`}
              style={styles.changeRow}
              testID={`mobile-about-current-change-${index}`}
            >
              <AboutTypePill
                label={typeLabel(copy, change.type)}
                testID={`mobile-about-current-change-pill-${index}`}
                variant={change.type}
                width={62}
              />
              <Text maxFontSizeMultiplier={2} style={styles.changeText}>
                {change.title}
              </Text>
            </View>
          ))
        )}
      </View>

      <Pressable
        accessibilityLabel={copy.whatsNewFullNotes}
        accessibilityRole="button"
        onPress={() => onOpenReleaseNote(release.version)}
        style={({ pressed }) => [styles.fullNote, pressed && styles.pressed]}
        testID="mobile-about-full-release-note"
      >
        <Text maxFontSizeMultiplier={2} style={styles.fullNoteLabel}>
          {copy.whatsNewFullNotes}
        </Text>
        <AboutChevronRightIcon color={theme.about.accent} size={13} />
      </Pressable>
    </AboutCard>
  );
}

function PreviousReleases({
  copy,
  locale,
  onOpenReleaseHistory,
  onOpenReleaseNote,
  releases,
  total,
}: {
  readonly copy: MobileAboutCopy;
  readonly locale: "en" | "tr";
  readonly onOpenReleaseHistory: () => void;
  readonly onOpenReleaseNote: (version: string) => void;
  readonly releases: readonly MobileReleaseSummary[];
  readonly total: number;
}) {
  const theme = useTheme();
  const styles = useMobileAboutWhatsNewStyles();

  return (
    <>
      <AboutGroupLabel
        label={copy.whatsNewPrevious}
        padding={{ bottom: 8, horizontal: 20, top: 18 }}
        testID="mobile-about-previous-label"
      />
      <AboutCard testID="mobile-about-history-card">
        {releases.map((release, index) => (
          <Pressable
            accessibilityLabel={`${release.version}, ${formatHistoryMeta(copy, locale, release)}`}
            accessibilityRole="button"
            key={release.version}
            onPress={() => onOpenReleaseNote(release.version)}
            style={({ pressed }) => [
              styles.historyRow,
              index > 0 && styles.historyRowDivider,
              pressed && styles.pressed,
            ]}
            testID={`mobile-about-history-row-${index}`}
          >
            <View style={styles.historyDot} testID={`mobile-about-history-dot-${index}`} />
            <View style={styles.historyText}>
              <Text maxFontSizeMultiplier={2} style={styles.historyTitle}>
                {release.version}
                {release.codename ? (
                  <Text style={styles.historyCodename}> “{release.codename}”</Text>
                ) : null}
              </Text>
              <Text maxFontSizeMultiplier={2} numberOfLines={1} style={styles.historyMeta}>
                {formatHistoryMeta(copy, locale, release)}
              </Text>
            </View>
            <AboutChevronRightIcon color={theme.about.iconTint} size={14} />
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel={fill(copy.whatsNewAllHistory, { count: String(total) })}
          accessibilityRole="button"
          onPress={onOpenReleaseHistory}
          style={({ pressed }) => [styles.allHistoryRow, pressed && styles.pressed]}
          testID="mobile-about-all-history"
        >
          <Text maxFontSizeMultiplier={2} style={styles.allHistoryLabel}>
            {fill(copy.whatsNewAllHistory, { count: String(total) })}
          </Text>
          <AboutChevronRightIcon color={theme.about.accent} size={14} />
        </Pressable>
      </AboutCard>
    </>
  );
}

export function MobileAboutWhatsNewScreen({
  installedVersion,
  onBack,
  onOpenReleaseHistory,
  onOpenReleaseNote,
}: MobileAboutWhatsNewScreenProps) {
  const auth = useMobileAuth();
  const theme = useTheme();
  const styles = useMobileAboutWhatsNewStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { showToast } = useToast();
  const [filter, setFilter] = useState<MobileReleaseChangeFilter>("all");
  const [releaseNotify, setReleaseNotify] = useState(false);
  const releaseNotifyTouchedRef = useRef(false);
  const seenVersionWriteRef = useRef<string | null>(null);

  const releasesQuery = useMobileAboutReleasesQuery(
    auth.apiClient,
    installedVersion,
    true,
    WHATS_NEW_PAGE_SIZE,
  );
  const currentReleaseQuery = useMobileAboutReleaseQuery(auth.apiClient, installedVersion);
  const releases = flattenMobileReleasePages(releasesQuery.data);
  const total = getMobileReleaseTotal(releasesQuery.data);
  const latestVersion = releases[0]?.version;
  const currentRelease = currentReleaseQuery.data;
  const previousReleases = useMemo(
    () =>
      releases
        .filter((release) => release.version !== installedVersion)
        .slice(0, PREVIOUS_RELEASE_COUNT),
    [installedVersion, releases],
  );

  useEffect(() => {
    let active = true;
    void readMobileAboutPreferences(AsyncStorage).then((preferences) => {
      if (active && !releaseNotifyTouchedRef.current) {
        setReleaseNotify(preferences.releaseNotify);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!releasesQuery.isSuccess || !latestVersion) {
      return;
    }
    if (seenVersionWriteRef.current === latestVersion) {
      return;
    }

    seenVersionWriteRef.current = latestVersion;
    void writeMobileAboutPreference(AsyncStorage, "seenVersion", latestVersion).catch(() => {
      if (seenVersionWriteRef.current === latestVersion) {
        seenVersionWriteRef.current = null;
      }
    });
  }, [latestVersion, releasesQuery.isSuccess]);

  const toggleReleaseNotify = () => {
    const next = !releaseNotify;
    releaseNotifyTouchedRef.current = true;
    setReleaseNotify(next);
    showToast({ title: copy.whatsNewNotify, variant: next ? "success" : "info" });
    void writeMobileAboutPreference(AsyncStorage, "releaseNotify", next).catch(() => {
      setReleaseNotify(!next);
      showToast({ title: copy.whatsNewNotify, variant: "error" });
    });
  };

  const retry = () => {
    void Promise.all([releasesQuery.refetch(), currentReleaseQuery.refetch()]);
  };

  const isLoading = releasesQuery.isPending || currentReleaseQuery.isPending;
  const isError = releasesQuery.isError || currentReleaseQuery.isError || !currentRelease;

  return (
    <View style={styles.root} testID="mobile-about-whats-new-screen">
      <AboutScreenHeader
        action={{
          accessibilityLabel: copy.whatsNewNotify,
          icon: (
            <AboutBellIcon
              color={theme.about.accent}
              crossedOut={!releaseNotify}
              filled={releaseNotify}
              size={14}
              testID={`mobile-about-release-notify-icon-${releaseNotify ? "on" : "off"}`}
            />
          ),
          label: copy.whatsNewNotify,
          onPress: toggleReleaseNotify,
          testID: "mobile-about-release-notify",
        }}
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-about-whats-new-header"
        title={copy.whatsNewTitle}
      />

      <ScrollView
        contentContainerStyle={styles.filterContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
      >
        {FILTERS.map((item) => {
          const selected = filter === item.value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={({ pressed }) => [
                styles.filterChip,
                selected ? styles.filterChipActive : styles.filterChipInactive,
                pressed && styles.pressed,
              ]}
              testID={`mobile-about-filter-${item.value}`}
            >
              <Text
                maxFontSizeMultiplier={2}
                style={[styles.filterLabel, selected && styles.filterLabelActive]}
              >
                {copy[item.copyKey]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={styles.contentScroll}
        testID="mobile-about-whats-new-scroll"
      >
        {isLoading ? (
          <WhatsNewLoading />
        ) : isError ? (
          <AboutCard testID="mobile-about-load-error">
            <AboutRow
              isFirst
              onPress={retry}
              title={copy.whatsNewLoadFailed}
              trailing={
                <Text maxFontSizeMultiplier={2} style={styles.errorAction}>
                  {copy.retryAction}
                </Text>
              }
            />
          </AboutCard>
        ) : (
          <>
            <CurrentReleaseCard
              copy={copy}
              filter={filter}
              locale={locale}
              onOpenReleaseNote={onOpenReleaseNote}
              release={currentRelease}
            />
            <PreviousReleases
              copy={copy}
              locale={locale}
              onOpenReleaseHistory={onOpenReleaseHistory}
              onOpenReleaseNote={onOpenReleaseNote}
              releases={previousReleases}
              total={total}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}
