import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { canAccess } from "@/lib/rbac";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (pathname === "/sign-in") {
    if (session) return NextResponse.redirect(new URL("/", req.url));
    return NextResponse.next();
  }

  if (!session) {
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (!canAccess(pathname, session.user.role)) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|logos|favicon.ico).*)"],
};
