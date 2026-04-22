import { Skeleton } from "@/components/ui/skeleton";

export function ServerRailSkeleton() {
  return (
    <div className="flex w-[var(--server-rail-width)] flex-col items-center gap-3 p-3">
      <Skeleton className="h-12 w-12 rounded-[18px]" />
      <Skeleton className="h-px w-8 rounded-full" />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton className="h-12 w-12 rounded-[22px]" key={index} />
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
