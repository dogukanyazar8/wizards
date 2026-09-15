import { z } from "zod";

export const PhoneNumberSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^[+\d ()-]*$/)
  .transform((value) => value.replace(/[ ()-]/g, ""))
  .pipe(z.union([z.literal(""), z.string().regex(/^\+[1-9]\d{7,14}$/)]))
  .transform((value) => value || null);

export const EmailChangeRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).email(),
    password: z.string().max(100).optional(),
    twoFactorCode: z.string().trim().max(32).optional(),
  })
  .strict();
export const EmailChangeConfirmSchema = z
  .object({
    id: z.string().uuid(),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();
export const EMAIL_CHANGE_TTL_MS = 10 * 60_000;
export const EMAIL_CHANGE_MAX_ATTEMPTS = 5;
