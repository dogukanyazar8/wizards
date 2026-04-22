import { cn } from "@/lib/utils";

type BadgeProps = {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "danger" | "muted";
};

export function Badge({ children, className, tone = "default" }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]",
        tone === "default" && "border-sky-500/20 bg-sky-500/10 text-sky-200",
        tone === "danger" && "border-rose-500/20 bg-rose-500/10 text-rose-200",
        tone === "muted" && "border-[hsl(var(--border)/0.75)] bg-[hsl(var(--surface-soft)/0.58)] text-[hsl(var(--foreground))]",
        className,
      )}
    >
      {children}
    </span>
  );
}
