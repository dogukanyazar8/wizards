/**
 * Challenge kimliğinin ekranlar arası taşınması — paket kararı K2.
 *
 * Kimlik **URL'e yazılmaz**: adres çubuğu paylaşılır, tarayıcı geçmişine düşer, sunucu
 * günlüklerine ve `Referer` başlığına sızar. `sessionStorage` sekmeye bağlı ve sekme
 * kapanınca ölür — kısa ömürlü bir challenge için doğru yer.
 *
 * Depolama kapalıysa (gizli sekme, kurum politikası) akış sessizce çökmesin diye okuma `null`
 * döner ve ekran kullanıcıyı giriş ekranına geri gönderir.
 */

const CHALLENGE_KEY = "whispr-2fa-challenge";
const EMAIL_KEY = "whispr-2fa-email";

export type PendingTwoFactorChallenge = {
  challengeId: string;
  email: string;
};

export function storeTwoFactorChallenge(challenge: PendingTwoFactorChallenge): void {
  try {
    window.sessionStorage.setItem(CHALLENGE_KEY, challenge.challengeId);
    window.sessionStorage.setItem(EMAIL_KEY, challenge.email);
  } catch {
    // Depolama yoksa ikinci adım ekranı challenge'ı bulamaz ve girişe döner.
  }
}

export function readTwoFactorChallenge(): PendingTwoFactorChallenge | null {
  try {
    const challengeId = window.sessionStorage.getItem(CHALLENGE_KEY);
    const email = window.sessionStorage.getItem(EMAIL_KEY);

    return challengeId && email ? { challengeId, email } : null;
  } catch {
    return null;
  }
}

export function clearTwoFactorChallenge(): void {
  try {
    window.sessionStorage.removeItem(CHALLENGE_KEY);
    window.sessionStorage.removeItem(EMAIL_KEY);
  } catch {
    // Temizlenemezse challenge zaten sunucuda tek kullanımlık ve beş dakikada düşüyor.
  }
}
