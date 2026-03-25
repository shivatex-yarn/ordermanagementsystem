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
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/orders") || pathname.startsWith("/divisions") || pathname.startsWith("/audit") || pathname.startsWith("/sla") || pathname.startsWith("/notifications") || pathname.startsWith("/md") || pathname.startsWith("/admin")) {
    const token = request.cookies.get("oms_token")?.value;
    if (!token) {
      const url = new URL("/login", request.url);
      url.searchParams.set("from", pathname);
      return NextResponse.redirect(url);
    }
    // SUPER_ADMIN and MANAGING_DIRECTOR (MD, view-only) can access /admin
    if (pathname.startsWith("/admin")) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const role = (payload as { role?: string }).role;
        if (role !== "SUPER_ADMIN" && role !== "MANAGING_DIRECTOR") {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } catch {
        const url = new URL("/login", request.url);
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
    }
    if (pathname.startsWith("/md")) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const role = (payload as { role?: string }).role;
        if (role !== "SUPER_ADMIN" && role !== "MANAGING_DIRECTOR") {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      } catch {
        const url = new URL("/login", request.url);
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
    }
    if (pathname === "/divisions" || pathname.startsWith("/divisions/")) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        const role = (payload as { role?: string }).role;
        if (role === "SUPER_ADMIN" || role === "MANAGING_DIRECTOR") {
          return NextResponse.redirect(new URL("/admin/divisions", request.url));
        }
      } catch {
        const url = new URL("/login", request.url);
        url.searchParams.set("from", pathname);
        return NextResponse.redirect(url);
      }
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
