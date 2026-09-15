"use client";

import React from "react";

import { DesktopTabBody, useDesktopTabDef } from "./desktop-tab-body";

/** Native shortcut enablement and individual key assignments. */
export function DesktopShortcutsTab() {
  const tab = useDesktopTabDef("shortcuts");

  if (!tab) return null;

  return <DesktopTabBody tab={tab} />;
}
