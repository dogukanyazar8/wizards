"use client";

import { useEffect, useState } from "react";

export function useRotatingText(length: number, intervalMs: number) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1) {
      return undefined;
    }

    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setIndex((currentIndex) => (currentIndex + 1) % length);
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [intervalMs, length]);

  return index;
}
