/**
 * Kayıttan doğrulama ekranına taşınan adres.
 *
 * SPEC-GIRIS-KAYIT §4.5 doğrulama ekranında adresi gösteriyor (`ada@whispr.app adresine 6 haneli
 * bir kod gönderdik`). Adres **URL'e yazılmaz**: e-posta kişisel veridir, sorgu dizesi tarayıcı
 * geçmişine, sunucu günlüklerine ve `Referer` başlığına düşer.
 *
 * `sessionStorage` sekmeye bağlıdır ve sekme kapanınca ölür; doğrulama ekranı adresi bulamazsa
 * kullanıcıdan yeniden girmesini isteyebilir.
 */

const PENDING_EMAIL_KEY = "whispr-pending-verification-email";

export function storePendingVerificationEmail(email: string): void {
  try {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, email);
  } catch {
    // Depolama kapalıysa doğrulama ekranı adresi soracak; akış kırılmaz.
  }
}

export function readPendingVerificationEmail(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function clearPendingVerificationEmail(): void {
  try {
    window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
  } catch {
    // Temizlenemezse adres sekme kapanınca zaten düşer.
  }
}
