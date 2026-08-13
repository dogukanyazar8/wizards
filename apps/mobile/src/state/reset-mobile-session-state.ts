import { mobileFailedSendRegistry } from "../query/mobile-failed-send-registry";
import { resetMobileRecentDMPrefetchStats } from "../query/mobile-message-prefetch";
import { mobileSearchKeyRegistry } from "../query/mobile-query-keys";
import { useMobileActiveTargetStore } from "./mobile-active-target-store";
import { useMobileComposerDraftStore } from "./mobile-composer-draft-store";
import { useMobileOverlayStore } from "./mobile-overlay-store";
import { useMobileTypingStore } from "./mobile-typing-store";

export function resetMobileSessionState(): void {
  useMobileActiveTargetStore.getState().reset();
  useMobileComposerDraftStore.getState().reset();
  useMobileOverlayStore.getState().reset();
  useMobileTypingStore.getState().reset();
  mobileSearchKeyRegistry.clear();
  mobileFailedSendRegistry.clear();
  resetMobileRecentDMPrefetchStats();
}
