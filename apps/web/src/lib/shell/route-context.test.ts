import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveShellRouteContext } from "@/lib/shell/route-context";

describe("resolveShellRouteContext", () => {
  it("ayarlar modalında son sunucu kanal bağlamını korur", () => {
    const serverRoute = {
      channelId: "channel-1",
      pathname: "/channels/server-1/channel-1",
      serverId: "server-1",
    };

    assert.deepEqual(
      resolveShellRouteContext(
        {
          channelId: null,
          pathname: "/settings/account/profile",
          serverId: null,
        },
        serverRoute,
      ),
      serverRoute,
    );
  });

  it("ayarlar dışındaki rotalarda güncel bağlamı seçer", () => {
    const previousRoute = {
      channelId: "channel-1",
      pathname: "/channels/server-1/channel-1",
      serverId: "server-1",
    };

    for (const pathname of ["/home", "/settings-preview"]) {
      const currentRoute = { channelId: null, pathname, serverId: null };

      assert.deepEqual(
        resolveShellRouteContext(currentRoute, previousRoute),
        currentRoute,
        pathname,
      );
    }
  });
});
