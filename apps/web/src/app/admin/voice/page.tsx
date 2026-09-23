import { AdminVoice } from "@/components/admin/sections/admin-voice";
import { requireAdminModule } from "@/lib/admin/module-access";
import { loadAdminVoiceSnapshot } from "@/lib/admin/snapshots/voice";

export default async function AdminVoicePage() {
  const now = new Date();
  await requireAdminModule("dashboard.read");
  const [snapshot] = await Promise.all([loadAdminVoiceSnapshot({ days: 1, now })]);

  return <AdminVoice snapshot={snapshot} />;
}
