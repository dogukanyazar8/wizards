const TOTP_REPLAY_KEY_PREFIX = "auth:two-factor:replay";
const USER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;

export const TOTP_REPLAY_TTL_SECONDS = 120;

export type TotpReplayStore = {
  consume: (input: { counter: number; userId: string }) => Promise<boolean>;
};

type TotpReplayRedis = {
  set: (
    key: string,
    value: string,
    mode: "EX",
    seconds: number,
    condition: "NX",
  ) => Promise<unknown>;
};

function getTotpReplayKey(userId: string, counter: number) {
  if (!USER_ID_PATTERN.test(userId)) {
    throw new TypeError("TOTP replay user identifier is invalid.");
  }
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new TypeError("TOTP replay counter is invalid.");
  }
  return `${TOTP_REPLAY_KEY_PREFIX}:${userId}:${counter}`;
}

export function createRedisTotpReplayStore(redis: TotpReplayRedis): TotpReplayStore {
  return {
    async consume({ counter, userId }) {
      const result = await redis.set(
        getTotpReplayKey(userId, counter),
        "1",
        "EX",
        TOTP_REPLAY_TTL_SECONDS,
        "NX",
      );
      return result === "OK";
    },
  };
}
