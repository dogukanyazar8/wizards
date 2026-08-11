import { z } from "zod";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §D. The shape of `dm:call:state`, the one event
 * both clients derive "çağrı sürüyor" and 2e's "Katıl" from. E4 is binding: the
 * client reads this payload, it never reconstructs the roster from the ring and
 * hang-up signals it happened to witness.
 *
 * Leaf module: no imports from the package, so the call state can be parsed by a
 * client that holds nothing else.
 */

export interface GroupCallParticipantDTO {
  userId: string;
  /** ISO instant this participant entered the call, not when the call started. */
  joinedAt: string;
}

export interface GroupCallStateDTO {
  conversationId: string;
  /** False is the tombstone: the last participant left and the room is gone. */
  active: boolean;
  /** ISO instant the first participant started the call; null once inactive. */
  startedAt: string | null;
  /** True when the call was started as a video call (2e's "Görüntülü"). */
  video: boolean;
  participants: GroupCallParticipantDTO[];
}

export const GroupCallParticipantDTOSchema: z.ZodType<GroupCallParticipantDTO> = z.object({
  userId: z.string(),
  joinedAt: z.string(),
});

export const GroupCallStateDTOSchema: z.ZodType<GroupCallStateDTO> = z.object({
  conversationId: z.string(),
  active: z.boolean(),
  startedAt: z.string().nullable(),
  video: z.boolean(),
  participants: z.array(GroupCallParticipantDTOSchema),
});

/**
 * Faz 5 §B5. The same payload `dm:call:state` pushes, behind a GET so a screen
 * that opens *after* the call started still draws the "Katıl" banner — the
 * socket only broadcasts transitions, and a reader who was offline for the one
 * that mattered would otherwise see a group that looks idle.
 */
export const GroupCallStateResponseSchema = z
  .object({ callState: GroupCallStateDTOSchema })
  .strict();
