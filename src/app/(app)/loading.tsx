import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="loading-delayed" aria-busy="true">
      <div className="grid gap-2 pb-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-64" />
      </div>
      <div className="card">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-3.5 last:border-0">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="ms-auto h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
