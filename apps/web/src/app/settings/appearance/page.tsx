import { AppearanceSettingsPanel } from "@/components/settings/appearance-settings-panel";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="app-panel rounded-[32px] border p-6">
        <p className="text-app-soft text-xs font-semibold uppercase tracking-[0.24em]">
          User Settings
        </p>
        <h2 className="text-app-foreground mt-3 text-3xl font-semibold">
          Appearance
        </h2>
        <p className="text-app-muted mt-2 max-w-2xl text-sm leading-7">
          Switch between the new simple and advanced theme collections, then
          fine-tune the navigation widths to match how you work.
        </p>
      </div>

      <AppearanceSettingsPanel />
    </div>
  );
}
