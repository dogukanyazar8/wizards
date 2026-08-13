import { prisma } from "@wizards/db";
import { ApiError } from "@/lib/api";
import { MAX_VOICE_PARTICIPANTS } from "@/lib/voice/types";

export type VoiceCapacityDelegate = {
  count(args: { where: { channelId: string; NOT: { userId: string } } }): Promise<number>;
};

export function resolveVoiceParticipantLimit(userLimit: number) {
  return userLimit <= 0 ? MAX_VOICE_PARTICIPANTS : Math.min(userLimit, MAX_VOICE_PARTICIPANTS);
}

export async function assertVoiceChannelCapacity(args: {
  channelId: string;
  userId: string;
  userLimit?: number;
  voiceState?: VoiceCapacityDelegate;
}) {
  const voiceState = args.voiceState ?? prisma.voiceState;
  const otherParticipantCount = await voiceState.count({
    where: {
      channelId: args.channelId,
      NOT: { userId: args.userId },
    },
  });

  if (otherParticipantCount >= resolveVoiceParticipantLimit(args.userLimit ?? 0)) {
    throw new ApiError("Voice channel is full", 403, "ROOM_FULL");
  }
}
