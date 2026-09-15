import assert from "node:assert/strict";
import { it } from "node:test";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { subscribeAccountSecurityRefresh } from "./use-account-security-refresh";
import { securityQueryKeys } from "@/lib/settings/security-client";

it("refreshes only affected account data, pauses hidden reads, and removes listeners", async () => {
  type Listener = (payload?: { sessionsChanged: boolean }) => void;
  const listeners = new Map<string, Listener>();
  const socket = {
    on: (name: string, callback: Listener) => {
      listeners.set(name, callback);
    },
    off: (name: string) => {
      listeners.delete(name);
    },
  } as unknown as Parameters<typeof subscribeAccountSecurityRefresh>[0];
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let sessionReads = 0;
  let eventReads = 0;
  const sessions = new QueryObserver(client, {
    queryKey: securityQueryKeys.sessions,
    queryFn: async () => ++sessionReads,
    staleTime: Infinity,
    initialData: 0,
  });
  const events = new QueryObserver(client, {
    queryKey: securityQueryKeys.events,
    queryFn: async () => ++eventReads,
    staleTime: Infinity,
    initialData: 0,
  });
  const stopSessions = sessions.subscribe(() => {});
  const stopEvents = events.subscribe(() => {});
  let visible = true;
  const stop = subscribeAccountSecurityRefresh(socket, client, () => visible);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  try {
    listeners.get("account:security:changed")!({ sessionsChanged: false });
    await settle();
    assert.equal(eventReads, 1);
    assert.equal(sessionReads, 0);
    listeners.get("account:security:changed")!({ sessionsChanged: true });
    await settle();
    assert.equal(sessionReads, 1);
    visible = false;
    listeners.get("account:security:changed")!({ sessionsChanged: true });
    await settle();
    assert.equal(sessionReads, 1);
    assert.equal(eventReads, 2);
    assert.equal(client.getQueryState(securityQueryKeys.sessions)?.isInvalidated, true);
    visible = true;
    listeners.get("connect")!();
    await settle();
    assert.equal(sessionReads, 2);
    assert.equal(eventReads, 3);
  } finally {
    stop();
    stopSessions();
    stopEvents();
    client.clear();
  }
  assert.equal(listeners.size, 0);
});
