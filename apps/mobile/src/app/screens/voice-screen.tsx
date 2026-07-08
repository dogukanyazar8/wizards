import type { ComponentProps } from "react";

import {
  MobileVoiceChannelScreen as LegacyMobileVoiceChannelScreen,
  VoiceScreen as LegacyVoiceScreen,
} from "../mobile-root-screens-legacy";

export type VoiceScreenProps = ComponentProps<typeof LegacyVoiceScreen>;
export type MobileVoiceChannelScreenProps = ComponentProps<typeof LegacyMobileVoiceChannelScreen>;

export function VoiceScreen(props: VoiceScreenProps) {
  return <LegacyVoiceScreen {...props} />;
}

export function MobileVoiceChannelScreen(props: MobileVoiceChannelScreenProps) {
  return <LegacyMobileVoiceChannelScreen {...props} />;
}
