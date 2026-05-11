import { z } from "zod";

export const LoginSchema = z.object({
  email: z.string().email("validation.email.invalid"),
  password: z.string().min(8, "validation.password.min"),
});

export const RegisterSchema = z
  .object({
    email: z.string().email("validation.email.invalid"),
    username: z
      .string()
      .min(2, "validation.username.min")
      .max(32, "validation.username.max")
      .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern"),
    password: z
      .string()
      .min(8, "validation.password.min")
      .max(100, "validation.password.max"),
    confirmPassword: z.string(),
    turnstileToken: z
      .string()
      .min(1, "validation.turnstile.required")
      .max(4096, "validation.turnstile.invalid"),
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  });

export const ForgotPasswordSchema = z.object({
  email: z.string().email("validation.email.invalid"),
});

export const ResetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "validation.password.min")
      .max(100, "validation.password.max"),
    confirmPassword: z.string(),
    token: z.string().min(1, "auth.passwordReset.invalidToken"),
  })
  .refine((data) => data.confirmPassword === data.password, {
    message: "validation.password.confirmMismatch",
    path: ["confirmPassword"],
  });

export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
