"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderSearch2, LayoutDashboard, Settings2, Sheet, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/prospecting", label: "Prospecting", icon: FolderSearch2 },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/templates", label: "Templates", icon: Sheet },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100",
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
