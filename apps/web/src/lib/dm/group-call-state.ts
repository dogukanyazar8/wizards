import type { DMNotifyLevel, GroupCallStateDTO } from "@wizards/types";

import { getRedisOp } from "@/lib/redis";

/**
 * Grup sohbetleri 2a–2f, Faz 2 §D2. Who is inside a group call right now.
 *
 * Redis only, exactly like the 1:1 call it extends (D5: no database model). The
 * decision half is pure so the race rule, the roster arithmetic and the ring
 * eligibility can all be tested without a Redis; the wrapper below is the thin
 * part that reads, applies and writes back.
 */

/**
 * Longer than `DM_CALL_RING_TTL_MS` (45s) on purpose: a call that nobody has
 * answered yet must still exist when the ring times out, or the caller's own
 * hang-up would find nothing to clean up. Every write refreshes it, so a live
 * call never expires under its participants.
 */
export const GROUP_CALL_STATE_TTL_MS = 6 * 60 * 60 * 1000;

export type StoredGroupCallParticipant = {
  readonly joinedAt: string;
  readonly userId: string;
};

export type StoredGroupCallState = {
  readonly participants: StoredGroupCallParticipant[];
  readonly startedAt: string;
  readonly video: boolean;
};

export function groupCallStateKey(conversationId: string): string {
  return `dm:call:${conversationId}`;
}

/**
 * D2's race rule, as one function: "start" and "join" are the same operation.
 * Two people pressing call at the same moment both land here, and the second one
 * finds the first one's record and joins it rather than opening a second room.
 */
export function applyGroupCallJoin(
  state: StoredGroupCallState | null,
  input: { joinedAt: Date; userId: string; video?: boolean },
): StoredGroupCallState {
  const joinedAt = input.joinedAt.toISOString();

  if (!state) {
    return {
      participants: [{ joinedAt, userId: input.userId }],
      startedAt: joinedAt,
      video: input.video ?? false,
    };
  }

  // A reconnect keeps its original entry time: resetting it would reorder the
  // roster every time somebody's network hiccupped.
  const participants = state.participants.some((participant) => participant.userId === input.userId)
    ? state.participants
    : [...state.participants, { joinedAt, userId: input.userId }];

  return {
    participants,
    startedAt: state.startedAt,
    // Video is a property of the call, and it only ever goes up: one person
    // joining with their camera off must not turn everybody else's call into a
    // voice call.
    video: state.video || (input.video ?? false),
  };
}

/** Returns null once the last participant is gone — that is the call ending. */
export function applyGroupCallLeave(
  state: StoredGroupCallState | null,
  userId: string,
): StoredGroupCallState | null {
  if (!state) {
    return null;
  }

  const participants = state.participants.filter((participant) => participant.userId !== userId);

  if (participants.length === 0) {
    return null;
  }

  return { ...state, participants };
}

export function toGroupCallStateDTO(
  conversationId: string,
  state: StoredGroupCallState | null,
): GroupCallStateDTO {
  if (!state) {
    // The tombstone. Without it a client that only ever sees `active: true`
    // never learns the call finished.
    return { active: false, conversationId, participants: [], startedAt: null, video: false };
  }

  return {
    active: true,
    conversationId,
    participants: state.participants.map((participant) => ({ ...participant })),
    startedAt: state.startedAt,
    video: state.video,
  };
}

export function serializeGroupCallState(state: StoredGroupCallState): string {
  return JSON.stringify(state);
}

/**
 * A corrupt or missing record reads as "no call". Throwing here would take down
 * the socket handler that called it, and a forgotten call is something the
 * participants can recover from by hanging up.
 */
export function parseGroupCallState(raw: string | null): StoredGroupCallState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as StoredGroupCallState).participants) ||
      typeof (parsed as StoredGroupCallState).startedAt !== "string"
    ) {
      return null;
    }

    return parsed as StoredGroupCallState;
  } catch {
    return null;
  }
}

/**
 * E5. `NONE` is silence, so that member's devices do not ring — but they still
 * receive `dm:call:state` and see the call sitting in the conversation. Somebody
 * already inside is not rung either, which is what makes "süregelen çağrıya
 * katılma" quiet for the people already there.
 */
export function shouldRingParticipant(
  participant: { notifyLevel: DMNotifyLevel; userId: string },
  state: StoredGroupCallState | null,
): boolean {
  if (participant.notifyLevel === "NONE") {
    return false;
  }

  return !state?.participants.some((entry) => entry.userId === participant.userId);
}

/**
 * D3's fan-out, decided in one place. `dm:call:state` reaches every member of
 * the conversation — that is what feeds 2d's "çağrı sürüyor" badge and 2e's
 * "Katıl" for people who are not in the call. The ring is the narrower set:
 * not the caller, not anybody already inside, and not anybody on `NONE`.
 */
