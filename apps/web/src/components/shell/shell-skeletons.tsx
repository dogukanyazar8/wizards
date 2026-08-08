import { Skeleton } from "@/components/ui/skeleton";

export function ServerRailSkeleton() {
  return (
    <div className="flex h-full w-[var(--server-rail-width)] flex-col items-center gap-2 px-2 pt-[max(0.625rem,env(safe-area-inset-top))]">
      <div className="flex h-11 w-11 items-center justify-center rounded-[18px]">
        <Skeleton className="h-9 w-9 rounded-[16px]" />
      </div>
      <div className="h-px w-7 rounded-full bg-[hsl(var(--border)/0.5)]" />
      <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px]" key={index}>
            <Skeleton className="h-9 w-9 rounded-[16px]" />
          </div>
        ))}
        <div className="mt-1 flex h-11 w-11 items-center justify-center rounded-[18px]">
          <Skeleton className="h-9 w-9 rounded-[16px]" />
        </div>
      </div>
    </div>
  );
}

export function ServerProfileCardSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-[420px] space-y-4 p-4"
      data-testid="server-profile-skeleton"
    >
      <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.6)]">
        <Skeleton className="h-24 w-full rounded-none" />
        <div className="-mt-6 space-y-3 p-4">
          <Skeleton className="h-14 w-14 rounded-[18px] border-4 border-[hsl(var(--surface-card))]" />
          <Skeleton className="h-5 w-40 rounded-full" />
          <Skeleton className="h-3.5 w-56 rounded-full" />
          <Skeleton className="h-10 w-full rounded-2xl" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-[24px]" />
      <Skeleton className="h-14 w-full rounded-[20px]" />
      <Skeleton className="h-14 w-full rounded-2xl" />
    </div>
  );
}

export function ServerDiscoveryGridSkeleton() {
  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="server-discovery-grid-skeleton"
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          className="overflow-hidden rounded-[24px] border border-[hsl(var(--border)/0.6)]"
          key={index}
        >
          <Skeleton className="h-20 w-full rounded-none" />
          <div className="-mt-6 space-y-3 p-4">
            <Skeleton className="h-12 w-12 rounded-[16px] border-4 border-[hsl(var(--surface-card))]" />
            <Skeleton className="h-4 w-3/4 rounded-full" />
            <Skeleton className="h-3 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
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
