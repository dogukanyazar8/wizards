import { Text, View } from "react-native";
import type { DMSystemMessageTypeValue } from "@wizards/types";

import {
  buildGroupSystemMessageSentence,
  toGroupSystemMessageLabels,
} from "../../dm/group-system-message-copy";
import { copy } from "../mobile-root-screen-shared";
import { useDMChatStyles } from "./dm-chat-primitives.styles";
import { useGroupChatStyles } from "../screens/group-chat.styles";

export interface MobileDMSystemMessageParticipant {
  readonly displayName?: string | null | undefined;
  readonly userId: string;
  readonly username: string;
}

export interface DMSystemMessageRowProps {
  readonly currentUserId: string;
  readonly message: {
    readonly systemTargetUserIds?: readonly string[] | undefined;
    readonly systemType?: DMSystemMessageTypeValue | null | undefined;
    readonly systemValue?: string | null | undefined;
    readonly userId: string;
  };
  readonly participants: readonly MobileDMSystemMessageParticipant[];
  /**
   * Faz 5 §B3. A group draws HTML 302's capsule from `theme.groupChat`; a 1:1
   * keeps the messaging pill it has always had. Same sentence either way — the
   * copy is built once, above.
   */
  readonly variant?: "dm" | "group";
}

export function DMSystemMessageRow({
  currentUserId,
  message,
  participants,
  variant = "dm",
}: DMSystemMessageRowProps) {
  const dmStyles = useDMChatStyles();
  const groupStyles = useGroupChatStyles();
  const sentence = buildGroupSystemMessageSentence({
    currentUserId,
    labels: toGroupSystemMessageLabels(copy),
    message,
    participants,
  });

  if (!sentence) {
    return null;
  }

  const isGroup = variant === "group";

  return (
    <View
      style={isGroup ? groupStyles.systemCapsuleRow : dmStyles.systemMessageRow}
      testID="mobile-dm-system-message"
    >
      <View style={isGroup ? groupStyles.systemCapsule : dmStyles.systemMessagePill}>
        <Text style={isGroup ? groupStyles.systemCapsuleText : dmStyles.systemMessageText}>
          {sentence}
        </Text>
      </View>
    </View>
  );
}
