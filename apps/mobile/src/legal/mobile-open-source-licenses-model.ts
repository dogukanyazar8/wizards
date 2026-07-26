/**
 * Presentation model for the open-source licenses screen.
 *
 * The manifest is generated from the same lockfile the app builds from, so the
 * list cannot drift from what actually ships. Everything a screen needs to do
 * with it — search, expand/collapse, flattening for a recycled list — lives
 * here as plain functions so it can be tested without mounting React Native.
 */

export interface MobileOpenSourceLicensePackage {
  /** Canonical project page, when the package publishes an http(s) one. */
  readonly homepage: string | null;
  readonly name: string;
  readonly version: string;
}

export interface MobileOpenSourceLicenseGroup {
  /** SPDX expression exactly as the package declares it. */
  readonly license: string;
  readonly packages: readonly MobileOpenSourceLicensePackage[];
}

export interface MobileOpenSourceLicenseSummary {
  readonly licenseCount: number;
  readonly packageCount: number;
}

export type MobileOpenSourceLicenseListItem =
  | {
      readonly id: string;
      readonly isExpanded: boolean;
      readonly kind: "license";
      readonly license: string;
      readonly packageCount: number;
    }
  | {
      readonly id: string;
      readonly isLast: boolean;
      readonly kind: "package";
      readonly license: string;
      readonly package: MobileOpenSourceLicensePackage;
    };

export function summarizeMobileOpenSourceLicenses(
  groups: readonly MobileOpenSourceLicenseGroup[],
): MobileOpenSourceLicenseSummary {
  return {
    licenseCount: groups.length,
    packageCount: groups.reduce((total, group) => total + group.packages.length, 0),
  };
}

/**
 * Package and SPDX identifiers are ASCII, so a plain lowercase is enough and
 * avoids the Turkish dotted-I casing surprise a locale-aware fold would bring.
 */
function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

/**
 * A license section survives a search either because its own identifier matches
 * — then the whole section is the answer — or because some of its packages do,
 * in which case only those packages stay.
 */
function filterGroup(
  group: MobileOpenSourceLicenseGroup,
  query: string,
): MobileOpenSourceLicenseGroup | null {
  if (query.length === 0 || group.license.toLowerCase().includes(query)) {
    return group;
  }

  const packages = group.packages.filter((entry) => entry.name.toLowerCase().includes(query));
  return packages.length > 0 ? { license: group.license, packages } : null;
}

export function filterMobileOpenSourceLicenses(
  groups: readonly MobileOpenSourceLicenseGroup[],
  query: string,
): readonly MobileOpenSourceLicenseGroup[] {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) {
    return groups;
  }

  return groups.flatMap((group) => {
    const filtered = filterGroup(group, normalized);
    return filtered ? [filtered] : [];
  });
}

/**
 * Flattens the sections into the single array a recycled list wants. Sections
 * stay collapsed until the reader opens one, so the default screen is 19 rows
 * instead of every package at once; a search opens the surviving sections for
 * them, because a hit the reader still has to tap open is not a hit.
 */
export function buildMobileOpenSourceLicenseList(
  groups: readonly MobileOpenSourceLicenseGroup[],
  {
    expandedLicenses,
    query,
  }: { readonly expandedLicenses: readonly string[]; readonly query: string },
): readonly MobileOpenSourceLicenseListItem[] {
  const normalized = normalizeQuery(query);
  const isSearching = normalized.length > 0;

  return filterMobileOpenSourceLicenses(groups, normalized).flatMap((group) => {
    const isExpanded = isSearching || expandedLicenses.includes(group.license);
    const header = {
      id: `license:${group.license}`,
      isExpanded,
      kind: "license" as const,
      license: group.license,
      packageCount: group.packages.length,
    };

    if (!isExpanded) {
      return [header];
    }

    return [
      header,
      ...group.packages.map((entry, index) => ({
        id: `package:${group.license}:${entry.name}`,
        isLast: index === group.packages.length - 1,
        kind: "package" as const,
        license: group.license,
        package: entry,
      })),
    ];
  });
}

export function toggleMobileOpenSourceLicense(
  expandedLicenses: readonly string[],
  license: string,
): readonly string[] {
  return expandedLicenses.includes(license)
    ? expandedLicenses.filter((entry) => entry !== license)
    : [...expandedLicenses, license];
}
