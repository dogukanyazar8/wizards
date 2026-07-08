import type { ComponentProps } from "react";

import {
  DMConversationScreen as LegacyDMConversationScreen,
  MessagesScreen as LegacyMessagesScreen,
} from "../mobile-root-screens-legacy";

export type MessagesScreenProps = ComponentProps<typeof LegacyMessagesScreen>;
export type DMConversationScreenProps = ComponentProps<typeof LegacyDMConversationScreen>;

export function MessagesScreen(props: MessagesScreenProps) {
  return <LegacyMessagesScreen {...props} />;
}

export function DMConversationScreen(props: DMConversationScreenProps) {
  return <LegacyDMConversationScreen {...props} />;
}
