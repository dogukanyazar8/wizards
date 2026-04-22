import { Hash, Volume2 } from "lucide-react";
import type { WorkspaceChannel } from "@wizards/types";

type MainChannelPanelProps = {
  categoryName?: string | null;
  channel?: WorkspaceChannel | null;
  fallbackTitle: string;
  leading?: React.ReactNode;
};

export function MainChannelPanel({
  categoryName,
  channel,
  fallbackTitle,
  leading,
}: MainChannelPanelProps) {
  const Icon = channel?.type === "VOICE" ? Volume2 : Hash;
  const title = channel ? `#${channel.name}` : fallbackTitle;

  return (
    <section className="app-main-gradient flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border)/0.78)] px-4 py-3 md:px-6">
        {leading}
        <div className="flex min-w-0 items-center gap-3">
          <div className="app-panel-soft text-app-foreground flex h-10 w-10 items-center justify-center rounded-2xl border">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-app-foreground truncate text-sm font-semibold md:text-base">{title}</h1>
            <p className="text-app-muted truncate text-xs">
              {categoryName ? `${categoryName} / ${channel?.type ?? "TEXT"}` : "Private workspace"}
            </p>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-xl text-center">
          <div className="app-panel-soft text-app-foreground mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] border shadow-2xl shadow-black/10">
            <Icon className="h-8 w-8" />
          </div>
          <h2 className="text-app-foreground mt-6 text-3xl font-semibold tracking-tight">
            {channel ? `Welcome to #${channel.name}` : fallbackTitle}
          </h2>
          <p className="text-app-muted mt-3 text-sm leading-7">
            This channel shell is ready for messages. Server management, channel organization, invites,
            and settings are all live, so the next step is dropping in the real conversation surface.
          </p>
        </div>
      </div>
    </section>
  );
}
