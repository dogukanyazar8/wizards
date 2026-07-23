import { createContext, useContext, type Context } from "react";

import { registerMobileOverlayScopedContext } from "../../app/components/kit/overlay-scoped-contexts";

/**
 * The server a surface belongs to, so an avatar touch anywhere inside it opens
 * the card with role chips without every list in between forwarding a prop.
 * `undefined` outside a server surface — a DM has no roles to show.
 *
 * Deliberately a leaf module: `overlay-context-bridge` has to read this context,
 * and everything else in `profile-card/` reaches back into `kit/`. Declaring the
 * context next to its provider pulled the whole card — and through it every
 * sheet — into a require cycle with `bottom-sheet`/`overlay-surface`, which
 * Metro resolves by handing somebody a half-initialised module.
 */
export const MobileProfileCardScopeContext = createContext<string | undefined>(undefined);

// The provider mounts below MobileOverlayHost (channel/thread/member screens),
// so overlay children — the reaction detail sheet — only keep the scope because
// the bridge carries it.
registerMobileOverlayScopedContext({
  context: MobileProfileCardScopeContext as unknown as Context<unknown>,
  name: "MobileProfileCardScope",
});

export function useMobileProfileCardScope(): string | undefined {
  return useContext(MobileProfileCardScopeContext);
}
