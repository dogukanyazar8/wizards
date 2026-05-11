"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/components/providers/locale-provider";
import { useRotatingText } from "@/hooks/use-rotating-text";
import type { AppLocale } from "@/lib/locale";

const HERO_COPY: Record<
  AppLocale,
  {
    chips: Array<{ color: string; label: string }>;
    staticTitle: string;
    slides: Array<{ description: string; gradient: string; title: string }>;
  }
> = {
  en: {
    chips: [
      { color: "#34D399", label: "End-to-End Encryption" },
      { color: "#818CF8", label: "Real Time" },
      { color: "#F472B6", label: "Community Rooms" },
      { color: "#38BDF8", label: "Files & Screen" },
      { color: "#FBBF24", label: "Voice & Video" },
    ],
    staticTitle: "Secure communication,",
    slides: [
      {
        description:
          "Stay connected with the people and teams you trust through encrypted messaging.",
        gradient: "linear-gradient(90deg, #818CF8, #C084FC, #38BDF8)",
        title: "for everyone.",
      },
      {
        description: "HD voice rooms and group calls stay smooth across every device.",
        gradient: "linear-gradient(90deg, #34D399, #06B6D4, #818CF8)",
        title: "for voice.",
      },
      {
        description: "Video calls and screen sharing keep every meeting clear and productive.",
        gradient: "linear-gradient(90deg, #60A5FA, #818CF8, #C084FC)",
        title: "for video calls.",
      },
      {
        description:
          "Low-latency voice, organized channels, and instant coordination for game communities.",
        gradient: "linear-gradient(90deg, #F472B6, #C084FC, #818CF8)",
        title: "for gamers.",
      },
      {
        description: "Project channels, file sharing, and focused workflows for modern teams.",
        gradient: "linear-gradient(90deg, #60A5FA, #34D399, #06B6D4)",
        title: "for teams.",
      },
      {
        description:
          "Share photos, videos, and documents securely in seconds, then find them fast.",
        gradient: "linear-gradient(90deg, #FBBF24, #F97316, #F472B6)",
        title: "for files.",
      },
      {
        description: "AES-256 and zero-knowledge principles keep your data protected.",
        gradient: "linear-gradient(90deg, #34D399, #06B6D4, #818CF8)",
        title: "with confidence.",
      },
    ],
  },
  tr: {
    chips: [
      { color: "#34D399", label: "Uçtan Uca Şifreleme" },
      { color: "#818CF8", label: "Gerçek Zamanlı" },
      { color: "#F472B6", label: "Topluluk Odaları" },
      { color: "#38BDF8", label: "Dosya & Ekran" },
      { color: "#FBBF24", label: "Sesli & Görüntülü" },
    ],
    staticTitle: "Güvenli iletişim,",
    slides: [
      {
        description:
          "Uçtan uca şifreli mesajlaşma ile sevdiklerinle ve ekibinle güvenle bağlantıda kal.",
        gradient: "linear-gradient(90deg, #818CF8, #C084FC, #38BDF8)",
        title: "herkes için.",
      },
      {
        description:
          "HD sesli görüşme ve çok katılımcılı konferanslar her cihazda kesintisiz çalışır.",
        gradient: "linear-gradient(90deg, #34D399, #06B6D4, #818CF8)",
        title: "sesli iletişimde.",
      },
      {
        description:
          "Video arama ve ekran paylaşımı ile toplantılar daha net, hızlı ve verimli ilerler.",
        gradient: "linear-gradient(90deg, #60A5FA, #818CF8, #C084FC)",
        title: "görüntülü aramada.",
      },
      {
        description:
          "Oyun toplulukları için düşük gecikmeli ses, kanal düzeni ve anlık koordinasyon.",
        gradient: "linear-gradient(90deg, #F472B6, #C084FC, #818CF8)",
        title: "oyun dünyasında.",
      },
      {
        description: "Kurumsal ekipler için proje kanalları, dosya paylaşımı ve düzenli iş akışı.",
        gradient: "linear-gradient(90deg, #60A5FA, #34D399, #06B6D4)",
        title: "kurumsal ekiplerde.",
      },
      {
        description: "Fotoğraf, video ve dokümanları saniyeler içinde güvenle paylaş, kolayca bul.",
        gradient: "linear-gradient(90deg, #FBBF24, #F97316, #F472B6)",
        title: "dosya paylaşımında.",
      },
      {
        description: "AES-256 ve zero-knowledge yaklaşımıyla verileriniz her zaman koruma altında.",
        gradient: "linear-gradient(90deg, #34D399, #06B6D4, #818CF8)",
        title: "güvende.",
      },
    ],
  },
};

export function HeroHeading() {
  const { locale } = useI18n();
  const copy = HERO_COPY[locale];
  const index = useRotatingText(copy.slides.length, 4200);
  const slide = copy.slides[index] ?? copy.slides[0]!;

  return (
    <section className="modern-login-hero-copy" aria-label="Whispr">
      <h1>
        <span className="modern-login-static-title">{copy.staticTitle}</span>
        <span className="modern-login-rotating-line">
          <AnimatePresence mode="wait">
            <motion.span
              animate={{ opacity: 1, y: 0 }}
              className="modern-login-gradient-line"
              exit={{ opacity: 0, y: 10 }}
              initial={{ opacity: 0, y: 10 }}
              key={slide.title}
              style={{ backgroundImage: slide.gradient }}
              transition={{ duration: 0.48, ease: "easeOut" }}
            >
              {slide.title}
            </motion.span>
          </AnimatePresence>
        </span>
      </h1>

      <div className="modern-login-subtitle-frame" aria-live="polite">
        <AnimatePresence mode="wait">
          <motion.p
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            key={slide.description}
            transition={{ duration: 0.48, ease: "easeOut" }}
          >
            {slide.description}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="modern-login-feature-chips">
        {copy.chips.map((chip) => (
          <span className="modern-login-feature-chip" key={chip.label}>
            <span style={{ backgroundColor: chip.color }} />
            {chip.label}
          </span>
        ))}
      </div>
    </section>
  );
}
