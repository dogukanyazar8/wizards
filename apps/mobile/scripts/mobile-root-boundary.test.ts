import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(process.cwd(), "src", "app");

describe("mobile root boundary", () => {
  it("keeps the root component focused on app orchestration instead of screen UI", () => {
    const rootSource = readFileSync(
      join(appRoot, "whispr-mobile-root.tsx"),
      "utf8",
    );

    assert.match(
      rootSource,
      /import \{ ActiveScreen, AuthGate \} from "\.\/mobile-root-screens";/,
    );
    assert.doesNotMatch(
      rootSource,
      /\b(ActivityIndicator|Image|Pressable|StyleSheet|TextInput|View)\b/,
    );
  });

  it("keeps native screen rendering in the dedicated screen module", () => {
    const screenSource = readFileSync(
      join(appRoot, "mobile-root-screens.tsx"),
      "utf8",
    );

    assert.match(screenSource, /export function ActiveScreen\(/);
    assert.match(screenSource, /export function AuthGate\(/);
    assert.match(screenSource, /function MessagesScreen\(/);
    assert.match(screenSource, /function OverviewScreen\(/);
    assert.match(screenSource, /function ProfileSettingsScreen\(/);
  });
});
