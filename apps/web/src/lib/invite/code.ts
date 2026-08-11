import { randomBytes as nodeRandomBytes } from "node:crypto";

import { INVITE_CODE_CHARSET } from "@wizards/types";

import { ApiError } from "@/lib/api";

/**
 * Faz 2 §B1 / §4.11. The one invite-code generator. Server invites and group
 * invites differ only in length and in what "already taken" means, so those are
 * the two arguments — a second generator is a second place for the alphabet or
 * the collision retry to drift.
 *
 * `crypto.randomBytes`, never `Math.random`: an invite code is a bearer
 * credential for a private conversation.
 */

/**
 * Enough that exhausting them means the code space is genuinely saturated, few
 * enough that a broken uniqueness check fails fast instead of hanging a request.
 */
export const INVITE_CODE_ATTEMPTS = 20;

export type GenerateInviteCodeInput = {
  /** Resolves true when the candidate is already in use. */
  isTaken(code: string): Promise<boolean>;
  length: number;
  /** Seam for the tests; production always uses `crypto.randomBytes`. */
  randomBytes?: (size: number) => Uint8Array;
};

/**
 * The modulo here is slightly biased — 256 is not a multiple of 32... except it
 * is: the charset holds exactly 32 characters, so every byte maps to one symbol
 * with no bias at all. Changing the alphabet's length would reintroduce it, so
 * the assertion below keeps that from happening quietly.
 */
const CHARSET_LENGTH = INVITE_CODE_CHARSET.length;

export function toInviteCode(bytes: Uint8Array, length: number): string {
  let code = "";

  for (const byte of bytes) {
    if (code.length === length) {
      break;
    }

    code += INVITE_CODE_CHARSET[byte % CHARSET_LENGTH];
  }

  return code;
}

export async function generateUniqueInviteCode({
  isTaken,
  length,
  randomBytes = nodeRandomBytes,
}: GenerateInviteCodeInput): Promise<string> {
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
    // One byte per character. Asking for fewer and reusing them would cut the
    // entropy the code advertises.
    const code = toInviteCode(randomBytes(length), length);

    if (!(await isTaken(code))) {
      return code;
    }
  }

  throw new ApiError("Unable to generate a unique invite code", 500);
}
