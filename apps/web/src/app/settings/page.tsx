import { redirect } from "next/navigation";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { getCurrentUser, requireAuth } from "@/lib/auth/utils";
import { getSettingsBootstrapPayload } from "@/lib/settings/bootstrap";

export default async function SettingsPage() {
  const session = await requireAuth();
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const settingsBootstrap = await getSettingsBootstrapPayload({
    locale: session.user.locale,
    user,
  });

  return <SettingsPanel {...settingsBootstrap} />;
}
