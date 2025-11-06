import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

const PROTECTED_PATHS = ["/sessions", "/api/sessions", "/api/upload", "/api/export"];

export default auth(async (req) => {
  const { nextUrl } = req;
  const isAuth = !!req.auth?.user;
  const pathname = nextUrl.pathname;

  const requiresAuth = PROTECTED_PATHS.some((path) => pathname.startsWith(path));

  if (!requiresAuth) {
    return NextResponse.next();
  }

  if (!isAuth) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const signInUrl = new URL("/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname + nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/sessions/:path*", "/api/sessions/:path*", "/api/upload/:path*", "/api/export/:path*"]
};
