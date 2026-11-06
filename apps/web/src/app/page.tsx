import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { defaultLandingPath } from "@/lib/roles";

export default async function Home() {
  const session = await getSession();
  redirect(session ? defaultLandingPath(session.role) : "/login");
}
