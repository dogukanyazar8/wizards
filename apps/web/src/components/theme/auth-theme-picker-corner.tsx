"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/locale/language-switcher";
import { ThemePicker } from "@/components/theme/theme-picker";

const AUTH_THEME_ROUTES = new Set(["/login", "/register"]);

export function AuthThemePickerCorner() {
  const pathname = usePathname();

  if (!AUTH_THEME_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <div className="absolute right-4 top-4 z-30 lg:right-8 lg:top-8">
      <div className="flex items-start gap-3">
        <LanguageSwitcher />
        <ThemePicker variant="compact" />
      </div>
    </div>
  );
}
