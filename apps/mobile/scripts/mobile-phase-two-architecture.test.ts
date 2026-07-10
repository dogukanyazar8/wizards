import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const appRoot = join(process.cwd(), "src", "app");

describe("mobile Phase 2 architecture", () => {
  it("moves message data ownership into a dedicated feature hook", () => {
    const productApp = readFileSync(join(appRoot, "mobile-product-app.tsx"), "utf8");
    const messagingHook = join(appRoot, "features", "use-mobile-messaging-feature.ts");

    assert.equal(existsSync(messagingHook), true, "Expected a dedicated messaging feature hook");
    assert.match(productApp, /useMobileMessagingFeature/);

    const source = readFileSync(messagingHook, "utf8");
    assert.match(source, /useMobileChannelMessagesQuery/);
    assert.match(source, /useMobileDMMessagesQuery/);
    assert.match(source, /useMobileMessageSearchQuery/);
    assert.match(source, /useMobileChannelMessageMutation/);
    assert.match(source, /useMobileDMMessageMutation/);
  });
});
