import { NextResponse } from "next/server";
import { auth } from "@/auth";

function isPublicPath(pathname) {
  // 公共外链：任何人可访问（不防盗链）
  if (pathname.startsWith("/api/p/")) return true;
  if (pathname.startsWith("/api/cfile/")) return true;
  if (pathname.startsWith("/api/rfile/")) return true;

  // Next 内部与静态资源
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;

  return false;
}

function isAdminOnlyPath(pathname) {
  // 这些必须管理员
  if (pathname === "/manage") return true;
  if (pathname.startsWith("/api/enableauthapi/")) return true;
  return false;
}

export default auth((req) => {
  const pathname = req.nextUrl.pathname;

  // 1) 公共资源直接放行
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2) 管理路径：必须登录且 admin
  if (isAdminOnlyPath(pathname)) {
    const role = req.auth && req.auth.user && req.auth.user.role;

    if (role === "admin") return NextResponse.next();

    // API：直接 403
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 页面：跳登录
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 3) 其他页面默认放行
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
