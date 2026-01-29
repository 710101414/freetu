import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";

function isPublicPath(pathname: string) {
  // 公共外链：任何人都能访问（不防盗链）
  if (pathname.startsWith("/api/p/")) return true;
  if (pathname.startsWith("/api/cfile/")) return true;
  if (pathname.startsWith("/api/rfile/")) return true;

  // 你如果还有其它公开文件路由，也加在这里
  // if (pathname.startsWith("/api/tfile/")) return true;

  // 静态资源 / Next 内部
  if (pathname.startsWith("/_next/")) return true;
  if (pathname === "/favicon.ico") return true;

  return false;
}

function isAdminOnlyPath(pathname: string) {
  // 这些必须管理员才允许访问
  if (pathname === "/manage") return true;
  if (pathname.startsWith("/api/enableauthapi/")) return true;
  return false;
}

export default auth((req: NextRequest) => {
  const { pathname } = req.nextUrl;

  // 1) 公共资源直接放行
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // 2) 管理路径：必须登录且 admin
  if (isAdminOnlyPath(pathname)) {
    const role = (req as any).auth?.user?.role;
    if (role === "admin") return NextResponse.next();

    // API 请求：直接 403（避免跳转造成奇怪问题）
    if (pathname.startsWith("/api/")) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 页面请求：跳登录
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 3) 其他页面默认放行（你的主页等）
  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
      对所有路径生效，但我们在逻辑里放行 public paths
      这样不会误伤 /api/p 与 /api/cfile
    */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
