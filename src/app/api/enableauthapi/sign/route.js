// 新增文件：src/app/api/enableauthapi/sign/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { auth } from "@/auth";

function normalizeBaseUrl(s) {
  const v = String(s || "").trim();
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v.替换(/\/+$/, "");
  return `https://${v}`.替换(/\/+$/, "");
}

function base64UrlEncode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  return b64.替换(/\+/g, "-").替换(/\//g, "_").替换(/=+$/g, "");
}

async function hmacSha256Base64Url(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return base64UrlEncode(new Uint8Array(sig));
}

export async function GET(request) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // 仅管理员可生成私密链接
  const session = await auth();
  const role = session?.user?.role;
  if (role !== "admin") {
    return new Response(JSON.stringify({ message: "forbidden" }), { status: 403, headers: corsHeaders });
  }

  const secret = env.SIGNING_SECRET || "";
  if (!secret) {
    return new Response(JSON.stringify({ message: "SIGNING_SECRET is not set" }), { status: 500, headers: corsHeaders });
  }

  const u = new URL(request.url);
  const filename = u.searchParams.get("filename") || "";
  const base = normalizeBaseUrl(u.searchParams.get("base") || "");
  const expSeconds = Number(u.searchParams.get("expSeconds") || "86400");

  if (!filename) {
    return new Response(JSON.stringify({ message: "filename required" }), { status: 400, headers: corsHeaders });
  }

  const b = base || normalizeBaseUrl(u.origin);
  const exp = Math.floor(Date.now() / 1000) + (Number.isFinite(expSeconds) ? Math.max(60, expSeconds) : 86400);

  const msg = `${filename}\n${exp}`;
  const sig = await hmacSha256Base64Url(secret, msg);

  const url = `${b}/api/p/${encodeURIComponent(filename)}?exp=${exp}&sig=${sig}`;
  return new Response(JSON.stringify({ url }), { status: 200, headers: corsHeaders });
}
