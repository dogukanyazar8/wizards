import bcrypt from "bcryptjs";

import { prisma } from "@wizards/db";

/**
 * Parola doğrulamasının tek yeri.
 *
 * K2'den önce bu iş yalnız NextAuth `authorize` içindeydi; artık `loginAction` da parolayı
 * doğrulamak zorunda (iki adımlı doğrulama açıksa oturum **açmadan** challenge üretecek).
 * İki kopya bcrypt karşılaştırması iki farklı gizli davranış demek olurdu — burada tek kaldı.
 *
 * Zamanlama sızıntısına karşı bilinmeyen hesap da bcrypt maliyetini öder: sabit bir özet
 * karşılaştırılır, böylece "bu adres kayıtlı mı" sorusu yanıt süresinden okunamaz.
 */

/** Gerçek bir hesabın özetiyle aynı maliyette (cost 12) sahte özet. */
export const WEB_MISSING_ACCOUNT_PASSWORD_HASH =
  "$2b$12$/zC3shOXAfktTcluug7UXukRRVQVvFIvceUC4sm3kIzn6iSSGGT6m";

export const LOGIN_CREDENTIAL_USER_SELECT = {
  avatarUrl: true,
  deletedAt: true,
  displayName: true,
  email: true,
  emailVerified: true,
  id: true,
  isBanned: true,
  locale: true,
  passwordHash: true,
  sessionsRevokedAfter: true,
  theme: true,
  twoFactorEnabled: true,
  twoFactorSecret: true,
  twoFactorSecretCiphertext: true,
  twoFactorSecretKeyVersion: true,
  username: true,
} as const;

export type LoginCredentialUser = {
  avatarUrl: string | null;
  deletedAt: Date | null;
  displayName: string | null;
  email: string;
  emailVerified: boolean;
  id: string;
  isBanned: boolean;
  locale: string | null;
  passwordHash: string | null;
  sessionsRevokedAfter: Date | null;
  theme: string | null;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext: string | null;
  twoFactorSecretKeyVersion: string | null;
  username: string;
};

export type VerifyLoginCredentialsResult =
  /** Hesap yok ya da parola yanlış. `userId` yalnız hesap **varsa** dolu (güvenlik günlüğü için). */
  | { status: "invalid"; userId: string | null }
  /** Hesap yasaklı ya da silinmiş — ikisi de aynı yanıtı verir, ayrım sızdırılmaz. */
  | { status: "blocked"; user: LoginCredentialUser }
  /** Parola doğru ama e-posta doğrulanmamış. */
  | { status: "unverified"; user: LoginCredentialUser }
  /** Parola doğru; `user.twoFactorEnabled` ikinci adımın gerekip gerekmediğini söyler. */
  | { status: "ok"; user: LoginCredentialUser };

export type LoginCredentialsDependencies = {
  compare: (password: string, hash: string) => Promise<boolean>;
  findUser: (email: string) => Promise<LoginCredentialUser | null>;
};

const defaultDependencies: LoginCredentialsDependencies = {
  compare: (password, hash) => bcrypt.compare(password, hash),
  findUser: (email) =>
    prisma.user.findUnique({
      select: LOGIN_CREDENTIAL_USER_SELECT,
      where: { email },
    }) as Promise<LoginCredentialUser | null>,
};

export async function verifyLoginCredentials(
  input: { email: string; password: string },
  overrides: Partial<LoginCredentialsDependencies> = {},
): Promise<VerifyLoginCredentialsResult> {
  const dependencies = { ...defaultDependencies, ...overrides };
  const user = await dependencies.findUser(input.email);
  const isPasswordValid = await dependencies.compare(
    input.password,
    user?.passwordHash ?? WEB_MISSING_ACCOUNT_PASSWORD_HASH,
  );

  if (!user?.passwordHash || !isPasswordValid) {
    return { status: "invalid", userId: user?.id ?? null };
  }

  if (user.isBanned || user.deletedAt) {
    return { status: "blocked", user };
  }

  if (!user.emailVerified) {
    return { status: "unverified", user };
  }

  return { status: "ok", user };
}
