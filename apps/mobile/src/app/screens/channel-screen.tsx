import type { ComponentProps } from "react";

import { MobileChannelChatScreen as LegacyMobileChannelChatScreen } from "../mobile-root-screens-legacy";

export type MobileChannelChatScreenProps = ComponentProps<typeof LegacyMobileChannelChatScreen>;

export function MobileChannelChatScreen(props: MobileChannelChatScreenProps) {
  return <LegacyMobileChannelChatScreen {...props} />;
}
