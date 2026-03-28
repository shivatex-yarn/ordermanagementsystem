import { NextResponse } from "next/server";
import { withRole } from "@/lib/with-auth";
import { getResendEmailStatus } from "@/lib/email";

export async function GET() {
  const auth = await withRole(["SUPER_ADMIN", "MANAGING_DIRECTOR"]);
  if (auth.response) return auth.response;
  return NextResponse.json(getResendEmailStatus());
}
