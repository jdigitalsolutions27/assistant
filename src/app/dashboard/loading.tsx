export default function DashboardLoading() {
  return (
    <div className="space-y-4">
      <div className="h-7 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="h-4 w-80 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" />
        ))}
      </div>
    </div>
  );
}
