import { useContext } from "react";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { resolveMobileBottomSystemSpacing } from "./mobile-bottom-system-inset";

/** Applies the shared Android system-bar policy to one interactive bottom surface. */
export function useMobileBottomSystemSpacing(minimumSpacing: number): number {
  return resolveMobileBottomSystemSpacing(
    useContext(SafeAreaInsetsContext)?.bottom ?? 0,
    minimumSpacing,
  );
}
