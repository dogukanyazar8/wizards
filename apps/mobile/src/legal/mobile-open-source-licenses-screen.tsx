import { FlashList } from "@shopify/flash-list";
import { memo, useMemo, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";

import { EmptyState } from "../app/components/kit";
import { MobileLineIcon } from "../design/mobile-line-icons";
import { useMobileHaptics } from "../app/providers/mobile-haptics-provider";
import { useMobileLocaleRuntime } from "../app/providers/mobile-locale-provider";
import { useTheme } from "../app/providers/mobile-theme-provider";
import { mobileCopy } from "../locale/mobile-copy";
import { getMobileIntlLocale } from "../locale/mobile-locale-preferences";
import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "./mobile-open-source-license-manifest";
import {
  buildMobileOpenSourceLicenseList,
  summarizeMobileOpenSourceLicenses,
  toggleMobileOpenSourceLicense,
  type MobileOpenSourceLicenseListItem,
} from "./mobile-open-source-licenses-model";
import { useMobileOpenSourceLicensesStyles } from "./mobile-open-source-licenses-screen.styles";

/**
 * Attribution for every open-source package that ships inside the app.
 *
 * The manifest is generated from the lockfile the build resolves, so this is
 * the real dependency closure rather than a hand-kept list. Nearly eight
 * hundred rows is more than a page of reading, so the screen leads with the
 * license families, keeps them collapsed, and lets a search cut straight to a
 * package — the same card, row and section rhythm as the rest of settings.
 */
export function MobileOpenSourceLicensesScreen({
  appVersion,
  onBack,
}: {
  readonly appVersion: string;
  readonly onBack: () => void;
}) {
  const styles = useMobileOpenSourceLicensesStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const { selection } = useMobileHaptics();
  const [query, setQuery] = useState("");
  const [expandedLicenses, setExpandedLicenses] = useState<readonly string[]>([]);

  const summary = useMemo(
    () => summarizeMobileOpenSourceLicenses(MOBILE_OPEN_SOURCE_LICENSE_GROUPS),
    [],
  );
  const items = useMemo(
    () =>
      buildMobileOpenSourceLicenseList(MOBILE_OPEN_SOURCE_LICENSE_GROUPS, {
        expandedLicenses,
        query,
      }),
    [expandedLicenses, query],
  );

  const handleToggleLicense = (license: string) => {
    selection();
    setExpandedLicenses((current) => toggleMobileOpenSourceLicense(current, license));
  };

  return (
    <View style={styles.root} testID="mobile-open-source-licenses-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={copy.backAction}
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          testID="mobile-open-source-licenses-back"
        >
          <MobileLineIcon color={theme.text.primary} name="back-arrow" size={18} />
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>
          {copy.aboutSettingsLicenses}
        </Text>
      </View>

      <FlashList
        contentContainerStyle={styles.listContent}
        data={items}
        // Section headers and package rows are structurally different; typing
        // them keeps FlashList from recycling one shape into the other.
        getItemType={(item) => item.kind}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            description={copy.openSourceLicensesEmptyDescription}
            icon="search-outline"
            style={styles.emptyState}
            testID="mobile-open-source-licenses-empty"
            title={copy.openSourceLicensesEmptyTitle}
          />
        }
        ListFooterComponent={
          <View style={styles.note}>
            <MobileLineIcon color={theme.text.soft} name="info" size={14} />
            <Text style={styles.noteText}>{copy.openSourceLicensesNote}</Text>
          </View>
        }
        // A stable element, not an inline component: remounting the header on
        // every keystroke would tear the search field out from under the
        // keyboard.
        ListHeaderComponent={
          <LicensesListHeader
            appVersion={appVersion}
            licenseCount={summary.licenseCount}
            onChangeQuery={setQuery}
            packageCount={summary.packageCount}
            query={query}
          />
        }
        renderItem={({ item }) => (
          <LicenseListRow item={item} onToggleLicense={handleToggleLicense} />
        )}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function LicensesListHeader({
  appVersion,
  licenseCount,
  onChangeQuery,
  packageCount,
  query,
}: {
  readonly appVersion: string;
  readonly licenseCount: number;
  readonly onChangeQuery: (value: string) => void;
  readonly packageCount: number;
  readonly query: string;
}) {
  const styles = useMobileOpenSourceLicensesStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];
  const formatCount = (value: number) =>
    new Intl.NumberFormat(getMobileIntlLocale(locale)).format(value);

  return (
    <View>
      <View style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <MobileLineIcon color={theme.accent.strong} name="shield" size={13} />
          <Text numberOfLines={2} style={styles.heroBadgeText}>
            {copy.openSourceLicensesBadge}
          </Text>
        </View>
        <Text style={styles.heroTitle}>{copy.aboutSettingsLicenses}</Text>
        <Text style={styles.heroDescription}>{copy.openSourceLicensesDescription}</Text>
        <View style={styles.statRow}>
          <View style={styles.statChip} testID="mobile-open-source-licenses-package-stat">
            <Text style={styles.statValue}>{formatCount(packageCount)}</Text>
            <Text style={styles.statLabel}>{copy.openSourceLicensesPackagesLabel}</Text>
          </View>
          <View style={styles.statChip} testID="mobile-open-source-licenses-license-stat">
            <Text style={styles.statValue}>{formatCount(licenseCount)}</Text>
            <Text style={styles.statLabel}>{copy.openSourceLicensesLicensesLabel}</Text>
          </View>
        </View>
        <View style={styles.heroMetaRow}>
          <MobileLineIcon color={theme.text.soft} name="file" size={13} />
          <Text style={styles.heroMetaText}>
            {copy.openSourceLicensesVersionLabel.replace("{version}", appVersion)}
          </Text>
        </View>
      </View>

      <View style={styles.searchField}>
        <MobileLineIcon color={theme.text.soft} name="search" size={16} />
        <TextInput
          accessibilityLabel={copy.openSourceLicensesSearchPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={onChangeQuery}
          placeholder={copy.openSourceLicensesSearchPlaceholder}
          placeholderTextColor={theme.text.placeholder}
          returnKeyType="search"
          style={styles.searchInput}
          testID="mobile-open-source-licenses-search"
          value={query}
        />
        {query.length > 0 ? (
          <Pressable
            accessibilityLabel={copy.openSourceLicensesSearchClear}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => onChangeQuery("")}
            style={({ pressed }) => [styles.searchClear, pressed && styles.pressed]}
            testID="mobile-open-source-licenses-search-clear"
          >
            <MobileLineIcon color={theme.text.soft} name="close" size={11} />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.listHeaderSpacer} />
    </View>
  );
}

const LicenseListRow = memo(function LicenseListRow({
  item,
  onToggleLicense,
}: {
  readonly item: MobileOpenSourceLicenseListItem;
  readonly onToggleLicense: (license: string) => void;
}) {
  const styles = useMobileOpenSourceLicensesStyles();
  const theme = useTheme();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  if (item.kind === "license") {
    return (
      <Pressable
        accessibilityLabel={`${item.license}, ${
          item.isExpanded
            ? copy.openSourceLicensesCollapseAction
            : copy.openSourceLicensesExpandAction
        }`}
        accessibilityRole="button"
        accessibilityState={{ expanded: item.isExpanded }}
        onPress={() => onToggleLicense(item.license)}
        style={({ pressed }) => [
          styles.groupHeader,
          !item.isExpanded && styles.groupHeaderCollapsed,
          pressed && styles.pressed,
        ]}
        testID={`mobile-open-source-license-group-${item.license}`}
      >
        <View style={styles.groupIconBox}>
          <MobileLineIcon color={theme.accent.strong} name="file" size={16} />
        </View>
        <View style={styles.groupText}>
          <Text numberOfLines={2} style={styles.groupLicense}>
            {item.license}
          </Text>
          <Text style={styles.groupCountText}>
            {copy.openSourceLicensesPackageCount.replace("{count}", String(item.packageCount))}
          </Text>
        </View>
        <MobileLineIcon
          color={theme.text.soft}
          name={item.isExpanded ? "chevron-down" : "chevron-right"}
          size={14}
        />
      </Pressable>
    );
  }

  const { homepage, name, version } = item.package;

  return (
    <Pressable
      accessibilityLabel={homepage ? `${name}, ${copy.openSourceLicensesOpenHomepage}` : name}
      accessibilityRole={homepage ? "link" : "text"}
      disabled={homepage === null}
      onPress={() => {
        if (homepage) {
          void Linking.openURL(homepage).catch(() => undefined);
        }
      }}
      style={({ pressed }) => [
        styles.packageRow,
        item.isLast && styles.packageRowLast,
        pressed && homepage !== null && styles.pressed,
      ]}
      testID={`mobile-open-source-package-${name}`}
    >
      <Text numberOfLines={1} style={styles.packageName}>
        {name}
      </Text>
      <View style={styles.packageSpacer} />
      <Text numberOfLines={1} style={styles.packageVersion}>
        {version}
      </Text>
      {homepage ? <MobileLineIcon color={theme.text.soft} name="external-link" size={13} /> : null}
    </Pressable>
  );
});
