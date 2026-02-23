import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { clearSession, requireAuthenticatedPage } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuthenticatedPage("/dashboard");

  async function logoutAction() {
    "use server";
    await clearSession();
    redirect("/login");
  }

  return (
    <DashboardShell logoutAction={logoutAction} role={user.role} displayName={user.display_name}>
      {children}
    </DashboardShell>
  );
}
