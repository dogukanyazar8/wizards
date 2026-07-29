/**
 * The chat the navigator is currently showing, read straight off its state.
 *
 * Spans used to be opened only by the two tap handlers that prefetch a stream.
 * A device run made the cost of that visible: twelve of roughly twenty-three
 * opens were measured, with *zero* abandoned spans — so the missing ones never
 * started. Deep links, push-notification intents, profile cards, the friends
 * hub and the voice room all navigate straight to a chat without passing the
 * tap handler.
 *
 * Reading the navigator's own state is the one seam every one of those paths
 * goes through. Shaped structurally rather than against React Navigation's types
 * so it can be tested without the library.
 */
export type MobileChatRoute = "ChannelChat" | "DirectMessage";

export type MobileChatRouteTarget = {
  readonly route: MobileChatRoute;
  readonly targetId: string;
};

type NavigationRouteLike = {
  readonly name?: unknown;
  readonly params?: unknown;
  readonly state?: NavigationStateLike;
};

type NavigationStateLike = {
  readonly index?: unknown;
  readonly routes?: readonly NavigationRouteLike[];
};

function readTargetId(route: MobileChatRoute, params: unknown): string | null {
  if (!params || typeof params !== "object") {
    return null;
  }

  const key = route === "ChannelChat" ? "channelId" : "conversationId";
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Walks to the deepest focused route and returns it when it is a chat.
 *
 * Only the focused leaf counts: a chat sitting further down the stack is not
 * being opened, and reporting it would restate an open the reader already had.
 */
export function resolveMobileActiveChatRouteTarget(
  state: NavigationStateLike | undefined,
): MobileChatRouteTarget | null {
  let current: NavigationStateLike | undefined = state;
  let focused: NavigationRouteLike | undefined;

  while (current) {
    const routes = current.routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      break;
    }

    const index = typeof current.index === "number" ? current.index : routes.length - 1;
    const route = routes[Math.min(Math.max(index, 0), routes.length - 1)];
    if (!route) {
      break;
    }

    focused = route;
    current = route.state;
  }

  const name = focused?.name;
  if (name !== "ChannelChat" && name !== "DirectMessage") {
    return null;
  }

  const targetId = readTargetId(name, focused?.params);
  return targetId ? { route: name, targetId } : null;
}

/**
 * Answers whether a chat's stream is already cached.
 *
 * Registered by the query provider rather than read through `useQueryClient`:
 * the navigator is rendered without a client in several tests, and a telemetry
 * detail must not become a mounting requirement. An unregistered probe reports
 * "not cached", which is the bucket that must not flatter itself.
 */
export type MobileChatCacheProbe = (target: MobileChatRouteTarget) => boolean;

let chatCacheProbe: MobileChatCacheProbe | null = null;

export function setMobileChatCacheProbe(probe: MobileChatCacheProbe | null): void {
  chatCacheProbe = probe;
}

export function probeMobileChatCache(target: MobileChatRouteTarget): boolean {
  try {
    return chatCacheProbe?.(target) ?? false;
  } catch {
    return false;
  }
}
