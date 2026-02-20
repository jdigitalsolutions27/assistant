"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a minimal client-side breadcrumb without exposing secrets.
    console.error("Dashboard render error:", error.message);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
      <h2 className="text-xl font-semibold">Dashboard Error</h2>
      <p className="text-sm">Something went wrong while loading this page. You can retry safely.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          Try Again
        </Button>
        <Button type="button" variant="outline" onClick={() => window.location.assign("/dashboard")}>
          Back To Dashboard
        </Button>
      </div>
    </div>
  );
}

