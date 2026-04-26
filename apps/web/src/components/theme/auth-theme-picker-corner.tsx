"use client";

import { usePathname } from "next/navigation";
import { ThemePicker } from "@/components/theme/theme-picker";

const AUTH_THEME_ROUTES = new Set(["/login", "/register"]);

export function AuthThemePickerCorner() {
  const pathname = usePathname();

  if (!AUTH_THEME_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <div className="absolute right-4 top-4 z-30 lg:right-8 lg:top-8">
      <ThemePicker variant="compact" />
    </div>
  );
}
