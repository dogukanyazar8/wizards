import { Skeleton } from "@/components/ui/skeleton";

export function ServerRailSkeleton() {
  return (
    <div className="flex h-full w-[var(--server-rail-width)] flex-col gap-3 p-2 pt-[max(0.9rem,env(safe-area-inset-top))]">
      <div className="w-full shrink-0 rounded-[28px] border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.5)] p-1.5">
        <div className="flex h-[3.25rem] items-center gap-1.5 rounded-[20px] px-1.5">
          <Skeleton className="h-9 w-9 rounded-[16px]" />
          <Skeleton className="h-3 w-8 rounded-full" />
        </div>
      </div>
      <div className="flex min-h-0 w-full flex-1 flex-col gap-2 rounded-[30px] border border-[hsl(var(--border)/0.54)] bg-[hsl(var(--surface-card)/0.42)] p-1.5">
        <div className="mb-1 flex items-center justify-between px-1">
          <Skeleton className="h-2.5 w-12 rounded-full" />
          <Skeleton className="h-4 w-6 rounded-full" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="flex h-[3.25rem] items-center gap-1.5 rounded-[20px] px-1.5" key={index}>
            <Skeleton className="h-9 w-9 rounded-[16px]" />
            <Skeleton className="h-3 w-8 rounded-full" />
          </div>
        ))}
        <div className="mt-1 flex h-[3.25rem] items-center gap-1.5 rounded-[20px] px-1.5">
          <Skeleton className="h-9 w-9 rounded-[16px]" />
          <Skeleton className="h-3 w-8 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function ChannelSidebarSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <Skeleton className="h-14 rounded-2xl" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, groupIndex) => (
          <div className="space-y-2" key={groupIndex}>
            <Skeleton className="h-4 w-24 rounded-full" />
            {Array.from({ length: 3 }).map((__, itemIndex) => (
              <Skeleton className="h-10 rounded-2xl" key={itemIndex} />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    </div>
  );
}
