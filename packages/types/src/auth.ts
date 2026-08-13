import { z } from "zod";

import { isBcryptPasswordWithinLimit } from "./password";

const NewPasswordSchema = z
  .string()
  .min(8, "validation.password.min")
  .max(100, "validation.password.max")
  .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax");

const ConfirmNewPasswordSchema = z
  .string()
  .max(100, "validation.password.max")
  .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax");

export const TurnstileTokenSchema = z
  .string()
  .min(1, "validation.turnstile.required")
  .max(4096, "validation.turnstile.invalid");

const TwoFactorCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : ""),
  z.string().max(64, "validation.twoFactor.invalid"),
);

export const LoginCredentialsSchema = z.object({
  email: z.string().email("validation.email.invalid"),
  password: z.string().min(8, "validation.password.min"),
});

const RememberMeSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "on", "true", "yes"].includes(value.toLowerCase());
  }

  return false;
}, z.boolean());

export const LoginSchema = LoginCredentialsSchema.extend({
  rememberMe: RememberMeSchema,
  twoFactorCode: TwoFactorCodeSchema,
  turnstileToken: TurnstileTokenSchema,
});

export const RegisterSchema = z
  .object({
    email: z.string().email("validation.email.invalid"),
    username: z
      .string()
      .min(2, "validation.username.min")
      .max(32, "validation.username.max")
      .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern"),
    password: NewPasswordSchema,
    confirmPassword: ConfirmNewPasswordSchema,
    turnstileToken: TurnstileTokenSchema,
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  });

export const ForgotPasswordSchema = z.object({
  email: z.string().email("validation.email.invalid"),
  turnstileToken: TurnstileTokenSchema,
});

export const ResetPasswordSchema = z
  .object({
    password: NewPasswordSchema,
    confirmPassword: ConfirmNewPasswordSchema,
    token: z.string().min(1, "auth.passwordReset.invalidToken"),
    turnstileToken: TurnstileTokenSchema,
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof LoginSchema>;
export type LoginFormInput = z.input<typeof LoginSchema>;
export type LoginCredentialsInput = z.infer<typeof LoginCredentialsSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
