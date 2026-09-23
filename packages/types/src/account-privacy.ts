import { z } from "zod";

export const ACCOUNT_DELETION_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT" as const;

export const AccountDeletionReauthMethodSchema = z.enum(["PASSWORD", "EMAIL"]);

export const AccountDeletionOwnedServerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
  })
  .strict();

export const AccountDeletionPreflightSchema = z
  .object({
    canDelete: z.boolean(),
    confirmationPhrase: z.literal(ACCOUNT_DELETION_CONFIRMATION_PHRASE),
    emailVerified: z.boolean(),
    ownedServers: z.array(AccountDeletionOwnedServerSchema).max(100),
    reauthMethod: AccountDeletionReauthMethodSchema,
  })
  .strict();

export const AccountDeletionRequestSchema = z
  .object({
    confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION_PHRASE),
  })
  .strict();

export type AccountDeletionPreflight = z.infer<typeof AccountDeletionPreflightSchema>;
