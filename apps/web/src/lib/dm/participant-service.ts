import { prisma } from "@wizards/db";

export async function isDMParticipant(userId: string, conversationId: string): Promise<boolean> {
  const participant = await prisma.dMParticipant.findUnique({
    where: {
      conversationId_userId: {
        conversationId,
        userId,
      },
    },
    select: { id: true },
  });

  return participant !== null;
}
