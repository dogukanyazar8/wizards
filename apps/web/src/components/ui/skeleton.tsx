// The default import is what the node test runner's classic JSX transform resolves this
// component's elements against; Next's compiler does not need it.
import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
  /**
   * Ana Sayfa iskeletleri yüksekliklerini `HOME_METRICS`'ten alır (rem, ölçekle büyür); arbitrary
   * px sınıfı o yüzeyde yasak (Faz 0 lint kuralı).
   */
  style?: CSSProperties;
};

export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      style={style}
      className={cn(
        "animate-pulse rounded-2xl bg-[linear-gradient(90deg,hsl(var(--surface-soft)/0.32),hsl(var(--surface-card)/0.72),hsl(var(--surface-soft)/0.32))]",
        className,
      )}
    />
  );
}
