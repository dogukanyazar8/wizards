import { AdminVoice } from "@/components/admin/sections/admin-voice";
import { requireAdminModule } from "@/lib/admin/module-access";
import { loadAdminVoiceSnapshot } from "@/lib/admin/snapshots/voice";

export default async function AdminVoicePage() {
  const now = new Date();
  const [, snapshot] = await Promise.all([
    requireAdminModule("dashboard.read"),
    loadAdminVoiceSnapshot({ days: 1, now }),
  ]);

  return <AdminVoice snapshot={snapshot} />;
}
