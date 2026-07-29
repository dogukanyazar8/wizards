import { ScrollView, View } from "react-native";

import { mobileCopy } from "../../../locale/mobile-copy";
import { useMobileLocaleRuntime } from "../../providers/mobile-locale-provider";
import { useThemedStyles } from "../../providers/mobile-theme-provider";
import type { MobileTheme } from "../../../design/themes";
import { AboutScreenHeader } from "./about-primitives";

/**
 * Route shells for the seven "Hakkında" destinations.
 *
 * Prompt 02 builds the layer the thirteen screens sit on and deliberately draws
 * none of them; prompts 03–13 replace each body below. They exist now because a
 * route needs a component to register, and registering the routes now is what
 * lets the deep-link contract be tested before the screens land. Each shell is
 * the real header — back behaviour, title and the 36px button geometry — over an
 * empty scroll view, so nothing here has to be unpicked later.
 */

const createStyles = (theme: MobileTheme) => ({
  root: { backgroundColor: theme.about.screen, flex: 1 },
  content: { paddingBottom: 40 },
  body: { flex: 1 },
});

const useStyles = () => useThemedStyles(createStyles);

function AboutRouteShell({
  onBack,
  testID,
  title,
  variant,
}: {
  readonly onBack: () => void;
  readonly testID: string;
  readonly title: string;
  readonly variant?: "back" | "close";
}) {
  const styles = useStyles();
  const { locale } = useMobileLocaleRuntime();
  const copy = mobileCopy[locale];

  return (
    <View style={styles.root} testID={testID}>
      <AboutScreenHeader
        backAccessibilityLabel={copy.authBackAction}
        onBack={onBack}
        testID={`${testID}-header`}
        title={title}
        {...(variant === undefined ? {} : { variant })}
      />
      <ScrollView contentContainerStyle={styles.content} style={styles.body} />
    </View>
  );
}

export function MobileAboutWhatsNewScreen({ onBack }: { readonly onBack: () => void }) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-about-whats-new-screen"
      title={mobileCopy[locale].whatsNewTitle}
    />
  );
}

export function MobileAboutReleaseNoteScreen({
  onBack,
}: {
  readonly onBack: () => void;
  /** Carried by the route; 06 reads it to fetch the note. */
  readonly version: string;
}) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-about-release-note-screen"
      title={mobileCopy[locale].releaseNoteTitle}
    />
  );
}

export function MobileAboutReleaseHistoryScreen({ onBack }: { readonly onBack: () => void }) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-about-release-history-screen"
      title={mobileCopy[locale].historyTitle}
    />
  );
}

export function MobileAboutUpdateChannelScreen({ onBack }: { readonly onBack: () => void }) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-about-update-channel-screen"
      title={mobileCopy[locale].channelTitle}
    />
  );
}

export function MobileHelpCenterScreen({ onBack }: { readonly onBack: () => void }) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-help-center-screen"
      title={mobileCopy[locale].helpTitle}
    />
  );
}

export function MobileBugReportScreen({
  onBack,
}: {
  /** Preselected by 2e's "Bunu bulamadık" row; 11 reads it. */
  readonly category?: string | undefined;
  readonly onBack: () => void;
}) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-bug-report-screen"
      title={mobileCopy[locale].reportTitle}
      // §3.11: a form closes, it does not go back.
      variant="close"
    />
  );
}

export function MobileCommunityInviteScreen({
  onBack,
}: {
  readonly onBack: () => void;
  /** The invite slug the link carried; 12 resolves it. */
  readonly slug?: string | undefined;
}) {
  const { locale } = useMobileLocaleRuntime();

  return (
    <AboutRouteShell
      onBack={onBack}
      testID="mobile-community-invite-screen"
      title={mobileCopy[locale].communityTitle}
    />
  );
}
