import { redirect } from "next/navigation";
import { getDashboardPathForUser, getSessionUser } from "@/lib/auth";

export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(getDashboardPathForUser(user));
  redirect("/login");
}
