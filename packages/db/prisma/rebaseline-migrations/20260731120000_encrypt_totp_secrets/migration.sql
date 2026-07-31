ALTER TABLE "User"
  ADD COLUMN "twoFactorSecretCiphertext" TEXT,
  ADD COLUMN "twoFactorSecretKeyVersion" VARCHAR(64);
