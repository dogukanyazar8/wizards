import { auth } from "@/auth";
import { redirect } from "next/navigation";

/**
 * Kökün tek işi yönlendirmek. Oturum açıkken hedef artık `/home` — Ana Sayfa "1a Komuta Merkezi"
 * uygulamanın giriş ekranı (`05-faz4` §1).
 */
export default async function RootRoute() {
  const session = await auth();

  redirect(session?.user?.id ? "/home" : "/login");
}
