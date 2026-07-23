import { createContext, useCallback, useContext, type Context, type ReactNode } from "react";

import { registerMobileOverlayScopedContext } from "../../app/components/kit/overlay-scoped-contexts";
import { useMobileProfileCard } from "./profile-card-overlay";

/**
 * The server a surface belongs to, so an avatar touch anywhere inside it opens
 * the card with role chips without every list in between forwarding a prop.
 * `undefined` outside a server surface — a DM has no roles to show.
 */
export const MobileProfileCardScopeContext = createContext<string | undefined>(undefined);

// The provider mounts below MobileOverlayHost (channel/thread/member screens),
// so overlay children — the reaction detail sheet — only keep the scope because
// the bridge carries it.
registerMobileOverlayScopedContext({
  context: MobileProfileCardScopeContext as unknown as Context<unknown>,
  name: "MobileProfileCardScope",
});

export function MobileProfileCardScope({
  children,
  serverId,
}: {
  readonly children: ReactNode;
  readonly serverId: string | undefined;
}) {
  return (
    <MobileProfileCardScopeContext.Provider value={serverId}>
      {children}
    </MobileProfileCardScopeContext.Provider>
  );
}

export function useMobileProfileCardScope(): string | undefined {
  return useContext(MobileProfileCardScopeContext);
}

/**
 * The one call every entry point makes: `openProfile(userId)`. The server id
 * comes from the surrounding scope, and a caller that knows better can override
 * it (a DM row inside a server surface, for instance).
 */
export function useOpenMobileProfileCard() {
  const { openProfileCard } = useMobileProfileCard();
  const scopedServerId = useMobileProfileCardScope();

  return useCallback(
    (userId: string, serverId?: string | undefined) =>
      openProfileCard({ serverId: serverId ?? scopedServerId, userId }),
    [openProfileCard, scopedServerId],
  );
}
