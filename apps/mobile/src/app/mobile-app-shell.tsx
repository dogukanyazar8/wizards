import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { mobileColors, mobileSpacing } from "../design/tokens";

interface MobileAppShellProps {
  authStatus: "checking" | "error" | "signed-in" | "signed-out";
  children: ReactNode;
}

export function MobileAppShell({ authStatus, children }: MobileAppShellProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, 12);
  const bottomInset = Math.max(insets.bottom, 12);
  const isSignedIn = authStatus === "signed-in";
  const contentContainerStyle = [
    styles.content,
    isSignedIn && styles.contentSignedIn,
    styles.contentOwnScroll,
    !isSignedIn && { paddingBottom: bottomInset + 12 },
  ];

  return (
    <View style={[styles.safeArea, { paddingTop: topInset }]}>
      <View style={[styles.shell, isSignedIn && styles.shellSignedIn]}>
        <View style={[styles.contentScroll, ...contentContainerStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileColors.surfaceBase,
  },
  shell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: mobileSpacing.page,
    paddingTop: 8,
  },
  shellSignedIn: {
    paddingHorizontal: 14,
    paddingTop: 0,
  },
  contentScroll: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    flexGrow: 1,
    minWidth: 0,
    paddingVertical: mobileSpacing.section,
  },
  contentSignedIn: {
    paddingTop: 6,
    paddingBottom: 106,
  },
  contentOwnScroll: {
    flex: 1,
  },
});
