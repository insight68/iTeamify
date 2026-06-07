import { Skeleton } from "@teamify/ui/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-1 flex-col min-h-0 p-6">
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-7 w-24" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-sm" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1 max-w-[300px]" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
