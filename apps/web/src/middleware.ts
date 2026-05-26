import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/register", "/api/health"];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "default-secret-change-in-production-min-32"
);

/**
 * Middleware — route protection and role-based redirects.
 *
 * Performance note: jwtVerify is called AT MOST ONCE per request (Edge runtime,
 * no DB access). The previous version called it up to 4 times for /admin, /md,
 * /sla, and /divisions paths because each if-block re-verified independently.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Public paths — no auth required.
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }

  // 2. API routes (except /api/auth/*) are guarded by individual handlers; skip here.
  if (pathname.startsWith("/api/") && !pathname.includes("/auth/")) {
    return NextResponse.next();
  }

  // 3. Protected pages.
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/divisions") ||
    pathname.startsWith("/audit") ||
    pathname.startsWith("/sla") ||
    pathname.startsWith("/notifications") ||
    pathname.startsWith("/md") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/accounts");

  if (!isProtected) return NextResponse.next();

  // 4. Token present?
  const token = request.cookies.get("oms_token")?.value;
  if (!token) {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  // 5. Single JWT verification — extract role once, use everywhere below.
  let role: string | undefined;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    role = (payload as { role?: string }).role;
  } catch {
    const url = new URL("/login", request.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const isSuperOrMD = role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR";

  // 6. Admin / MD / SLA sections — executives only.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/md") ||
    pathname === "/sla" ||
    pathname.startsWith("/sla/")
  ) {
    if (!isSuperOrMD) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 7. MD role redirects — send MD away from generic pages to their own dashboard.
  if (role === "MANAGING_DIRECTOR") {
    if (pathname === "/dashboard" || pathname === "/orders") {
      return NextResponse.redirect(new URL("/md", request.url));
    }
  }

  // 8. Accounts role redirect.
  if (role === "ACCOUNTS" && pathname === "/dashboard") {
    return NextResponse.redirect(new URL("/accounts", request.url));
  }

  // 9. /accounts page — ACCOUNTS + executives only.
  if (pathname === "/accounts" || pathname.startsWith("/accounts/")) {
    if (role !== "ACCOUNTS" && !isSuperOrMD) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // 10. /divisions — redirect executives to /admin/divisions; everyone else to dashboard.
  if (pathname === "/divisions" || pathname.startsWith("/divisions/")) {
    if (isSuperOrMD) {
      return NextResponse.redirect(new URL("/admin/divisions", request.url));
    }
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
