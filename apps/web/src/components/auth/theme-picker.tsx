"use client";

import { useTheme } from "next-themes";
import { WIZARDS_THEMES } from "@/lib/appearance";
import { cn } from "@/lib/utils";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  const isDark = theme && !["theme-dawn", "theme-mist"].includes(theme);

  return (
    <div className="absolute top-4 right-4 flex items-center gap-2">
      <span className={cn("text-xs font-medium", isDark ? "text-white/40" : "text-black/40")}>
        Theme
      </span>
      <div className="flex gap-1">
        {WIZARDS_THEMES.map((t) => (
          <button
            key={t.id}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition",
              theme === t.id
                ? isDark
                  ? "border-white/80"
                  : "border-black/50"
                : "border-transparent hover:border-white/40",
            )}
            style={{
              background: `linear-gradient(135deg, ${t.preview[0]}, ${t.preview[1]}, ${t.preview[2]})`,
              borderColor: theme === t.id && isDark ? "rgba(255,255,255,0.8)" : theme === t.id && !isDark ? "rgba(0,0,0,0.5)" : undefined,
            }}
            onClick={() => setTheme(t.id)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
