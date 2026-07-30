import type {
  MobileReleaseChange,
  MobileReleaseChangeType,
  MobileReleaseDetail,
} from "@wizards/types";
import { useMemo } from "react";
import { Pressable, ScrollView, Share, Text, View } from "react-native";

import type { MobileAboutCopy } from "../../../about/mobile-about-model";
import { useMobileAboutReleaseQuery } from "../../../about/mobile-about-queries";
import { MobileApiError } from "../../../api/mobile-api-client";
import { useMobileAuth } from "../../../auth/mobile-auth-context";
import { mobileCopy } from "../../../locale/mobile-copy";
import { formatMobileBytes } from "../../../locale/mobile-number-format";
import { EmptyState } from "../../components/kit/empty-state";
import { Skeleton } from "../../components/kit/skeleton";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useTheme } from "../../providers/mobile-theme-provider";
import { AboutShareIcon, AboutSparkIcon, AboutWaveformIcon } from "./about-icons";
import { AboutCard, AboutGroupLabel, AboutScreenHeader } from "./about-primitives";
import { useMobileAboutReleaseNoteStyles } from "./about-release-note-screen.styles";

type MobileAboutReleaseNoteScreenProps = {
  readonly onBack: () => void;
  readonly version: string;
  readonly webUrl: string;
};

type ReleaseGroupDefinition = {
  readonly copyKey: "releaseGroupFixed" | "releaseGroupImproved" | "releaseGroupNew";
  readonly type: MobileReleaseChangeType;
};

const RELEASE_GROUPS: readonly ReleaseGroupDefinition[] = [
  { copyKey: "releaseGroupNew", type: "new" },
  { copyKey: "releaseGroupImproved", type: "improved" },
  { copyKey: "releaseGroupFixed", type: "fixed" },
];

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

function formatReleaseDate(value: string, locale: "en" | "tr"): string {
  return new Intl.DateTimeFormat(locale === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
    .format(new Date(value))
    .replace(/\.$/, "");
}

function formatReleaseMeta(
  copy: MobileAboutCopy,
  locale: "en" | "tr",
  release: MobileReleaseDetail,
): string {
  const values: Record<string, string | undefined> = {
    build: release.buildNumber === undefined ? undefined : String(release.buildNumber),
    date: formatReleaseDate(release.releasedAt, locale),
    size:
      release.sizeBytes === undefined ? undefined : formatMobileBytes(release.sizeBytes, locale),
  };

  return copy.releaseMeta
    .split(" · ")
    .filter((segment) => {
      const placeholder = segment.match(/\{(\w+)\}/)?.[1];
      return placeholder === undefined || values[placeholder] !== undefined;
    })
    .map((segment) => segment.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match))
    .join(" · ");
}

function buildReleaseShareUrl(webUrl: string, version: string): string {
  return new URL(`/settings/about/releases/${encodeURIComponent(version)}`, webUrl).toString();
}

function isNotFound(error: unknown): boolean {
  return error instanceof MobileApiError && error.status === 404;
}

function ReleaseNoteLoading() {
  const styles = useMobileAboutReleaseNoteStyles();

  return (
    <>
      <View style={styles.loadingHeader} testID="mobile-about-release-loading-header">
        <Skeleton height={31} width={170} />
        <Skeleton height={20} width={260} />
        <Skeleton height={19} width="100%" />
      </View>
      {[0, 1, 2].map((index) => (
        <AboutCard
          key={index}
          style={styles.loadingCard}
          testID={`mobile-about-release-loading-card-${index}`}
        >
          <Skeleton height={18} width={110} />
          <Skeleton height={46} width="100%" />
          <Skeleton height={46} width="100%" />
        </AboutCard>
      ))}
    </>
  );
}

function ReleaseHeader({
  copy,
  locale,
  release,
}: {
  readonly copy: MobileAboutCopy;
  readonly locale: "en" | "tr";
  readonly release: MobileReleaseDetail;
}) {
  const styles = useMobileAboutReleaseNoteStyles();

  return (
    <View style={styles.releaseHeader} testID="mobile-about-release-header-block">
      <View style={styles.versionRow}>
        <Text
          maxFontSizeMultiplier={2}
          style={styles.version}
          testID="mobile-about-release-version"
        >
          {release.version}
        </Text>
        {release.codename ? (
          <Text
            maxFontSizeMultiplier={2}
            style={styles.codename}
            testID="mobile-about-release-codename"
          >
            “{release.codename}”
          </Text>
        ) : null}
      </View>
      <View style={styles.metaRow}>
        {release.installed === true ? (
          <View style={styles.currentBadge} testID="mobile-about-release-current-badge">
            <Text allowFontScaling={false} style={styles.currentBadgeLabel}>
              {copy.releaseCurrentBadge}
            </Text>
          </View>
        ) : null}
        <Text maxFontSizeMultiplier={2} style={styles.meta} testID="mobile-about-release-meta">
          {formatReleaseMeta(copy, locale, release)}
        </Text>
      </View>
      {release.summary ? (
        <Text
          maxFontSizeMultiplier={2}
          style={styles.summary}
          testID="mobile-about-release-summary"
        >
          {release.summary}
        </Text>
      ) : null}
    </View>
  );
}

