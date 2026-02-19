import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { clearAdminSession, requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage("/dashboard");

  async function logoutAction() {
    "use server";
    await clearAdminSession();
    redirect("/login");
  }

  return <DashboardShell logoutAction={logoutAction}>{children}</DashboardShell>;
}
