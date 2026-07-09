import { mobileSearchKeyRegistry } from "../query/mobile-query-keys";
import { useMobileActiveTargetStore } from "./mobile-active-target-store";
import { useMobileComposerDraftStore } from "./mobile-composer-draft-store";
import { useMobileOverlayStore } from "./mobile-overlay-store";

export function resetMobileSessionState(): void {
  useMobileActiveTargetStore.getState().reset();
  useMobileComposerDraftStore.getState().reset();
  useMobileOverlayStore.getState().reset();
  mobileSearchKeyRegistry.clear();
}