function NewReleaseChanges({ changes }: { readonly changes: readonly MobileReleaseChange[] }) {
  const theme = useTheme();
  const styles = useMobileAboutReleaseNoteStyles();

  return (
    <AboutCard style={styles.newCard}>
      {changes.map((change, index) => (
        <View
          key={`${change.title}-${index}`}
          style={styles.newRow}
          testID={`mobile-about-release-new-row-${index}`}
        >
          <View style={styles.newIcon} testID={`mobile-about-release-new-icon-${index}`}>
            {
              // ReleaseChange deliberately has no icon field. The handoff fixes
              // item two to a waveform; later items return to the spark.
              index === 1 ? (
                <AboutWaveformIcon
                  color={theme.about.accent}
                  size={14}
                  testID="mobile-about-release-new-wave-icon"
                />
              ) : (
                <AboutSparkIcon color={theme.about.accent} size={14} />
              )
            }
          </View>
          <View style={styles.newText}>
            <Text
              maxFontSizeMultiplier={2}
              style={styles.newTitle}
              testID={`mobile-about-release-new-title-${index}`}
            >
              {change.title}
            </Text>
            {change.detail ? (
              <Text
                maxFontSizeMultiplier={2}
                style={styles.newDetail}
                testID={`mobile-about-release-new-detail-${index}`}
              >
                {change.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </AboutCard>
  );
}

function FlatReleaseChanges({
  changes,
  type,
}: {
  readonly changes: readonly MobileReleaseChange[];
  readonly type: "fixed" | "improved";
}) {
  const styles = useMobileAboutReleaseNoteStyles();

  return (
    <AboutCard style={styles.flatCard}>
      {changes.map((change, index) => (
        <View
          key={`${change.title}-${index}`}
          style={styles.flatRow}
          testID={`mobile-about-release-${type}-row-${index}`}
        >
          <View
            style={type === "improved" ? styles.improvedDot : styles.fixedDot}
            testID={`mobile-about-release-${type}-dot-${index}`}
          />
          <Text
            maxFontSizeMultiplier={2}
            style={styles.flatText}
            testID={`mobile-about-release-${type}-text-${index}`}
          >
            {change.title}
          </Text>
        </View>
      ))}
    </AboutCard>
  );
}

function ReleaseGroups({
  copy,
  release,
}: {
  readonly copy: MobileAboutCopy;
  readonly release: MobileReleaseDetail;
}) {
  const grouped = useMemo(
    () =>
      new Map(
        RELEASE_GROUPS.map(({ type }) => [
          type,
          release.changes.filter((change) => change.type === type),
        ]),
      ),
    [release.changes],
  );

  return (
    <>
      {RELEASE_GROUPS.map(({ copyKey, type }) => {
        const changes = grouped.get(type) ?? [];
        if (changes.length === 0) {
          return null;
        }

        return (
          <View key={type} testID={`mobile-about-release-group-${type}`}>
            <AboutGroupLabel
              label={fill(copy[copyKey], { count: String(changes.length) })}
              padding={{ bottom: 8, horizontal: 20, top: 16 }}
              testID={`mobile-about-release-group-label-${type}`}
            />
            {type === "new" ? (
              <NewReleaseChanges changes={changes} />
            ) : (
              <FlatReleaseChanges changes={changes} type={type} />
            )}
          </View>
        );
      })}
    </>
  );
}

function ReleaseErrorState({
  is404,
  onBack,
  onRetry,
}: {
  readonly is404: boolean;
  readonly onBack: () => void;
  readonly onRetry: () => void;
}) {
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const styles = useMobileAboutReleaseNoteStyles();
  const action = is404 ? onBack : onRetry;
  const title = is404 ? copy.releaseNotFound : copy.whatsNewLoadFailed;

  return (
    <EmptyState
      action={
        <Pressable
          accessibilityLabel={is404 ? copy.authBackAction : copy.retryAction}
          accessibilityRole="button"
          onPress={action}
          style={({ pressed }) => [styles.emptyAction, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={2} style={styles.emptyActionLabel}>
            {is404 ? copy.authBackAction : copy.retryAction}
          </Text>
        </Pressable>
      }
      icon="document-text-outline"
      style={styles.emptyState}
      testID={is404 ? "mobile-about-release-not-found" : "mobile-about-release-error"}
      title={title}
    />
  );
}

export function MobileAboutReleaseNoteScreen({
  onBack,
  version,
  webUrl,
}: MobileAboutReleaseNoteScreenProps) {
  const auth = useMobileAuth();
  const theme = useTheme();
  const styles = useMobileAboutReleaseNoteStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const releaseQuery = useMobileAboutReleaseQuery(auth.apiClient, version);
  const release = releaseQuery.data;
  const shareUrl = buildReleaseShareUrl(webUrl, version);

  const shareRelease = () => {
    void Share.share({ url: shareUrl }).catch(() => undefined);
  };

  return (
    <View style={styles.root} testID="mobile-about-release-note-screen">
      <AboutScreenHeader
        action={{
          accessibilityLabel: copy.releaseShare,
          icon: <AboutShareIcon color={theme.about.textSecondary} size={16} />,
          onPress: shareRelease,
          testID: "mobile-about-release-share",
        }}
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID="mobile-about-release-note-header"
        title={copy.releaseNoteTitle}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={styles.scroll}
        testID="mobile-about-release-scroll"
      >
        <View style={styles.content} testID="mobile-about-release-content">
          {release ? (
            <>
              <ReleaseHeader copy={copy} locale={locale} release={release} />
              <ReleaseGroups copy={copy} release={release} />
            </>
          ) : releaseQuery.isPending ? (
            <ReleaseNoteLoading />
          ) : (
            <ReleaseErrorState
              is404={isNotFound(releaseQuery.error)}
              onBack={onBack}
              onRetry={() => {
                void releaseQuery.refetch();
              }}
            />
          )}
        </View>
      </ScrollView>
    </View>
  );
}
