import { Panel, Skeleton } from "@/components/ui/primitives";

/**
 * The dashboard's loading state.
 *
 * Sized to match the real layout so nothing jumps when the data arrives — a
 * skeleton that shifts the page on resolve is worse than showing nothing.
 * This is what ships in the prerendered HTML.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading weather">
      <div className="-mx-4 border-y border-hairline bg-panel lg:-mx-6">
        <Skeleton className="h-[104px] rounded-none lg:h-[148px]" />
        <div className="border-t border-hairline px-4 py-1.5 lg:px-6">
          <Skeleton className="h-4 w-56" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-5">
          <Panel className="flex flex-col gap-5 p-5">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-20 w-40" />
            <Skeleton className="h-1 w-full" />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="flex flex-col gap-2">
                  <Skeleton className="h-2.5 w-14" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-40" />
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </Panel>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-7">
          <Panel className="flex flex-col gap-3 p-5">
            <Skeleton className="h-4 w-28" />
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <Skeleton key={index} className="h-7 w-full" />
            ))}
          </Panel>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Panel key={index} className="flex flex-col gap-4 p-5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-28 w-full" />
              </Panel>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
