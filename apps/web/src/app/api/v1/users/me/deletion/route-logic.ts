import {
  ACCOUNT_DELETION_CONFIRMATION_PHRASE,
  AccountDeletionPreflightSchema,
} from "@wizards/types";

import { ApiError, jsonError } from "@/lib/api";

export type AccountDeletionPreflightUser = {
  emailVerified: boolean;
  id: string;
  ownedServers: Array<{ id: string; name: string }>;
  passwordHash: string | null;
};

export type AccountDeletionPreflightDependencies = {
  authenticate(): Promise<string>;
  loadUser(userId: string): Promise<AccountDeletionPreflightUser | null>;
};

export async function accountDeletionPreflightRoute(
  dependencies: AccountDeletionPreflightDependencies,
) {
  try {
    const userId = await dependencies.authenticate();
    const user = await dependencies.loadUser(userId);

    if (!user) {
      throw new ApiError("User not found", 404, "USER_NOT_FOUND");
    }

    return Response.json(
      AccountDeletionPreflightSchema.parse({
        canDelete: user.ownedServers.length === 0,
        confirmationPhrase: ACCOUNT_DELETION_CONFIRMATION_PHRASE,
        emailVerified: user.emailVerified,
        ownedServers: user.ownedServers,
        reauthMethod: user.passwordHash ? "PASSWORD" : "EMAIL",
      }),
    );
  } catch (error) {
    return jsonError(error);
  }
}
