import { Text, View } from "react-native";
import type { DMSystemMessageTypeValue } from "@wizards/types";

import {
  buildGroupSystemMessageSentence,
  toGroupSystemMessageLabels,
} from "../../dm/group-system-message-copy";
import { copy } from "../mobile-root-screen-shared";
import { useDMChatStyles } from "./dm-chat-primitives.styles";

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
}

export function DMSystemMessageRow({
  currentUserId,
  message,
  participants,
}: DMSystemMessageRowProps) {
  const styles = useDMChatStyles();
  const sentence = buildGroupSystemMessageSentence({
    currentUserId,
    labels: toGroupSystemMessageLabels(copy),
    message,
    participants,
  });

  if (!sentence) {
    return null;
  }

  return (
    <View style={styles.systemMessageRow} testID="mobile-dm-system-message">
      <View style={styles.systemMessagePill}>
        <Text style={styles.systemMessageText}>{sentence}</Text>
      </View>
    </View>
  );
}
