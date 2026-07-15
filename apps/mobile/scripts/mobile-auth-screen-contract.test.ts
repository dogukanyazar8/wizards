import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { MOBILE_AUTH_SCREEN_TEST_IDS } from "../src/app/screens/auth/mobile-auth-screen-contract";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const authScreensRoot = path.join(mobileRoot, "src", "app", "screens", "auth");
const authKitRoot = path.join(mobileRoot, "src", "app", "components", "kit", "auth");
const authScreenContractSource = path.join(authScreensRoot, "mobile-auth-screen-contract.ts");
const protectedProductionRoots = [authScreensRoot, authKitRoot] as const;

const rootScreenSources = [
  "auth-welcome-screen.tsx",
  "auth-login-screen.tsx",
  "auth-register-screen.tsx",
  "auth-forgot-password-screen.tsx",
] as const;

const containerSource = path.join(authScreensRoot, "mobile-auth-screen-containers.tsx");

const forbiddenSourcePatterns = [
  {
    name: "dummy, mock, demo, or fake user/session data",
    pattern:
      /\b(?:dummy|mock|demo|fake)\s*(?:users?|accounts?|conversations?|messages?|auth(?:entication)?|authenticated|sessions?)\b/i,
  },
  {
    name: "hardcoded account email",
    pattern: /\b(?:email|username)\s*[:=]\s*["'][^"']+@[^"']+["']/i,
  },
  {
    name: "example credential literal",
    pattern: /["'][^"']+@(?:example|test|mailinator)\.(?:com|org|net)["']/i,
  },
  {
    name: "hardcoded credential value",
    pattern: /\b(?:password|passcode|credential)s?\s*[:=]\s*["'][^"']{4,}["']/i,
  },
  {
    name: "fabricated authenticated state",
    pattern:
      /\b(?:isAuthenticated|authenticated)\s*[:=]\s*true\b|\b(?:currentUser|authenticatedUser|session)\s*=\s*\{/i,
  },
  {
    name: "test-only runtime switch",
    pattern:
      /(?:if|switch)\s*\(\s*(?:__DEV__|process\.env\.(?:NODE_ENV|JEST_WORKER_ID))|(?:__DEV__|process\.env\.(?:NODE_ENV|JEST_WORKER_ID))\s*\?/,
  },
] as const;

const importSpecifierPattern =
  /(?:\bimport\s+(?:(?:type\s+)?[\w*$,\s{}]+\s+from\s+)?|\brequire\s*\(\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

function discoverSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return discoverSourceFiles(entryPath);
      }

      return entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
        ? [entryPath]
        : [];
    });
}

function discoverProtectedProductionSources() {
  return protectedProductionRoots.flatMap(discoverSourceFiles);
}

function readSource(sourcePath: string) {
  return readFileSync(sourcePath, "utf8");
}

function countRootTestId(source: string, testId: string) {
  return [...source.matchAll(new RegExp(`testID\\s*=\\s*["']${testId}["']`, "g"))].length;
}

function getImportedModuleSpecifiers(source: string) {
  return [...source.matchAll(importSpecifierPattern)].map((match) => match[1]!);
}

function assertRootTestIdOwnership(protectedProductionSources: readonly string[]) {
  assert.match(
    readSource(authScreenContractSource),
    /export const MOBILE_AUTH_SCREEN_TEST_IDS = \[\s*"mobile-auth-welcome-screen",\s*"mobile-auth-login-screen",\s*"mobile-auth-register-screen",\s*"mobile-auth-forgot-password-screen",\s*\] as const;/,
    "The production contract must remain an exact readonly tuple declaration.",
  );
  assert.equal(
    new Set(MOBILE_AUTH_SCREEN_TEST_IDS).size,
    MOBILE_AUTH_SCREEN_TEST_IDS.length,
    "Auth root test IDs must be unique.",
  );
  assert.equal(
    rootScreenSources.length,
    MOBILE_AUTH_SCREEN_TEST_IDS.length,
    "Every production auth root must have one stable contract ID.",
  );

  for (const [index, testId] of MOBILE_AUTH_SCREEN_TEST_IDS.entries()) {
    const owningSource = path.join(authScreensRoot, rootScreenSources[index]!);
    const occurrences = protectedProductionSources.flatMap((sourcePath) =>
      Array.from({ length: countRootTestId(readSource(sourcePath), testId) }, () => sourcePath),
    );

    assert.equal(
      occurrences.length,
      1,
      `${testId} must occur exactly once across all live auth presentation and kit sources.`,
    );
    assert.equal(occurrences[0], owningSource, `${testId} must stay in its declared presentation source.`);
  }
}

function assertNoFixtureDataImports(protectedProductionSources: readonly string[]) {
  for (const sourcePath of protectedProductionSources) {
    for (const specifier of getImportedModuleSpecifiers(readSource(sourcePath))) {
      assert.doesNotMatch(
        specifier,
        /(?:dummy|mock|demo|fixture)/i,
        `${path.relative(mobileRoot, sourcePath)} must not import fixture data.`,
      );
    }
  }
}

function assertNoForbiddenAuthSourcePatterns(protectedProductionSources: readonly string[]) {
  assertNoFixtureDataImports(protectedProductionSources);

  for (const sourcePath of protectedProductionSources) {
    const source = readSource(sourcePath);

    for (const forbidden of forbiddenSourcePatterns) {
      assert.doesNotMatch(
        source,
        forbidden.pattern,
        `${path.relative(mobileRoot, sourcePath)} contains ${forbidden.name}.`,
      );
    }
  }
}

function withTemporaryNestedAuthFixture(source: string, assertion: () => void) {
  const fixtureRoot = mkdtempSync(path.join(authScreensRoot, ".auth-contract-test-"));
  const nestedSource = path.join(fixtureRoot, "nested", "fixture-source.tsx");

  try {
    mkdirSync(path.dirname(nestedSource), { recursive: true });
    writeFileSync(nestedSource, source, "utf8");
    assertion();
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
}

describe("mobile auth screen contract", () => {
  it("keeps the exact immutable root test ID list bound one-to-one to live presentation screens", () => {
    assertRootTestIdOwnership(discoverProtectedProductionSources());
  });

  it("rejects a duplicate root ID from a nested live auth source", () => {
    withTemporaryNestedAuthFixture(
      'export const nestedAuthRoot = <View testID="mobile-auth-welcome-screen" />;\n',
      () => {
        assert.throws(
          () => assertRootTestIdOwnership(discoverProtectedProductionSources()),
          /mobile-auth-welcome-screen must occur exactly once across all live auth presentation and kit sources/,
        );
      },
    );
  });

  it("rejects static, require, and dynamic fixture imports from nested live auth sources", () => {
    const fixtureImports = [
      'import fixtureValue from "./fixture-data";\n',
      'void require("./fixture-data");\n',
      'void import("./fixture-data");\n',
    ];

    for (const fixtureImport of fixtureImports) {
      withTemporaryNestedAuthFixture(fixtureImport, () => {
        assert.throws(
          () => assertNoForbiddenAuthSourcePatterns(discoverProtectedProductionSources()),
          /must not import fixture data/,
        );
      });
    }
  });

  it("keeps auth presentation sources free of fixture data and test-only runtime paths", () => {
    assertNoForbiddenAuthSourcePatterns(discoverProtectedProductionSources());
  });

  it("keeps mobile auth context ownership in containers instead of pure presentation screens", () => {
    const protectedProductionSources = discoverProtectedProductionSources();
    const presentationSources = protectedProductionSources.filter(
      (sourcePath) => sourcePath.startsWith(authScreensRoot) && sourcePath !== containerSource,
    );

    for (const sourcePath of presentationSources) {
      assert.doesNotMatch(
        readSource(sourcePath),
        /\buseMobileAuth\b/,
        `${path.basename(sourcePath)} must remain a pure presentation screen.`,
      );
    }

    const authHookCallers = protectedProductionSources.filter((sourcePath) =>
      /\buseMobileAuth\s*\(/.test(readSource(sourcePath)),
    );
    assert.deepEqual(authHookCallers, [containerSource]);
    assert.match(readSource(containerSource), /import\s*\{\s*useMobileAuth\s*\}/);
  });
});
