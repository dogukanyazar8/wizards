"use client";

import { useEffect } from "react";

/** Text controls match :focus-visible even after a click. Track navigation separately. */
export function FocusModalitySync() {
  useEffect(() => {
    const root = document.documentElement;
    const setModality = (value: "pointer" | "keyboard") => {
      if (root.dataset.focusModality !== value) root.dataset.focusModality = value;
    };
    const onPointerDown = () => setModality("pointer");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || ["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
      const target = event.target;
      const editingText =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLInputElement &&
            !["button", "submit", "reset", "checkbox", "radio", "range", "file", "color"].includes(
              target.type,
            )));
      // Typing or moving the caret after a click must not bring the outer ring back.
      if (editingText && !["Tab", "Escape", "F6"].includes(event.key)) return;
      setModality("keyboard");
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      delete root.dataset.focusModality;
    };
  }, []);
  return null;
}
