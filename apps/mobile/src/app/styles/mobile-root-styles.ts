import { sharedStyles } from "./shared-styles";
import { mobileRootScreenStyles } from "../mobile-root-screens.styles";
import { homeScreenStyles } from "../screens/home-screen.styles";
import { dmScreenStyles } from "../screens/dm-screen.styles";
import { channelScreenStyles } from "../screens/channel-screen.styles";
import { voiceScreenStyles } from "../screens/voice-screen.styles";
import { settingsScreenStyles } from "../screens/settings-screen.styles";
import { notificationsScreenStyles } from "../screens/notifications-screen.styles";
import { authGateStyles } from "../screens/auth-gate.styles";
import { mobileComposerStyles } from "../composer/mobile-composer.styles";
import { uiAtomStyles } from "../components/ui-atoms.styles";
import { messagePrimitiveStyles } from "../components/message-primitives.styles";
import { mediaPrimitiveStyles } from "../components/media-primitives.styles";
import { mobileVoiceInviteOverlayStyles } from "../overlays/mobile-voice-invite-overlay.styles";

export const styles = {
  ...sharedStyles,
  ...mobileRootScreenStyles,
  ...homeScreenStyles,
  ...dmScreenStyles,
  ...channelScreenStyles,
  ...voiceScreenStyles,
  ...settingsScreenStyles,
  ...notificationsScreenStyles,
  ...authGateStyles,
  ...mobileComposerStyles,
  ...uiAtomStyles,
  ...messagePrimitiveStyles,
  ...mediaPrimitiveStyles,
  ...mobileVoiceInviteOverlayStyles,
};
