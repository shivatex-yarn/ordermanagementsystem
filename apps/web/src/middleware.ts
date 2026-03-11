import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login", "/api/auth/login", "/api/auth/register", "/api/health"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/") && !pathname.includes("/auth/")) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/orders") || pathname.startsWith("/divisions") || pathname.startsWith("/audit") || pathname.startsWith("/sla") || pathname.startsWith("/notifications")) {
    const token = request.cookies.get("oms_token")?.value;
    if (!token) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
