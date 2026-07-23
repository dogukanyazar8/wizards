import { useCallback, type ReactNode } from "react";

import { useMobileProfileCard } from "./profile-card-overlay";
import {
  MobileProfileCardScopeContext,
  useMobileProfileCardScope,
} from "./profile-card-scope-context";

export { MobileProfileCardScopeContext, useMobileProfileCardScope };

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
