import { KpiCard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getBestVariantByCategory, getBreakdowns, getDashboardKpis } from "@/lib/services/data-service";
import { toPercent } from "@/lib/utils";

export default async function AnalyticsPage() {
  const [kpis, breakdowns, bestVariants] = await Promise.all([
    getDashboardKpis(),
    getBreakdowns(),
    getBestVariantByCategory(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Analytics & Optimization</h1>
        <p className="text-sm text-slate-600">Performance by pipeline stage, market segment, and message variants.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Leads" value={kpis.totalLeads} />
        <KpiCard title="Sent" value={kpis.sent} />
        <KpiCard title="Replies" value={kpis.replies} sub={`${toPercent(kpis.replyRate)}% reply rate`} />
        <KpiCard title="Won" value={kpis.won} sub={`${toPercent(kpis.winRate)}% win rate`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {Object.entries(breakdowns.byCategory).map(([key, value]) => (
                <li key={key} className="flex justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>{key}</span>
                  <span className="font-semibold">{value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Breakdown by Location</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {Object.entries(breakdowns.byLocation).map(([key, value]) => (
                <li key={key} className="flex justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                  <span>{key}</span>
                  <span className="font-semibold">{value}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Message Angles & Languages</CardTitle>
            <CardDescription>A/B/C rollout split by angle and language.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Angles</h3>
              <ul className="space-y-2">
                {Object.entries(breakdowns.byAngle).map(([key, value]) => (
                  <li key={key} className="flex justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                    <span>{key}</span>
                    <span>{value}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Languages</h3>
              <ul className="space-y-2">
                {Object.entries(breakdowns.byLanguage).map(([key, value]) => (
                  <li key={key} className="flex justify-between rounded border border-slate-200 px-3 py-2 text-sm">
                    <span>{key}</span>
                    <span>{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Best Performing Variant by Category</CardTitle>
            <CardDescription>Recommendation based on observed won/sent ratio.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Best Variant</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Won</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bestVariants.map((item) => (
                  <TableRow key={item.category}>
                    <TableCell>{item.category}</TableCell>
                    <TableCell>{item.bestVariant}</TableCell>
                    <TableCell>{item.sent}</TableCell>
                    <TableCell>{item.won}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
