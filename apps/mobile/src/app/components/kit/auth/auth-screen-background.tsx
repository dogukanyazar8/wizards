import type { PropsWithChildren } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import type { MobileTheme } from "../../../../design/themes";
import { useMobileBottomSystemTopUpStyle } from "../../../use-mobile-bottom-system-spacing";
import { useTheme, useThemedStyles } from "../../../providers/mobile-theme-provider";
import { AuthWelcomeBackground } from "./auth-welcome-background";

export interface AuthScreenBackgroundProps extends PropsWithChildren {
  readonly centered?: boolean;
  /**
   * Set by screens that pin their own bottom chrome and already apply the shared
   * Android system-bar policy, so the two do not stack into a double gap.
   */
  readonly contentOwnsBottomInset?: boolean;
  /** Keeps the content container viewport-sized for screens with pinned chrome. */
  readonly fill?: boolean;
  readonly scrollable?: boolean;
  readonly testID?: string;
  /** Applies the canonical 2a background without changing other auth flows. */
  readonly visualVariant?: "default" | "welcome";
}

const createStyles = (theme: MobileTheme) => ({
  body: {
    flex: 1,
    minWidth: 0,
  },
  content: {
    alignSelf: "center" as const,
    gap: theme.spacing.row,
    maxWidth: theme.sizing.maxInlineContentWidth,
    minWidth: 0,
    width: "100%" as const,
  },
  contentCentered: {
    flexGrow: 1,
    justifyContent: "center" as const,
  },
  contentFill: {
    flex: 1,
  },
  dot: {
    backgroundColor: theme.accent.default,
    borderRadius: theme.layout.auth.backgroundDot / 2,
    height: theme.layout.auth.backgroundDot,
    position: "absolute" as const,
    width: theme.layout.auth.backgroundDot,
  },
  dotEmphasized: {
    opacity: theme.layout.auth.backgroundDotHighlightedOpacity,
  },
  dotStandard: {
    opacity: theme.layout.auth.backgroundDotOpacity,
  },
  dotField: {
    bottom: 0,
    left: 0,
    pointerEvents: "none" as const,
    position: "absolute" as const,
    right: 0,
    top: 0,
  },
  glowBottom: {
    backgroundColor: theme.surface.soft,
    borderRadius: theme.layout.auth.backgroundGlowBottomDiameter / 2,
    bottom: -theme.layout.auth.backgroundGlowBottomOffsetBottom,
    height: theme.layout.auth.backgroundGlowBottomDiameter,
    left: -theme.layout.auth.backgroundGlowBottomOffsetLeft,
    position: "absolute" as const,
    width: theme.layout.auth.backgroundGlowBottomDiameter,
  },
  glowTop: {
    backgroundColor: theme.accent.soft,
    borderRadius: theme.layout.auth.backgroundGlowTopDiameter / 2,
    height: theme.layout.auth.backgroundGlowTopDiameter,
    position: "absolute" as const,
    right: -theme.layout.auth.backgroundGlowTopOffsetRight,
    top: -theme.layout.auth.backgroundGlowTopOffsetTop,
    width: theme.layout.auth.backgroundGlowTopDiameter,
  },
  keyboard: {
    backgroundColor: theme.surface.base,
    flex: 1,
    minWidth: 0,
    overflow: "hidden" as const,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: theme.spacing.section,
  },
  staticContent: {
    flex: 1,
    justifyContent: "center" as const,
    paddingHorizontal: theme.spacing.page,
    paddingVertical: theme.spacing.section,
  },
});

export function AuthScreenBackground({
  centered = true,
  children,
  contentOwnsBottomInset = false,
  fill = false,
  scrollable = false,
  testID,
  visualVariant = "default",
}: AuthScreenBackgroundProps) {
  const theme = useTheme();
  const styles = useThemedStyles(createStyles);
  // Auth screens render outside the shell's signed-in bottom reservation, so this
  // layer clears the Android navigation bar for them. The background stays
  // full-bleed underneath — only the interactive layout moves up.
  const bottomSystemTopUpStyle = useMobileBottomSystemTopUpStyle(theme.spacing.section);
  const { auth } = theme.layout;
  const rendersCanonicalWelcomeBackground = visualVariant === "welcome";
  const content = (
    <View
      style={[styles.content, centered && styles.contentCentered, fill && styles.contentFill]}
      testID={testID ? `${testID}-content` : undefined}
    >
      {children}
    </View>
  );

  return (
    // MobileAppShell reserves the keyboard height for the whole tree, so this
    // background only owns the auth layout itself.
    <View style={styles.keyboard} testID={testID}>
      {rendersCanonicalWelcomeBackground ? (
        // Promote the static background to its own hardware-textured layer so the
        // native-stack slide transition composites a cached bitmap instead of
        // re-rasterizing the gradient/pattern SVG on every frame of the slide.
        <View
          collapsable={false}
          pointerEvents="none"
          renderToHardwareTextureAndroid
          style={StyleSheet.absoluteFill}
        >
          <AuthWelcomeBackground
            tone={theme.dark ? "dark" : "light"}
            {...(testID ? { testID: `${testID}-canonical-background-${theme.id}` } : {})}
          />
        </View>
      ) : (
        <>
          <View style={styles.glowTop} testID={testID ? `${testID}-glow-top` : undefined} />
          <View style={styles.glowBottom} testID={testID ? `${testID}-glow-bottom` : undefined} />
          <View style={styles.dotField}>
            {Array.from({ length: auth.backgroundDotCount }, (_, index) => {
              const left =
                `${(index * auth.backgroundDotHorizontalStep) % auth.backgroundDotHorizontalModulo}%` as `${number}%`;
              const top =
                `${(index * auth.backgroundDotVerticalStep) % auth.backgroundDotVerticalModulo}%` as `${number}%`;
              const emphasized = index % auth.backgroundDotHighlightInterval === 0;

              return (
                <View
                  key={`${left}-${top}`}
                  style={[
                    styles.dot,
                    emphasized ? styles.dotEmphasized : styles.dotStandard,
                    { left, top },
                  ]}
                  testID={testID ? `${testID}-dot` : undefined}
                />
              );
            })}
          </View>
        </>
      )}
      <Animated.View
        style={[styles.body, contentOwnsBottomInset ? undefined : bottomSystemTopUpStyle]}
        testID={testID ? `${testID}-body` : undefined}
      >
        {scrollable ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {content}
          </ScrollView>
        ) : (
          <View style={styles.staticContent}>{content}</View>
        )}
      </Animated.View>
    </View>
  );
}
