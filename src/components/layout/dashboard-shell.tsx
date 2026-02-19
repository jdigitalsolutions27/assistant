import { DashboardNav } from "@/components/layout/dashboard-nav";

export function DashboardShell({
  children,
  logoutAction,
}: {
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 gap-4 px-4 py-4 md:grid-cols-[240px_1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">J-Digital</p>
            <h2 className="text-lg font-bold text-slate-900">JALA Console</h2>
          </div>
          <DashboardNav />
          <form action={logoutAction} className="mt-8">
            <button
              type="submit"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Logout
            </button>
          </form>
        </aside>

        <main className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">{children}</main>
      </div>
    </div>
  );
}
