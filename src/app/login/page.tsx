import { redirect } from "next/navigation";
import { createAdminSession, isAuthenticated } from "@/lib/auth";
import { env } from "@/lib/env";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  const error = typeof params.error === "string" ? params.error : null;

  if (await isAuthenticated()) {
    redirect(next);
  }

  async function loginAction(formData: FormData) {
    "use server";
    const password = String(formData.get("password") ?? "");
    const nextPath = String(formData.get("next") ?? "/dashboard");

    if (!env.ADMIN_PASSWORD) {
      redirect("/login?error=config");
    }

    if (password !== env.ADMIN_PASSWORD) {
      redirect("/login?error=invalid");
    }

    await createAdminSession();
    redirect(nextPath);
  }

  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">J-Digital Solutions</p>
          <CardTitle className="text-2xl">JALA Admin Login</CardTitle>
          <CardDescription>
            Secure internal access only. Messaging remains manual inside Meta tools.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="next" value={next} />
            <div className="space-y-2">
              <Label htmlFor="password">Admin Password</Label>
              <Input id="password" type="password" name="password" required />
            </div>
            {error ? (
              <p className="text-sm text-red-600">
                {error === "config" ? "ADMIN_PASSWORD is not configured." : "Invalid password."}
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
