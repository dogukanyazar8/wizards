import { prisma } from "@wizards/db";
import type { Prisma } from "@wizards/db";

import { generateUniqueInviteCode } from "@/lib/invite/code";

/** `ServerInvite.code` is `VARCHAR(8)`; group invites are longer (§B1). */
const SERVER_INVITE_CODE_LENGTH = 8;

export async function generateInviteCode(tx: Prisma.TransactionClient = prisma) {
  return await generateUniqueInviteCode({
    // A server's own vanity code lives on `Server.inviteCode`, so both tables
    // have to agree the candidate is free.
    isTaken: async (code) => {
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

      return Boolean(existingInvite || existingServer);
    },
    length: SERVER_INVITE_CODE_LENGTH,
  });
}
