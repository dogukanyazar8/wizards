import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = resolve(process.cwd(), "src/app/whispr-mobile-root.tsx");
const mobileProductApp = resolve(process.cwd(), "src/app/mobile-product-app.tsx");
const mobileMessagingFeature = resolve(
  process.cwd(),
  "src/app/features/use-mobile-messaging-feature.ts",
);

function readTree(directory: string): string {
  return readdirSync(directory)
    .flatMap((entry) => {
      const path = resolve(directory, entry);
      return statSync(path).isDirectory() ? [readTree(path)] : [readFileSync(path, "utf8")];
    })
    .join("\n");
}

describe("mobile phase zero boundary", () => {
  it("keeps the root below 300 lines and limited to providers, shell, and navigation", () => {
    const source = readFileSync(mobileRoot, "utf8");
    assert.ok(source.split(/\r?\n/).length < 300, "mobile root must stay below 300 lines");
    assert.match(source, /MobileAppProviders/);
    assert.match(source, /MobileNavigator/);
    assert.doesNotMatch(source, /fetchMobile|sendMobile|RequestIdRef|useInfiniteQuery|useQuery\(/);
    assert.doesNotMatch(source, /ActiveScreenProps|MobileScreenRuntime|mobile-root-screens/);
  });

  it("keeps UI state memory-only and query persistence off the offline-queue path", () => {
    // Phase 0 kept the query cache memory-only. Read caching for the workspace
    // shell is now persisted (see mobile-query-cache-policy.ts), so the guard
    // narrowed rather than lifted: Zustand stores stay memory-only, no query
    // cache reaches SecureStore, and mutations still have no offline queue.
    assert.doesNotMatch(
      readTree(resolve(process.cwd(), "src/state")),
      /createJSONStorage|AsyncStorage|SecureStore|persist\s*\(|dehydrate\s*\(|hydrate\s*\(|offlineMutation|offlineQueue/i,
    );
    assert.doesNotMatch(
      readTree(resolve(process.cwd(), "src/query")),
      /createJSONStorage|SecureStore|offlineMutation|offlineQueue/i,
    );
  });

  it("derives server views from query hooks without a manual request state machine", () => {
    const productSource = readFileSync(mobileProductApp, "utf8");
    const featureSource = readFileSync(mobileMessagingFeature, "utf8");
    assert.match(featureSource, /useMobileBootstrapQuery/);
    assert.match(featureSource, /useMobileChannelMessageMutation/);
    assert.match(featureSource, /toMobileChannelMessagesViewState/);
    assert.doesNotMatch(
      featureSource,
      /fetchQuery\s*\(|fetchInfiniteQuery\s*\(|RequestIdRef|sendMobileChannelMessage|sendMobileDMMessage/,
    );
    assert.doesNotMatch(productSource, /productState|MobileProductScreenProvider/);
  });
});
