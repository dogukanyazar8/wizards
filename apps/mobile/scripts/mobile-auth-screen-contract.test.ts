import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { MOBILE_AUTH_SCREEN_TEST_IDS } from "../src/app/screens/auth/mobile-auth-screen-contract";

const mobileRoot = path.resolve(import.meta.dirname, "..");
const authScreensRoot = path.join(mobileRoot, "src", "app", "screens", "auth");
const authKitRoot = path.join(mobileRoot, "src", "app", "components", "kit", "auth");
const authScreenContractSource = path.join(authScreensRoot, "mobile-auth-screen-contract.ts");

const rootScreenSources = [
  "auth-welcome-screen.tsx",
  "auth-login-screen.tsx",
  "auth-register-screen.tsx",
  "auth-forgot-password-screen.tsx",
] as const;

const containerSource = path.join(authScreensRoot, "mobile-auth-screen-containers.tsx");
const authPresentationAndContainerSources = readdirSync(authScreensRoot)
  .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
  .map((name) => path.join(authScreensRoot, name));
const presentationSources = authPresentationAndContainerSources.filter(
  (sourcePath) => sourcePath !== containerSource,
);
const authKitSources = readdirSync(authKitRoot)
  .filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
  .map((name) => path.join(authKitRoot, name));
const protectedProductionSources = [...authPresentationAndContainerSources, ...authKitSources];

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

function readSource(sourcePath: string) {
  return readFileSync(sourcePath, "utf8");
}

function countRootTestId(source: string, testId: string) {
  return [...source.matchAll(new RegExp(`testID\\s*=\\s*["']${testId}["']`, "g"))].length;
}

describe("mobile auth screen contract", () => {
  it("keeps the exact immutable root test ID list bound one-to-one to live presentation screens", () => {
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
      const owningSourceFile = rootScreenSources[index]!;
      const owningSource = readSource(path.join(authScreensRoot, owningSourceFile));
      assert.equal(
        countRootTestId(owningSource, testId),
        1,
        `${testId} must occur exactly once in its owning ${owningSourceFile}.`,
      );

      for (const otherSourceFile of rootScreenSources) {
        if (otherSourceFile === owningSourceFile) {
          continue;
        }

        const otherSource = readSource(path.join(authScreensRoot, otherSourceFile));
        assert.equal(
          countRootTestId(otherSource, testId),
          0,
          `${testId} must not drift into ${otherSourceFile}.`,
        );
      }
    }
  });

  it("keeps auth presentation sources free of fixture data and test-only runtime paths", () => {
    for (const sourcePath of protectedProductionSources) {
      const source = readSource(sourcePath);

      assert.doesNotMatch(
        source,
        /\bfrom\s*["'][^"']*(?:dummy|mock|demo|fixture)[^"']*["']/i,
        `${path.relative(mobileRoot, sourcePath)} must not import fixture data.`,
      );

      for (const forbidden of forbiddenSourcePatterns) {
        assert.doesNotMatch(
          source,
          forbidden.pattern,
          `${path.relative(mobileRoot, sourcePath)} contains ${forbidden.name}.`,
        );
      }
    }
  });

  it("keeps mobile auth context ownership in containers instead of pure presentation screens", () => {
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