export function planGroupCallSignals(
  callerId: string,
  participants: ReadonlyArray<{ notifyLevel: DMNotifyLevel; userId: string }>,
  state: StoredGroupCallState | null,
): { ringUserIds: string[]; stateUserIds: string[] } {
  return {
    ringUserIds: participants
      .filter(
        (participant) =>
          participant.userId !== callerId && shouldRingParticipant(participant, state),
      )
      .map((participant) => participant.userId),
    stateUserIds: participants.map((participant) => participant.userId),
  };
}

export type GroupCallStore = {
  mutate?(
    conversationId: string,
    mutation: GroupCallMutation,
  ): Promise<StoredGroupCallState | null>;
  read(conversationId: string): Promise<StoredGroupCallState | null>;
  remove(conversationId: string): Promise<void>;
  write(conversationId: string, state: StoredGroupCallState): Promise<void>;
};

export type GroupCallMutation =
  | { input: { joinedAt: Date; userId: string; video?: boolean }; type: "join" }
  | { type: "leave"; userId: string };

const MUTATE_GROUP_CALL_STATE_SCRIPT = `
local key = KEYS[1]
local operation = ARGV[1]
local userId = ARGV[2]
local joinedAt = ARGV[3]
local wantsVideo = ARGV[4] == "1"
local ttlMs = tonumber(ARGV[5])

local state = nil
local raw = redis.call("GET", key)
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == "table" and type(decoded.participants) == "table" then
    state = decoded
  end
end

if operation == "join" then
  if not state then
    state = { participants = {}, startedAt = joinedAt, video = wantsVideo }
  end

  local found = false
  for _, participant in ipairs(state.participants) do
    if participant.userId == userId then
      found = true
      break
    end
  end
  if not found then
    table.insert(state.participants, { joinedAt = joinedAt, userId = userId })
  end
  if wantsVideo then
    state.video = true
  end

  local encoded = cjson.encode(state)
  redis.call("SET", key, encoded, "PX", ttlMs)
  return encoded
end

if not state then
  return ""
end

local remaining = {}
for _, participant in ipairs(state.participants) do
  if participant.userId ~= userId then
    table.insert(remaining, participant)
  end
end

if #remaining == 0 then
  redis.call("DEL", key)
  return ""
end

state.participants = remaining
local encoded = cjson.encode(state)
redis.call("SET", key, encoded, "PX", ttlMs)
return encoded
`;

export const redisGroupCallStore: GroupCallStore = {
  mutate: async (conversationId, mutation) => {
    const raw = await getRedisOp().eval(
      MUTATE_GROUP_CALL_STATE_SCRIPT,
      1,
      groupCallStateKey(conversationId),
      mutation.type,
      mutation.type === "join" ? mutation.input.userId : mutation.userId,
      mutation.type === "join" ? mutation.input.joinedAt.toISOString() : "",
      mutation.type === "join" && mutation.input.video === true ? "1" : "0",
      GROUP_CALL_STATE_TTL_MS,
    );

    return parseGroupCallState(typeof raw === "string" && raw.length > 0 ? raw : null);
  },
  read: async (conversationId) =>
    parseGroupCallState(await getRedisOp().get(groupCallStateKey(conversationId))),
  remove: async (conversationId) => {
    await getRedisOp().del(groupCallStateKey(conversationId));
  },
  write: async (conversationId, state) => {
    // Every write refreshes the TTL, so a long call never expires underneath the
    // people in it while an abandoned record still disappears on its own.
    await getRedisOp().set(
      groupCallStateKey(conversationId),
      serializeGroupCallState(state),
      "PX",
      GROUP_CALL_STATE_TTL_MS,
    );
  },
};

/**
 * Production mutations run in one Redis Lua script. Injected legacy stores keep
 * the read/apply/write fallback for pure tests and non-Redis callers.
 */
export async function joinGroupCall(
  conversationId: string,
  input: { joinedAt: Date; userId: string; video?: boolean },
  store: GroupCallStore = redisGroupCallStore,
): Promise<StoredGroupCallState> {
  if (store.mutate) {
    const next = await store.mutate(conversationId, { input, type: "join" });
    if (!next) {
      throw new Error("Atomic group call join returned no state");
    }
    return next;
  }

  const next = applyGroupCallJoin(await store.read(conversationId), input);
  await store.write(conversationId, next);

  return next;
}

export async function leaveGroupCall(
  conversationId: string,
  userId: string,
  store: GroupCallStore = redisGroupCallStore,
): Promise<StoredGroupCallState | null> {
  if (store.mutate) {
    return await store.mutate(conversationId, { type: "leave", userId });
  }

  const next = applyGroupCallLeave(await store.read(conversationId), userId);

  if (next) {
    await store.write(conversationId, next);
  } else {
    await store.remove(conversationId);
  }

  return next;
}

export async function readGroupCallState(
  conversationId: string,
  store: GroupCallStore = redisGroupCallStore,
): Promise<StoredGroupCallState | null> {
  return await store.read(conversationId);
}
