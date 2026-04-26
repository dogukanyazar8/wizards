import { AppearanceSettingsPanel } from "@/components/settings/appearance-settings-panel";
import { auth } from "@/auth";
import { getServerTranslator } from "@/lib/locale/server";

export default async function AppearanceSettingsPage() {
  const session = await auth();
  const { t } = await getServerTranslator(session?.user?.locale);

  return (
    <div className="space-y-6">
      <div className="app-panel rounded-[32px] border p-6">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
          {t("appearance.page.badge")}
        </p>
        <h2 className="text-app-foreground mt-3 text-3xl font-semibold">
          {t("appearance.page.title")}
        </h2>
        <p className="text-app-muted mt-2 max-w-2xl text-sm leading-7">
          {t("appearance.page.description")}
        </p>
      </div>

      <AppearanceSettingsPanel />
    </div>
  );
}
