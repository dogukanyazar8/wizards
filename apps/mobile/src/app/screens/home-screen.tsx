import type { ComponentProps } from "react";

import {
  MobileWorkspaceBrowser as LegacyMobileWorkspaceBrowser,
  OverviewScreen as LegacyOverviewScreen,
} from "../mobile-root-screens-legacy";

export type OverviewScreenProps = ComponentProps<typeof LegacyOverviewScreen>;
export type MobileWorkspaceBrowserProps = ComponentProps<typeof LegacyMobileWorkspaceBrowser>;

export function OverviewScreen(props: OverviewScreenProps) {
  return <LegacyOverviewScreen {...props} />;
}

export function MobileWorkspaceBrowser(props: MobileWorkspaceBrowserProps) {
  return <LegacyMobileWorkspaceBrowser {...props} />;
}
