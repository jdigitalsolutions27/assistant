import Image from "next/image";
import { redirect } from "next/navigation";
import { createUserSession, getDashboardPathForUser, getSessionUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createUserAccount, getUserByUsernameWithPassword, hasAnyUsers } from "@/lib/services/data-service";

async function ensureBootstrapAdminIfMissing() {
  const hasUsers = await hasAnyUsers();
  if (hasUsers) return;
  if (!env.ADMIN_PASSWORD) return;

  const password_hash = await hashPassword(env.ADMIN_PASSWORD);
  try {
    await createUserAccount({
      username: "admin",
      display_name: "Administrator",
      password_hash,
      role: "ADMIN",
      is_active: true,
      must_change_password: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.toLowerCase().includes("duplicate")) {
      throw error;
    }
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  const error = typeof params.error === "string" ? params.error : null;

  const sessionUser = await getSessionUser();
  if (sessionUser) {
    if (sessionUser.role === "AGENT") {
      redirect("/dashboard/prospecting");
    }
    redirect(next);
  }

  async function loginAction(formData: FormData) {
    "use server";
    await ensureBootstrapAdminIfMissing();
    const username = String(formData.get("username") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const nextPath = String(formData.get("next") ?? "/dashboard");
    const user = await getUserByUsernameWithPassword(username);
    if (!user || !user.is_active) {
      redirect("/login?error=invalid");
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      redirect("/login?error=invalid");
    }

    await createUserSession(user.id);
    if (user.role === "AGENT") {
      redirect("/dashboard/prospecting");
    }
    redirect(nextPath || getDashboardPathForUser(user));
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-4">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-1 flex items-center gap-3">
            <Image src="/LOGOOOO.png" alt="J-Digital logo" width={40} height={40} className="rounded-md object-contain" priority />
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">J-Digital Solutions</p>
          </div>
          <CardTitle className="text-2xl">Client Finder Login</CardTitle>
          <CardDescription>
            Secure internal access only. Messaging remains manual inside Meta tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input id="username" type="text" name="username" required autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" name="password" required autoComplete="current-password" />
            </div>
            {error ? (
              <p className="text-sm text-red-600">
                Invalid username or password.
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
