import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => {
    return (
      <input
        className={cn(
          "h-11 w-full rounded-2xl border px-4 text-sm outline-none transition",
          "border-[hsl(var(--border)/0.82)] bg-[hsl(var(--surface-soft)/0.55)] text-[hsl(var(--foreground))]",
          "placeholder:text-[hsl(var(--text-soft))] focus:border-[hsl(var(--ring)/0.55)] focus:bg-[hsl(var(--surface-card)/0.72)] focus:ring-4 focus:ring-[hsl(var(--ring)/0.12)]",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";
