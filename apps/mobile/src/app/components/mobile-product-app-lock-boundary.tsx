import type { ReactNode } from "react";
import { MobileAppLockScreen } from "./mobile-app-lock-screen";

export function MobileProductAppLockBoundary({
  children,
  locked,
  onRetry,
  onSignOut,
}: {
  readonly children: ReactNode;
  readonly locked: boolean;
  readonly onRetry: () => void;
  readonly onSignOut: () => void;
}) {
  return locked ? (
    <MobileAppLockScreen onRetry={onRetry} onSignOut={onSignOut} visible />
  ) : (
    children
  );
}
