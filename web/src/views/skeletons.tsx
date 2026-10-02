// Loading placeholders shaped like the real pages, so nothing jumps when data arrives.
const bar = "animate-pulse rounded-md bg-surface-2";

export function BoardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading the board">
      <div className="space-y-4">
        <div className={`${bar} h-3 w-40`} />
        <div className={`${bar} h-9 w-full max-w-lg`} />
        <div className={`${bar} h-4 w-full max-w-2xl`} />
        <div className={`${bar} h-12 w-full max-w-xl rounded-xl`} />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-surface p-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="grid grid-cols-4 gap-4 py-2">
            {Array.from({ length: 4 }, (_, j) => (
              <div key={j} className={`${bar} h-10`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServiceSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading the service">
      <div className={`${bar} h-4 w-16`} />
      <div className={`${bar} h-9 w-64`} />
      <div className="h-20 animate-pulse rounded-xl border border-line bg-surface" />
      <div className="h-72 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}

export function TestSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true" aria-label="Loading the test">
      <div className={`${bar} h-6 w-full`} />
      <div className={`${bar} h-8 w-56`} />
      <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
