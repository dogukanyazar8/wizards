import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = resolve(process.cwd(), "src/app/whispr-mobile-root.tsx");
const mobileProductApp = resolve(process.cwd(), "src/app/mobile-product-app.tsx");

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

  it("keeps query and UI state memory-only without persistence or offline queues", () => {
    const source = [
      readTree(resolve(process.cwd(), "src/query")),
      readTree(resolve(process.cwd(), "src/state")),
    ].join("\n");
    assert.doesNotMatch(
      source,
      /createJSONStorage|AsyncStorage|SecureStore|persist\s*\(|dehydrate\s*\(|hydrate\s*\(|offlineMutation|offlineQueue/i,
    );
  });

  it("derives server views from query hooks without a manual request state machine", () => {
    const source = readFileSync(mobileProductApp, "utf8");
    assert.match(source, /useMobileBootstrapQuery/);
    assert.match(source, /useMobileChannelMessageMutation/);
    assert.match(source, /toMobileChannelMessagesViewState/);
    assert.doesNotMatch(
      source,
      /fetchQuery\s*\(|fetchInfiniteQuery\s*\(|RequestIdRef|sendMobileChannelMessage|sendMobileDMMessage/,
    );
    assert.doesNotMatch(source, /productState|MobileProductScreenProvider/);
  });
});
