import { AuthSurfaceGate } from "@/components/auth/auth-surface-gate";

/**
 * Kimlik akışının düzeni.
 *
 * Önceki kuşakta burada bir muafiyet dalı vardı: `/login`, `/register`, `/forgot-password` ve
 * `/reset-password` kabuğu **atlıyordu** ve kendi işaretlemesini çiziyordu. SPEC-GIRIS-KAYIT tek
 * kabuk istiyor (§3, §4), bu yüzden dal kaldırıldı; kabuk artık her ekranın kendi sayfasından
 * (`AuthScreenLayout`) geliyor.
 *
 * Açık/koyu seçimini ilk boyadan önce köke yazan betik (K6) **kök düzende** duruyor: rota grubu
 * düzeninde `next/script` uyarı veriyor ve istemci geçişlerinde hiç koşmuyordu.
 *
 * Düzenin tek işi kaldı: yüzeyi işaretlemek (SPEC §5) — masaüstünde ölçek kademesi tek
 * anahtarla iner.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthSurfaceGate>{children}</AuthSurfaceGate>;
}
