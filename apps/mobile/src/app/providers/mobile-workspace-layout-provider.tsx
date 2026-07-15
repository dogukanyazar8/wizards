import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

export const MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY = "whispr.mobile.workspace-layout";

export type MobileWorkspaceLayout = "compact" | "rail";

interface MobileWorkspaceLayoutPreferenceRuntime {
  readonly layout: MobileWorkspaceLayout;
  setLayout(layout: MobileWorkspaceLayout): void;
}

const MobileWorkspaceLayoutContext = createContext<MobileWorkspaceLayoutPreferenceRuntime | null>(null);

function normalizeMobileWorkspaceLayout(value: unknown): MobileWorkspaceLayout {
  return value === "compact" ? "compact" : "rail";
}

export function MobileWorkspaceLayoutProvider({ children }: PropsWithChildren) {
  const [layout, setLayoutState] = useState<MobileWorkspaceLayout>("rail");
  const userSelectionVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const selectionVersionAtStart = userSelectionVersion.current;

    void AsyncStorage.getItem(MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY)
      .then((storedLayout) => {
        if (active && userSelectionVersion.current === selectionVersionAtStart) {
          setLayoutState(normalizeMobileWorkspaceLayout(storedLayout));
        }
      })
      .catch(() => {
        if (active && userSelectionVersion.current === selectionVersionAtStart) {
          setLayoutState("rail");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const setLayout = useCallback((nextLayout: MobileWorkspaceLayout) => {
    const normalizedLayout = normalizeMobileWorkspaceLayout(nextLayout);
    userSelectionVersion.current += 1;
    setLayoutState(normalizedLayout);
    void AsyncStorage.setItem(MOBILE_WORKSPACE_LAYOUT_PREFERENCE_KEY, normalizedLayout).catch(
      () => undefined,
    );
  }, []);

  const value = useMemo<MobileWorkspaceLayoutPreferenceRuntime>(
    () => ({ layout, setLayout }),
    [layout, setLayout],
  );

  return (
    <MobileWorkspaceLayoutContext.Provider value={value}>
      {children}
    </MobileWorkspaceLayoutContext.Provider>
  );
}

export function useMobileWorkspaceLayoutPreference(): MobileWorkspaceLayoutPreferenceRuntime {
  const runtime = useContext(MobileWorkspaceLayoutContext);

  if (!runtime) {
    throw new Error(
      "useMobileWorkspaceLayoutPreference must be used within MobileWorkspaceLayoutProvider",
    );
  }

  return runtime;
}
