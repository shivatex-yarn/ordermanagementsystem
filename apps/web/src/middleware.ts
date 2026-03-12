import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/register", "/api/health"];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "default-secret-change-in-production-min-32"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/") && !pathname.includes("/auth/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/orders") || pathname.startsWith("/divisions") || pathname.startsWith("/audit") || pathname.startsWith("/sla") || pathname.startsWith("/notifications") || pathname.startsWith("/admin")) {
    const token = request.cookies.get("oms_token")?.value;
    if (!token) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    // Only SUPER_ADMIN can access /admin pages (user side can access dashboard, orders, etc.)
    if (pathname.startsWith("/admin")) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const role = (payload as { role?: string }).role;
        if (role !== "SUPER_ADMIN") {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } catch {
        const url = new URL("/login", request.url);
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
