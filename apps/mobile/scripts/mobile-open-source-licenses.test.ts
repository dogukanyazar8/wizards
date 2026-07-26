import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { MOBILE_OPEN_SOURCE_LICENSE_GROUPS } from "../src/legal/mobile-open-source-license-manifest";
import {
  buildMobileOpenSourceLicenseList,
  filterMobileOpenSourceLicenses,
  summarizeMobileOpenSourceLicenses,
  toggleMobileOpenSourceLicense,
  type MobileOpenSourceLicenseGroup,
} from "../src/legal/mobile-open-source-licenses-model";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const groups: readonly MobileOpenSourceLicenseGroup[] = [
  {
    license: "MIT",
    packages: [
      { homepage: "https://example.test/react", name: "react", version: "19.2.3" },
      { homepage: null, name: "zustand", version: "5.0.14" },
    ],
  },
  {
    license: "Apache-2.0",
    packages: [{ homepage: null, name: "typescript", version: "5.9.0" }],
  },
];

describe("open source license model", () => {
  it("counts every package and license family", () => {
    assert.deepEqual(summarizeMobileOpenSourceLicenses(groups), {
      licenseCount: 2,
      packageCount: 3,
    });
  });

  it("keeps every group when the query is blank", () => {
    assert.equal(filterMobileOpenSourceLicenses(groups, "   ").length, 2);
  });

  it("narrows a group to the packages that match", () => {
    const filtered = filterMobileOpenSourceLicenses(groups, "REACT");

    assert.deepEqual(
      filtered.map((group) => group.license),
      ["MIT"],
    );
    assert.deepEqual(
      filtered[0]?.packages.map((entry) => entry.name),
      ["react"],
    );
  });

  it("keeps a whole group when its license identifier matches", () => {
    const filtered = filterMobileOpenSourceLicenses(groups, "apache");

    assert.deepEqual(
      filtered.map((group) => group.license),
      ["Apache-2.0"],
    );
    assert.equal(filtered[0]?.packages.length, 1);
  });

  it("collapses sections until the reader opens one", () => {
    const collapsed = buildMobileOpenSourceLicenseList(groups, {
      expandedLicenses: [],
      query: "",
    });

    assert.deepEqual(
      collapsed.map((item) => item.kind),
      ["license", "license"],
    );

    const expanded = buildMobileOpenSourceLicenseList(groups, {
      expandedLicenses: ["MIT"],
      query: "",
    });

    assert.deepEqual(
      expanded.map((item) => item.kind),
      ["license", "package", "package", "license"],
    );
    // The last package of a section closes the card outline.
    assert.equal(expanded[2]?.kind === "package" && expanded[2].isLast, true);
    assert.equal(expanded[1]?.kind === "package" && expanded[1].isLast, false);
  });

  it("opens the surviving sections while a search is running", () => {
    const items = buildMobileOpenSourceLicenseList(groups, {
      expandedLicenses: [],
      query: "zus",
    });

    assert.deepEqual(
      items.map((item) => item.id),
      ["license:MIT", "package:MIT:zustand"],
    );
    assert.equal(items[0]?.kind === "license" && items[0].isExpanded, true);
  });

  it("returns nothing when no package or license matches", () => {
    assert.deepEqual(
      buildMobileOpenSourceLicenseList(groups, { expandedLicenses: [], query: "nope" }),
      [],
    );
  });

  it("toggles a section both ways", () => {
    const opened = toggleMobileOpenSourceLicense([], "MIT");
    assert.deepEqual(opened, ["MIT"]);
    assert.deepEqual(toggleMobileOpenSourceLicense(opened, "MIT"), []);
  });
});

describe("open source license manifest", () => {
  const summary = summarizeMobileOpenSourceLicenses(MOBILE_OPEN_SOURCE_LICENSE_GROUPS);

  it("ships the real production dependency closure", () => {
    assert.ok(summary.packageCount > 300, `only ${summary.packageCount} packages in the manifest`);
    assert.ok(summary.licenseCount > 5, `only ${summary.licenseCount} licenses in the manifest`);
  });

  it("names the direct runtime dependencies the app is built on", () => {
    const names = new Set(
      MOBILE_OPEN_SOURCE_LICENSE_GROUPS.flatMap((group) =>
        group.packages.map((entry) => entry.name),
      ),
    );

    for (const dependency of ["react", "react-native", "expo", "zustand"]) {
      assert.equal(names.has(dependency), true, `${dependency} missing from the manifest`);
    }
  });

  it("keeps every entry renderable: a version and, when present, an http homepage", () => {
    for (const group of MOBILE_OPEN_SOURCE_LICENSE_GROUPS) {
      assert.ok(group.license.length > 0);
      assert.ok(group.packages.length > 0, `${group.license} has no packages`);

      for (const entry of group.packages) {
        assert.ok(entry.name.length > 0, `${group.license} has a nameless package`);
        assert.ok(entry.version.length > 0, `${entry.name} has no version`);
        if (entry.homepage !== null) {
          assert.match(entry.homepage, /^https?:\/\//, `${entry.name} homepage is not a URL`);
        }
      }
    }
  });

  it("stays generated: the manifest is never hand-edited", () => {
    assert.match(
      read("../src/legal/mobile-open-source-license-manifest.ts"),
      /Generated by scripts\/generate-mobile-open-source-licenses\.ts/,
    );
  });
});

describe("open source licenses screen wiring", () => {
  it("is reachable as its own route from the about screen", () => {
    const routeTypes = read("../src/navigation/mobile-navigation-types.ts");
    const navigator = read("../src/navigation/mobile-navigator.tsx");
    const containers = read("../src/app/screens/mobile-screen-containers.tsx");
    const settings = read("../src/app/screens/settings-screen.tsx");
    const about = read("../src/app/screens/mobile-about-settings-screen.tsx");

    assert.match(routeTypes, /OpenSourceLicenses: undefined;/);
    assert.match(navigator, /<RootStack\.Screen name="OpenSourceLicenses">/);
    assert.match(containers, /export function OpenSourceLicensesScreenContainer\(/);
    assert.match(settings, /mobileNavigationRef\.navigate\("OpenSourceLicenses"\)/);
    assert.match(settings, /onOpenLicenses=\{openMobileOpenSourceLicenses\}/);

    // The row used to be a dead "coming soon" entry; it now opens the screen.
    assert.match(about, /onPress=\{onOpenLicenses\}/);
    assert.doesNotMatch(about, /soonLabel/);
  });
});
