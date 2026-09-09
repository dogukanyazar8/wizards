/**
 * SPEC-GIRIS-KAYIT §6 — mobil kimlik yığını.
 *
 * `Welcome` ekranı paket kararı K4 ile kaldırıldı; uygulama doğrudan giriş ekranıyla açılır.
 * İkinci adım ekranları challenge kimliğini rota parametresiyle taşır — parola taşınmaz (K2).
 */
export type MobileAuthStackParamList = {
  BackupCode: { challengeId: string };
  ForgotPassword: undefined;
  Login: undefined;
  Register: undefined;
  TwoFactor: { challengeId: string };
};
