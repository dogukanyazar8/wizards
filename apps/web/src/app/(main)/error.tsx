"use client";

import { useEffect } from "react";

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-app-background">
      <div className="text-center space-y-4">
        <p className="text-app-foreground text-sm font-semibold">Something went wrong</p>
        <p className="text-app-muted text-xs max-w-xs">{error.message || "An unexpected error occurred."}</p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-[hsl(var(--primary))] text-white text-sm font-medium hover:bg-[hsl(var(--primary)/0.9)] transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
