import { randomBytes } from "node:crypto";
import { prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";

import { ApiError } from "@/lib/api";

const INVITE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function generateInviteCode(tx: Prisma.TransactionClient = prisma) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const bytes = randomBytes(8);
    let code = "";

    for (const byte of bytes) {
      code += INVITE_CHARSET[byte % INVITE_CHARSET.length];
      if (code.length === 8) {
        break;
      }
    }

    const [existingInvite, existingServer] = await Promise.all([
      tx.serverInvite.findUnique({
        where: { code },
        select: { id: true },
      }),
      tx.server.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      }),
    ]);

    if (!existingInvite && !existingServer) {
      return code;
    }
  }

  throw new ApiError("Unable to generate a unique invite code", 500);
}
