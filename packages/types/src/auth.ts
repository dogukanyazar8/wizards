import { z } from "zod";

import { PASSWORD_MIN_LENGTH, meetsPasswordPolicy } from "./auth-password-policy";
import { isBcryptPasswordWithinLimit } from "./password";

/**
 * `design_handoff/giris-kayit-paketi/SPEC.md` §10 kayıt ve şifre sıfırlamada dört kuralın
 * en az üçünü istiyor, uzunluk kuralı 10 karakter. Mevcut hesapların **girişi** etkilenmez —
 * `LoginCredentialsSchema` eski alt sınırda kalır, yoksa 8 karakterli eski şifreler kilitlenir.
 */
const NewPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "validation.password.min")
  .max(100, "validation.password.max")
  .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax")
  .refine(meetsPasswordPolicy, "validation.password.rules");

const ConfirmNewPasswordSchema = z
  .string()
  .max(100, "validation.password.max")
  .refine(isBcryptPasswordWithinLimit, "validation.password.bcryptMax");

export const TurnstileTokenSchema = z
  .string()
  .min(1, "validation.turnstile.required")
  .max(4096, "validation.turnstile.invalid");

/** SPEC §4.4/1 — `Ad Soyad`. `User.displayName` kolonuna yazılır (ayarlar tarafıyla aynı sınır). */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2, "validation.displayName.min")
  .max(60, "validation.displayName.max");

/**
 * SPEC §4.4/1 `Kullanıcı adı`. Tasarım 3–20 / `a-z0-9._` yazıyor ama **ürün kuralı korunur**
 * (paket kararı K8): mevcut kullanıcı adlarında büyük harf ve 20+ uzunluk var, daraltmak onları
 * kırardı. Ekranda kural metni görünmediği için görsel sapma yok.
 */
export const UsernameSchema = z
  .string()
  .min(2, "validation.username.min")
  .max(32, "validation.username.max")
  .regex(/^[a-zA-Z0-9_]+$/, "validation.username.pattern");

/** SPEC §4.2 ve §4.5 — altı hane. */
const SixDigitCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().regex(/^\d{6}$/, "validation.verificationCode.invalid"),
);

/**
 * SPEC §4.3 örnek `7QF4-2KDX-9M`. Görüntü maskesi ekranın işi; sözleşme normalize değeri
 * taşır (büyük harf, ayraçsız), böylece kullanıcı tireyle de yapıştırsa doğrulama tutar.
 */
const BackupCodeSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : value),
  z.string().min(8, "validation.backupCode.invalid").max(24, "validation.backupCode.invalid"),
);

/**
 * İki adımlı giriş challenge kimliği (K2). Sunucu 32 baytlık opak bir değer üretir; şema
 * yalnız biçim sınırını korur, içeriğini yorumlamaz.
 */
const LoginChallengeIdSchema = z
  .string()
  .min(24, "validation.twoFactor.challenge")
  .max(128, "validation.twoFactor.challenge")
  .regex(/^[A-Za-z0-9_-]+$/, "validation.twoFactor.challenge");

export const LoginCredentialsSchema = z.object({
  email: z.string().email("validation.email.invalid"),
  password: z.string().min(8, "validation.password.min"),
});

const BooleanFlagSchema = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return ["1", "on", "true", "yes"].includes(value.toLowerCase());
  }

  return false;
}, z.boolean());

const RememberMeSchema = BooleanFlagSchema;

/**
 * SPEC §4.1 — giriş formu yalnız kimlik bilgisini taşır. İki adımlı doğrulama kodu bu şemadan
 * **çıkarıldı** (K2): kod ayrı ekrandan, ayrı şemayla, challenge kimliğiyle birlikte gelir.
 */
export const LoginSchema = LoginCredentialsSchema.extend({
  rememberMe: RememberMeSchema,
  turnstileToken: TurnstileTokenSchema,
});

/** SPEC §4.2 — ayrı 2FA ekranı. */
export const TwoFactorChallengeSchema = z.object({
  challengeId: LoginChallengeIdSchema,
  code: SixDigitCodeSchema,
  rememberDevice: BooleanFlagSchema,
});

/** SPEC §4.3 — yedek kodla giriş. */
export const BackupCodeChallengeSchema = z.object({
  challengeId: LoginChallengeIdSchema,
  backupCode: BackupCodeSchema,
  rememberDevice: BooleanFlagSchema.optional(),
});

/** SPEC §4.5 — altı haneli e-posta doğrulama kodu (K3). */
export const EmailVerificationCodeSchema = z.object({
  code: SixDigitCodeSchema,
});

/** SPEC §4.5 — `Kodu tekrar gönder`. K1 gereği tek kanal. */
export const ResendVerificationSchema = z.object({
  channel: z.literal("email"),
});

/**
 * SPEC §4.4 — dört alan: Ad Soyad · Kullanıcı adı · E-posta · Şifre.
 * Tasarımda şifre tekrar alanı **yok** (K10), bu yüzden `confirmPassword` da yok.
 */
export const RegisterSchema = z.object({
  displayName: DisplayNameSchema,
  email: z.string().email("validation.email.invalid"),
  password: NewPasswordSchema,
  turnstileToken: TurnstileTokenSchema,
  username: UsernameSchema,
});

export const ForgotPasswordSchema = z.object({
  email: z.string().email("validation.email.invalid"),
  turnstileToken: TurnstileTokenSchema,
});

/** SPEC §4.7 `Yeni şifre` ekranı iki alanlıdır — tekrar alanı burada **kalır** (K10). */
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
export type TwoFactorChallengeInput = z.infer<typeof TwoFactorChallengeSchema>;
export type BackupCodeChallengeInput = z.infer<typeof BackupCodeChallengeSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
