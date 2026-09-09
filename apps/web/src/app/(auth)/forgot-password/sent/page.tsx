import { ForgotPasswordSentClient } from "./sent-client";

/**
 * SPEC-GIRIS-KAYIT §4.7 — `Bağlantı gönderildi` ve `Bağlantı yeniden gönderildi`.
 * Tek rota, iki durum (K11).
 */
export default function ForgotPasswordSentPage() {
  return <ForgotPasswordSentClient />;
}
