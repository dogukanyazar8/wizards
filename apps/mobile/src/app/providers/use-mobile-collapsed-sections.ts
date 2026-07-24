import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  parseMobileCollapsedSections,
  serializeMobileCollapsedSections,
  toggleMobileCollapsedSection,
} from "../mobile-sunucular-model";

export const MOBILE_WORKSPACE_COLLAPSED_SECTIONS_KEY = "whispr.mobile.collapsed-sections";

export interface MobileCollapsedSectionsRuntime {
  readonly collapsedSections: Readonly<Record<string, boolean>>;
  toggleSection(key: string): void;
}

/**
 * Per-user category collapse state (1a/1b), persisted through AsyncStorage under
 * one key. Mirrors {@link MobileWorkspaceLayoutProvider}: a version ref stops a
 * slow disk read from clobbering a collapse the user just tapped, and a ref
 * mirror lets the toggle persist the exact next map without a render-phase side
 * effect (React Compiler safe). Keys come from `buildMobileCollapsedSectionKey`.
 */
export function useMobileCollapsedSections(): MobileCollapsedSectionsRuntime {
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const collapsedSectionsRef = useRef<Record<string, boolean>>({});
  const userToggleVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const versionAtStart = userToggleVersion.current;

    void AsyncStorage.getItem(MOBILE_WORKSPACE_COLLAPSED_SECTIONS_KEY)
      .then((stored) => {
        if (active && userToggleVersion.current === versionAtStart) {
          const parsed = parseMobileCollapsedSections(stored);
          collapsedSectionsRef.current = parsed;
          setCollapsedSections(parsed);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const toggleSection = useCallback((key: string) => {
    userToggleVersion.current += 1;
    const next = toggleMobileCollapsedSection(collapsedSectionsRef.current, key);
    collapsedSectionsRef.current = next;
    setCollapsedSections(next);
    void AsyncStorage.setItem(
      MOBILE_WORKSPACE_COLLAPSED_SECTIONS_KEY,
      serializeMobileCollapsedSections(next),
    ).catch(() => undefined);
  }, []);

  return { collapsedSections, toggleSection };
}
