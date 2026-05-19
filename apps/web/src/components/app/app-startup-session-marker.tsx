"use client";

import { useEffect } from "react";
import { markShellStartupSplashSeen } from "@/lib/app-startup/session";

export function AppStartupSessionMarker() {
  useEffect(() => {
    markShellStartupSplashSeen();
  }, []);

  return null;
}
