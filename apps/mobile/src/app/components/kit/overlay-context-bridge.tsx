import { NavigationContext } from "@react-navigation/native";
import { createElement, useContext, type Context, type ReactNode } from "react";
import { MobileChatKeyboardScopeContext } from "../../mobile-chat-keyboard-region";
// The leaf context module, never the provider file: importing the provider pulls
// the profile card — and every sheet it renders — back into this kit module.
import { MobileProfileCardScopeContext } from "../../../social/profile-card/profile-card-scope-context";
import { listMobileOverlayScopedContexts } from "./overlay-scoped-contexts";

/**
 * The contexts an overlay child would otherwise lose by rendering in the host.
 *
 * MobileOverlayHost is a sibling of the app content inside MobileProductApp, so
 * everything above that point — theme, locale, toast, haptics, query, network,
 * auth, realtime, voice, media, workspace layout, notification preferences,
 * deep links and the five product-screen contexts — already resolves at the
 * host. Only what is provided *below* it has to travel with the overlay:
 *
 * - NavigationContext: provided per screen by react-navigation.
 * - MobileChatKeyboardScopeContext: provided by MobileAppShell.
 * - MobileProfileCardScopeContext: provided by the channel/thread/member screens
 *   so an avatar tapped inside a hosted sheet still opens with role chips (11b).
 *
 * Everything registered through `registerMobileOverlayScopedContext` must appear
 * here; the development guard below turns an omission into an error at the call
 * site instead of a default value three components deep in a sheet.
 */
export const MOBILE_OVERLAY_BRIDGED_CONTEXTS: readonly {
  readonly context: Context<unknown>;
  readonly name: string;
}[] = Object.freeze([
  { context: NavigationContext as unknown as Context<unknown>, name: "Navigation" },
  {
    context: MobileChatKeyboardScopeContext as unknown as Context<unknown>,
    name: "MobileChatKeyboardScope",
  },
  {
    context: MobileProfileCardScopeContext as unknown as Context<unknown>,
    name: "MobileProfileCardScope",
  },
]);

function assertBridgeCoversScopedContexts(): void {
  if (!__DEV__) {
    return;
  }

  for (const scoped of listMobileOverlayScopedContexts()) {
    const bridged = MOBILE_OVERLAY_BRIDGED_CONTEXTS.some(
      (candidate) => candidate.context === scoped.context,
    );
    if (!bridged) {
      throw new Error(
        `Overlay context bridge is missing "${scoped.name}". Overlay children render inside ` +
          "MobileOverlayHost, so a context provided below the host resolves to its default " +
          "value unless it is added to MOBILE_OVERLAY_BRIDGED_CONTEXTS.",
      );
    }
  }
}

/**
 * Reads the bridged values at the call site. The list is a module constant, so
 * the hook order is fixed even though the calls are written as a loop.
 */
export function useMobileOverlayContextBridge(): readonly unknown[] {
  assertBridgeCoversScopedContexts();
  return MOBILE_OVERLAY_BRIDGED_CONTEXTS.map((bridged) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed-length module constant
    useContext(bridged.context),
  );
}

/** Re-provides the call site's values around children rendered in the host. */
export function MobileOverlayContextBridge({
  children,
  values,
}: {
  readonly children: ReactNode;
  readonly values: readonly unknown[];
}) {
  const bridged = MOBILE_OVERLAY_BRIDGED_CONTEXTS.reduceRight<ReactNode>(
    (node, entry, index) => createElement(entry.context.Provider, { value: values[index] }, node),
    children,
  );

  return <>{bridged}</>;
}
