import type { ComponentProps } from "react";

import { ProfileSettingsScreen as LegacyProfileSettingsScreen } from "../mobile-root-screens-legacy";

export type ProfileSettingsScreenProps = ComponentProps<typeof LegacyProfileSettingsScreen>;

export function ProfileSettingsScreen(props: ProfileSettingsScreenProps) {
  return <LegacyProfileSettingsScreen {...props} />;
}
