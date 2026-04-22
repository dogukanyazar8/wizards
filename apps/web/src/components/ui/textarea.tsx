import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full rounded-2xl border px-4 py-3 text-sm outline-none transition",
        "border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] text-[hsl(var(--foreground))]",
        "placeholder:text-[hsl(var(--text-soft))] focus:border-[hsl(var(--ring)/0.55)] focus:bg-[hsl(var(--surface-card)/0.72)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

Textarea.displayName = "Textarea";
