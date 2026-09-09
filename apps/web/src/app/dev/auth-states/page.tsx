import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AuthStatesGallery } from "@/components/dev/auth-states-gallery";

/**
 * SPEC-GIRIS-KAYIT §7 · §8 · §9 iç denetim galerisi.
 *
 * Üretimde 404. Bu sayfa kullanıcıya değil tasarım denetimine bakar: 10 durum kartı, üç hata
 * seviyesi ve bileşen durumları iki temada tek ekranda toplanır.
 */
const isGalleryEnabled = process.env.NODE_ENV !== "production";

export const metadata: Metadata = {
  description: "Whispr auth status, error level and component state gallery",
  title: "Auth states",
};

export default function AuthStatesPage() {
  if (!isGalleryEnabled) {
    notFound();
  }

  return <AuthStatesGallery />;
}
