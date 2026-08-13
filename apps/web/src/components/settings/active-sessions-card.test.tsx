import assert from "node:assert/strict";
import { describe, it } from "node:test";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";

import { authSessionQueryKey } from "@/lib/auth/auth-sessions-client";
import { ActiveSessionsCard } from "./active-sessions-card";

const t = (key: string, values?: Record<string, number | string>) =>
  values
    ? Object.entries(values).reduce(
        (value, [name, replacement]) => value.replace(`{${name}}`, String(replacement)),
        key,
      )
    : key;

describe("ActiveSessionsCard", () => {
  it("renders the current and other server-backed sessions", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(authSessionQueryKey, {
      sessions: [
        {
          appVersion: "0.8.15",
          browser: "Chrome",
          clientType: "DESKTOP",
          countryCode: "TR",
          createdAt: "2026-08-13T08:00:00.000Z",
          current: true,
          deviceType: "DESKTOP",
          expiresAt: "2026-09-12T08:00:00.000Z",
          id: "current",
          lastSeenAt: "2026-08-13T09:00:00.000Z",
          os: "Windows",
        },
        {
          appVersion: null,
          browser: "Safari",
          clientType: "WEB",
          countryCode: null,
          createdAt: "2026-08-12T08:00:00.000Z",
          current: false,
          deviceType: "MOBILE",
          expiresAt: "2026-09-11T08:00:00.000Z",
          id: "other",
          lastSeenAt: "2026-08-12T09:00:00.000Z",
          os: "iOS",
        },
      ],
    });

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <ActiveSessionsCard t={t} />
      </QueryClientProvider>,
    );

    assert.match(html, /data-testid="active-sessions-card"/);
    assert.match(html, /Whispr Desktop|client\.DESKTOP/);
    assert.match(html, /settings\.account\.security\.sessions\.current/);
    assert.match(html, /settings\.account\.security\.sessions\.revokeOthers/);
  });
});
