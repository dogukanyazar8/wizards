import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DesktopGameActivity } from "./desktop-game-activity";

it("uses the authenticated shell identity without requiring a NextAuth SessionProvider", () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  assert.equal(
    renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DesktopGameActivity userId="user-1" />
      </QueryClientProvider>,
    ),
    "",
  );
  assert.equal(client.isFetching(), 0, "web/SSR must not query desktop activity");
  client.clear();
});
