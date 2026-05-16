import { prisma } from "@wizards/db";

import { logError } from "@/lib/logger";

type RegistrationRollbackUserDelegate = {
  delete(args: { where: { id: string } }): Promise<unknown>;
};

type RegistrationRollbackLogger = (scope: string, error: unknown) => void;

export type RollbackUnverifiedUserResult =
  | { ok: true }
  | { error: unknown; ok: false };

export async function rollbackUnverifiedUser(input: {
  email: string;
  logger?: RegistrationRollbackLogger;
  userDelegate?: RegistrationRollbackUserDelegate;
  userId: string;
}): Promise<RollbackUnverifiedUserResult> {
  const userDelegate = input.userDelegate ?? prisma.user;
  const logger = input.logger ?? logError;

  try {
    await userDelegate.delete({
      where: {
        id: input.userId,
      },
    });
    return { ok: true };
  } catch (error) {
    logger("[auth] Failed to roll back unverified registration user", {
      email: input.email,
      error,
      userId: input.userId,
    });
    return {
      error,
      ok: false,
    };
  }
}
