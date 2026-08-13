import { z } from "zod";

export const AuthSessionClientTypeSchema = z.enum(["WEB", "DESKTOP", "MOBILE", "UNKNOWN"]);
export const AuthSessionDeviceTypeSchema = z.enum(["DESKTOP", "MOBILE", "TABLET", "UNKNOWN"]);

const OptionalMetadataSchema = z.string().trim().min(1).max(128).nullable();

export const AuthSessionSchema = z
  .object({
    appVersion: z.string().trim().min(1).max(32).nullable(),
    browser: OptionalMetadataSchema,
    clientType: AuthSessionClientTypeSchema,
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    createdAt: z.string().datetime(),
    current: z.boolean(),
    deviceType: AuthSessionDeviceTypeSchema,
    expiresAt: z.string().datetime(),
    id: z.string().min(1).max(128),
    lastSeenAt: z.string().datetime(),
    os: OptionalMetadataSchema,
  })
  .strict();

export const AuthSessionsResponseSchema = z
  .object({ sessions: z.array(AuthSessionSchema).max(100) })
  .strict();

export const AuthSessionRevokeResponseSchema = z
  .object({
    currentSessionRevoked: z.boolean(),
    revokedSessionId: z.string().min(1).max(128),
  })
  .strict();

export const AuthSessionRevokeOthersResponseSchema = z
  .object({ revokedCount: z.number().int().nonnegative() })
  .strict();

export type AuthSession = z.infer<typeof AuthSessionSchema>;
export type AuthSessionsResponse = z.infer<typeof AuthSessionsResponseSchema>;
export type AuthSessionRevokeResponse = z.infer<typeof AuthSessionRevokeResponseSchema>;
export type AuthSessionRevokeOthersResponse = z.infer<typeof AuthSessionRevokeOthersResponseSchema>;
