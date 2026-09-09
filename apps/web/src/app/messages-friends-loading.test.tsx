import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const friendsLoadingPath = join(appDirectory, "(main)", "messages", "friends", "loading.tsx");

describe("/messages/friends route loading boundary", () => {
  it("uses a local regional fallback instead of the application startup screen", async () => {
    assert.equal(
      existsSync(friendsLoadingPath),
      true,
      "the friends route must own a loading boundary before the main startup fallback",
    );

    const { default: MessagesFriendsLoading } = await import("./(main)/messages/friends/loading");
    const markup = renderToStaticMarkup(<MessagesFriendsLoading />);

    assert.match(markup, /data-testid="messages-friends-route-loading"/u);
    assert.match(markup, /aria-busy="true"/u);
    assert.doesNotMatch(markup, /data-testid="app-startup-screen"/u);

    const animatedSkeletons = markup.match(/class="[^"]*animate-pulse[^"]*"/gu) ?? [];
    assert.ok(animatedSkeletons.length > 0);
    for (const skeleton of animatedSkeletons) {
      assert.match(skeleton, /motion-reduce:animate-none/u);
    }
  });
});
