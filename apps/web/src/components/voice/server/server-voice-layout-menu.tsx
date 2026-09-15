"use client";

import { useId, useState } from "react";
import { SettingSelect } from "@/components/settings/rows/setting-select";
import { useI18n } from "@/components/providers/locale-provider";
import { DISPLAY_FONT } from "@/components/servers/shared/typography";
import { useVoiceLayout } from "@/lib/servers/voice-layout-store";
import type { VoiceLayout } from "@/lib/servers/voice-layout";

const MODES: VoiceLayout[] = ["fit", "compact", "speaker"];
export function ServerVoiceLayoutMenu({ sharing = false }: { sharing?: boolean }) {
  const { t } = useI18n();
  const labelId = useId();
  const [open, setOpen] = useState(false);
  const layout = useVoiceLayout((state) => state.layout);
  const setLayout = useVoiceLayout((state) => state.setLayout);
  return (
    <div
      className="w-28 shrink-0 md:w-auto"
      style={{ fontFamily: DISPLAY_FONT }}
      title={t(sharing ? "server.voice.layout.duringShare" : "server.voice.layout.label")}
    >
      <span id={labelId} className="sr-only">
        {t("server.voice.layout.label")}
      </span>
      <SettingSelect
        labelledById={labelId}
        disabled={sharing}
        open={open}
        onOpenChange={setOpen}
        options={MODES.map((mode) => ({ label: t(`server.voice.layout.${mode}`) }))}
        value={MODES.indexOf(layout)}
        onChange={(index) => {
          const mode = MODES[index];
          if (mode) setLayout(mode);
        }}
        testId="server-voice-layout"
        width={156}
      />
    </div>
  );
}
