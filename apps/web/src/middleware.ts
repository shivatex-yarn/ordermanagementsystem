import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const publicPaths = ["/login", "/forgot-password", "/reset-password", "/api/auth", "/api/health"];
const adminPaths = ["/team", "/audit"];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "default-secret-change-in-production-min-32"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  // API handlers authenticate themselves.
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const toLogin = () => {
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  };
  const token = request.cookies.get("oms_token")?.value;
  if (!token) return toLogin();
  let role: string | undefined;
  try {
    role = ((await jwtVerify(token, JWT_SECRET)).payload as { role?: string }).role;
  } catch {
    return toLogin();
  }
  if (adminPaths.some((p) => pathname === p || pathname.startsWith(p + "/")) && role !== "SUPER_ADMIN") {
    return NextResponse.redirect(new URL("/orders", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|company-logo.png|icon.png).*)"],
};
