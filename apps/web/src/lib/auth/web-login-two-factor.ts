import { verifyTwoFactorCredential, type TwoFactorServiceDependencies } from "./two-factor";

export type WebLoginTwoFactorUser = {
  id: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorSecretCiphertext: string | null;
  twoFactorSecretKeyVersion: string | null;
};

export async function verifyWebLoginTwoFactor(
  user: WebLoginTwoFactorUser,
  code: string,
  dependencies?: TwoFactorServiceDependencies,
) {
  if (!user.twoFactorEnabled) {
    return true;
  }

  const result = await verifyTwoFactorCredential(
    {
      code,
      secret: user.twoFactorSecret,
      secretCiphertext: user.twoFactorSecretCiphertext,
      secretKeyVersion: user.twoFactorSecretKeyVersion,
      userId: user.id,
    },
    dependencies,
  );
  return result.success;
}
