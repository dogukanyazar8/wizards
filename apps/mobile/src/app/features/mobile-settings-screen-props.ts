import type { MobileFriendPresenceStatus } from "../../social/mobile-social-client";
import type { MobileSettingsScreenProps } from "../providers/mobile-product-screen-provider";

type MobileSettingsScreenPropsInput = Omit<
  MobileSettingsScreenProps,
  | "onOpenWebRegister"
  | "onOpenWebSignIn"
  | "onRefresh"
  | "onRequestCameraPermission"
  | "onSignOut"
  | "onToggleAppLock"
  | "onUpdatePresence"
  | "socialActionsEnabled"
> & {
  readonly onRefreshSession: () => Promise<unknown>;
  readonly onRequestCameraPermission: () => Promise<unknown>;
  readonly onSetAppLockEnabled: (enabled: boolean) => Promise<unknown> | unknown;
  readonly onSignOut: () => Promise<unknown>;
  readonly onUpdatePresence: (status: MobileFriendPresenceStatus) => Promise<unknown>;
  readonly openWebRegister: () => Promise<unknown>;
  readonly openWebSignIn: () => Promise<unknown>;
};

/**
 * Wraps the auth and permission runtimes the settings surface consumes so the
 * product shell stays a provider tree instead of an adapter layer.
 */
export function createMobileSettingsScreenProps({
  onRefreshSession,
  onRequestCameraPermission,
  onSetAppLockEnabled,
  onSignOut,
  onUpdatePresence,
  openWebRegister,
  openWebSignIn,
  status,
  ...rest
}: MobileSettingsScreenPropsInput): MobileSettingsScreenProps {
  return {
    ...rest,
    onOpenWebRegister: () => void openWebRegister(),
    onOpenWebSignIn: () => void openWebSignIn(),
    onRefresh: () => void onRefreshSession(),
    onRequestCameraPermission: async () => {
      await onRequestCameraPermission();
    },
    onSignOut: () => void onSignOut(),
    onToggleAppLock: (enabled: boolean) => void onSetAppLockEnabled(enabled),
    onUpdatePresence: async (presence) => {
      await onUpdatePresence(presence);
    },
    socialActionsEnabled: status === "signed-in",
    status,
  };
}
