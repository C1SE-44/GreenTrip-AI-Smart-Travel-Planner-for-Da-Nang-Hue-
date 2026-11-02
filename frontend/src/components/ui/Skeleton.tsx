interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-xl bg-beige/50 ${className}`} />;
}

export function PoiCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-beige bg-ivory p-3">
      <Skeleton className="h-20 w-20 flex-shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Image-first skeleton matching the two-column recommendation cards. */
export function RecommendationCardSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden="true">
      <Skeleton className="aspect-[1.05/1] w-full rounded-[20px]" />
      <div className="mt-3 space-y-2">
        <Skeleton className="h-4 w-4/5 rounded-md" />
        <Skeleton className="h-3 w-3/5 rounded-md" />
        <Skeleton className="h-3 w-2/5 rounded-md" />
        <Skeleton className="h-9 w-full rounded-full" />
      </div>
    </div>
  );
}
