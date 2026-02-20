"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarClock, FolderSearch2, LayoutDashboard, Settings2, Sheet, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/today", label: "Today Queue", icon: CalendarClock },
  { href: "/dashboard/prospecting", label: "Prospecting", icon: FolderSearch2 },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/campaigns", label: "Campaigns", icon: Target },
  { href: "/dashboard/templates", label: "Templates", icon: Sheet },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

export function DashboardNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav className={cn("space-y-1", mobile ? "" : "")}>
      {navItems.map((item) => {
        const active = isActive(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            onClick={mobile ? () => window.dispatchEvent(new CustomEvent("jala-mobile-nav-close")) : undefined}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow]",
              active
                ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20"
                : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800",
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
