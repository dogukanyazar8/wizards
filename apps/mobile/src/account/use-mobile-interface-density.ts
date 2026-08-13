import { useSyncExternalStore } from "react";

import {
  getMobileAccountRuntimeDensity,
  subscribeMobileAccountRuntimeDensity,
} from "./mobile-account-preference-runtime";

export function useMobileInterfaceDensity() {
  return useSyncExternalStore(
    subscribeMobileAccountRuntimeDensity,
    getMobileAccountRuntimeDensity,
    getMobileAccountRuntimeDensity,
  );
}
