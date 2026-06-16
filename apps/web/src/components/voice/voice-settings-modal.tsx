"use client";

import { Modal } from "@/components/ui/modal";
import { useI18n } from "@/components/providers/locale-provider";
import { VoicePreferencesPanel } from "@/components/voice/voice-preferences-panel";

type VoiceSettingsModalProps = {
  onClose: () => void;
  open: boolean;
};

export function VoiceSettingsModal({ onClose, open }: VoiceSettingsModalProps) {
  const { t } = useI18n();

  return (
    <Modal
      className="max-h-[calc(100dvh-1rem)] max-w-5xl overflow-y-auto"
      description={t("voice.settings.description")}
      onClose={onClose}
      open={open}
      title={t("voice.settings.title")}
    >
      <div data-testid="voice-settings-modal">
        <VoicePreferencesPanel />
      </div>
    </Modal>
  );
}
