import Link from "next/link";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBreakdowns, getDashboardKpis } from "@/lib/services/data-service";
import { toPercent } from "@/lib/utils";

export default async function DashboardPage() {
  const [kpis, breakdowns] = await Promise.all([getDashboardKpis(), getBreakdowns()]);
  const topCategories = Object.entries(breakdowns.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-600">Lead system performance and outreach pipeline health.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/prospecting" className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            Start Prospecting
          </Link>
          <Link href="/dashboard/leads" className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
            Manage Leads
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Leads" value={kpis.totalLeads} />
        <KpiCard title="Drafted" value={kpis.drafted} />
        <KpiCard title="Sent" value={kpis.sent} />
        <KpiCard title="Replies" value={kpis.replies} sub={`${toPercent(kpis.replyRate)}% reply rate`} />
        <KpiCard title="Qualified" value={kpis.qualified} />
        <KpiCard title="Won" value={kpis.won} sub={`${toPercent(kpis.winRate)}% win rate`} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Categories</CardTitle>
            <CardDescription>Highest lead volume by business category.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {topCategories.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                  <span className="text-sm text-slate-700">{name}</span>
                  <span className="text-sm font-semibold text-slate-900">{count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compliance Reminder</CardTitle>
            <CardDescription>Human-in-the-loop messaging policy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-700">
            <p>1. JALA does not automate Facebook login, scraping private data, or auto-DM sending.</p>
            <p>2. Use queue actions to open Page URL and copy draft only.</p>
            <p>3. Send messages manually inside Meta Business Suite/Page Inbox.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
