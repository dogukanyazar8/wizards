/**
 * `Yeni şifre` → `Şifre güncellendi` ekranına taşınan sonuç.
 *
 * SPEC-GIRIS-KAYIT §4.7 kapanış ekranı bir bilgi bandı yazıyor:
 * `3 cihazda oturum kapatıldı · 27.08.2026 · 11:24`. Sayı sunucudan gelen **gerçek** kapatılan
 * oturum sayısıdır; sıfırsa bant hiç gösterilmez (uydurma sayı yazılmaz).
 *
 * Değerler sorgu dizesine konmaz: kaç cihazda oturum açıldığı hesap hakkında bilgi verir.
 */

const OUTCOME_KEY = "whispr-reset-outcome";

export type ResetOutcome = {
  signedOutAt: string;
  signedOutDeviceCount: number;
};

export function storeResetOutcome(outcome: ResetOutcome): void {
  try {
    window.sessionStorage.setItem(OUTCOME_KEY, JSON.stringify(outcome));
  } catch {
    // Depolama kapalıysa kapanış ekranı bandı gizler; ekranın kalanı çalışır.
  }
}

export function readResetOutcome(): ResetOutcome | null {
  try {
    const raw = window.sessionStorage.getItem(OUTCOME_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ResetOutcome>;

    if (typeof parsed.signedOutAt !== "string") {
      return null;
    }

    return {
      signedOutAt: parsed.signedOutAt,
      signedOutDeviceCount:
        typeof parsed.signedOutDeviceCount === "number" ? parsed.signedOutDeviceCount : 0,
    };
  } catch {
    return null;
  }
}

export function clearResetOutcome(): void {
  try {
    window.sessionStorage.removeItem(OUTCOME_KEY);
  } catch {
    // Temizlenemezse değer sekme kapanınca düşer.
  }
}
