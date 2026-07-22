import { Badge } from "@wizards/ui";

export function Tones() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge>Online</Badge>
      <Badge tone="muted">Idle</Badge>
      <Badge tone="danger">Do not disturb</Badge>
    </div>
  );
}

export function InContext() {
  return (
    <div className="flex max-w-sm items-center gap-3 rounded-2xl border border-[hsl(var(--border)/0.7)] bg-[hsl(var(--card))] p-4">
      <span className="text-sm font-semibold text-[hsl(var(--foreground))]">#announcements</span>
      <Badge>New</Badge>
      <Badge tone="danger">Locked</Badge>
    </div>
  );
}
