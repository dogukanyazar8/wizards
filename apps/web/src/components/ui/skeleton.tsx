import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-2xl bg-[linear-gradient(90deg,hsl(var(--surface-soft)/0.32),hsl(var(--surface-card)/0.72),hsl(var(--surface-soft)/0.32))]",
        className,
      )}
    />
  );
}
