// 文件：src/app/api/p/[filename]/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function esc(s) {
  return String(s || "").trim().replace(/'/g, "''").slice(0, 200);
}

function base64UrlEncode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  const b64 = btoa(s);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

export async function GET(request, { params }) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!env.IMG) {
    return new Response(JSON.stringify({ message: "数据库未绑定" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = params?.filename || "";
  const filename = decodeURIComponent(raw);
  const safeName = esc(filename);

  // 私密签名校验（可选）
  const urlObj = new URL(request.url);
  const exp = urlObj.searchParams.get("exp");
  const sig = urlObj.searchParams.get("sig");

  const hasExp = exp !== null && exp !== "";
  const hasSig = sig !== null && sig !== "";

  if (hasExp || hasSig) {
    // 只要带了一个，就要求两个都齐全且校验通过
    if (!hasExp || !hasSig) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const secret = env.SIGNING_SECRET || "";
    if (!secret) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }

    const expNum = Number(exp);
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(expNum) || expNum <= now) {
      return new Response("Expired", { status: 403, headers: corsHeaders });
    }

    const msg = `${filename}\n${expNum}`;
    const expectSig = await hmacSha256Base64Url(secret, msg);

    if (sig !== expectSig) {
      return new Response("Forbidden", { status: 403, headers: corsHeaders });
    }
  }

  try {
    const sql = `SELECT url FROM img_log WHERE filename='${safeName}' ORDER BY created_at DESC LIMIT 1`;
    const res = await env.IMG.prepare(sql).all();
    const url = res?.results?.[0]?.url;

    if (!url) return new Response("Not Found", { status: 404, headers: corsHeaders });

    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
