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

export { MobileAboutWhatsNewScreen } from "./about-whats-new-screen";
export { MobileAboutReleaseHistoryScreen } from "./about-release-history-screen";
export { MobileAboutReleaseNoteScreen } from "./about-release-note-screen";
export { MobileAboutUpdateChannelScreen } from "./about-channel-screen";
export { MobileHelpCenterScreen } from "./about-help-center-screen";
export { MobileBugReportScreen } from "./about-bug-report-screen";
export { MobileCommunityInviteScreen } from "./about-community-invite-screen";
export { MobileServerProfileScreen } from "./about-community-invite-screen";
