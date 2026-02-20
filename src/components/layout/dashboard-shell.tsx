"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { DashboardNav } from "@/components/layout/dashboard-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export function DashboardShell({
  children,
  logoutAction,
}: {
  children: React.ReactNode;
  logoutAction: () => Promise<void>;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    function closeMenu() {
      setMobileMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    window.addEventListener("jala-mobile-nav-close", closeMenu as EventListener);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("jala-mobile-nav-close", closeMenu as EventListener);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-slate-100 transition-colors dark:bg-slate-950">
      <div className={cn("fixed inset-0 z-40 md:hidden", mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none")}>
        <button
          type="button"
          aria-label="Close menu backdrop"
          onClick={() => setMobileMenuOpen(false)}
          className={cn(
            "absolute inset-0 bg-slate-950/60 transition-opacity",
            mobileMenuOpen ? "opacity-100" : "opacity-0",
          )}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-[86%] max-w-[330px] flex-col border-r border-slate-200 bg-white p-4 shadow-xl transition-transform dark:border-slate-800 dark:bg-slate-900",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/LOGOOOO.png" alt="J-Digital logo" width={40} height={40} className="rounded-md object-contain" priority />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">J-Digital</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Client Finder</h2>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <DashboardNav mobile />

          <form action={logoutAction} className="mt-auto pt-5">
            <button
              type="submit"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Logout
            </button>
          </form>
        </aside>
      </div>

      <div className="mx-auto grid min-h-screen max-w-[1400px] grid-cols-1 gap-4 px-3 py-3 sm:px-4 sm:py-4 md:grid-cols-[260px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm transition-colors dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/LOGOOOO.png" alt="J-Digital logo" width={40} height={40} className="rounded-md object-contain" priority />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">J-Digital</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Client Finder</h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle compact className="shrink-0" />
              <button
                type="button"
                aria-label="Open navigation menu"
                onClick={() => setMobileMenuOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Menu className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <aside className="hidden h-fit rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm transition-colors dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 md:sticky md:top-4 md:block md:p-4">
          <div className="mb-6 flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image src="/LOGOOOO.png" alt="J-Digital logo" width={40} height={40} className="rounded-md object-contain" priority />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">J-Digital</p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Client Finder</h2>
              </div>
            </div>
            <ThemeToggle compact className="shrink-0" />
          </div>
          <DashboardNav />
          <form action={logoutAction} className="mt-4 md:mt-8">
            <button
              type="submit"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Logout
            </button>
          </form>
        </aside>

        <main className="rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm transition-colors dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-black/20 sm:p-5">
          {children}
        </main>
      </div>
    </div>
  );
}
