import React from "react";

export default function MainLoading() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-[hsl(var(--surface-base))]"
      data-testid="main-route-loading"
    />
  );
}
