import Link from "next/link";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getBreakdowns,
  getCampaigns,
  getDashboardKpis,
  getPriorityLeads,
  getRecommendedMessageStrategiesByCategory,
  listFollowUpCandidates,
} from "@/lib/services/data-service";
import { toPercent } from "@/lib/utils";

export default async function DashboardPage() {
  const [kpis, breakdowns, campaigns, priority, followUpDue, strategyRecommendations] = await Promise.all([
    getDashboardKpis(),
    getBreakdowns(),
    getCampaigns({ status: "ACTIVE" }),
    getPriorityLeads({ limit: 5 }),
    listFollowUpCandidates({ daysSinceSent: 3, limit: 120 }),
    getRecommendedMessageStrategiesByCategory(),
  ]);
  const topCategories = Object.entries(breakdowns.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">Lead system performance and outreach pipeline health.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/today" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Today Queue
          </Link>
          <Link href="/dashboard/prospecting" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Start Prospecting
          </Link>
          <Link href="/dashboard/leads" className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
            Manage Leads
          </Link>
          <Link href="/dashboard/campaigns" className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            Open Campaigns
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
                <li key={name} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                  <span className="text-sm text-slate-700 dark:text-slate-200">{name}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Campaign Health</CardTitle>
            <CardDescription>Current active campaigns and today&apos;s priority queue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700 dark:text-slate-200">
            <p>Active campaigns: {campaigns.length}</p>
            <p>Follow-up due (3+ days): {followUpDue.length}</p>
            <div>
              <p className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Top Priority Leads</p>
              <ul className="space-y-2">
                {priority.map((item) => (
                  <li key={item.lead.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                    <span className="max-w-[70%] truncate">{item.lead.business_name ?? "Unnamed"}</span>
                    <span className="text-xs font-semibold text-blue-700 dark:text-sky-300">Priority {item.priority_score}</span>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/dashboard/campaigns" className="inline-block text-sm text-blue-700 hover:underline dark:text-sky-300">
              Open campaigns to run follow-up draft generation
            </Link>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Best Message Strategy Right Now</CardTitle>
          <CardDescription>Auto-recommended combination by category from real sent/reply/win outcomes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {strategyRecommendations.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">Not enough sent/reply data yet.</p>
          ) : (
            strategyRecommendations.slice(0, 6).map((item) => (
              <div key={`${item.category}-${item.language}-${item.tone}-${item.angle}-${item.variant}`} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {item.category}: {item.language} / {item.tone} / {item.angle} / Variant {item.variant}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Reply {(item.reply_rate * 100).toFixed(1)}% | Win {(item.win_rate * 100).toFixed(1)}% | Sent {item.sent}
                </p>
              </div>
            ))
          )}
        </CardContent>
        </Card>
    </div>
  );
}
