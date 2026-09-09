"use client";

import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { AvAudioTab } from "@/components/settings/sections/av/audio-tab";

/**
 * Ses odasındaki dişlinin açtığı hızlı ayar penceresi.
 *
 * K13 ile `VoicePreferencesPanel` silindi; bu modal artık Ayarlar penceresinin **aynı** `Ses`
 * sekmesini çiziyor. İkinci bir ses ayarı yüzeyi tutmak, iki yerde ayrışan iki liste demekti —
 * kullanıcı odadan mikrofonunu değiştirdiğinde Ayarlar penceresi eski cihazı gösterirdi.
 */
export function VoiceSettingsModal({ onClose, open }: { onClose: () => void; open: boolean }) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-h-[calc(100dvh-1rem)] max-w-3xl overflow-y-auto"
      description={t("voice.settings.description")}
      onClose={onClose}
      open={open}
      title={t("voice.settings.title")}
    >
      <div data-testid="voice-settings-modal">
        <AvAudioTab />
      </div>
    </Modal>
  );
}
