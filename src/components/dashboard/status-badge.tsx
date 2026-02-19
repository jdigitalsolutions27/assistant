import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/lib/types";

const statusClasses: Record<LeadStatus, string> = {
  NEW: "bg-slate-100 text-slate-800",
  DRAFTED: "bg-indigo-100 text-indigo-800",
  SENT: "bg-blue-100 text-blue-800",
  REPLIED: "bg-emerald-100 text-emerald-800",
  QUALIFIED: "bg-amber-100 text-amber-800",
  WON: "bg-green-100 text-green-800",
  LOST: "bg-rose-100 text-rose-800",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <Badge className={statusClasses[status]}>{status}</Badge>;
}
