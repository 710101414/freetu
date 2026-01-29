// 文件：src/app/api/p/[filename]/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function esc(s) {
  return String(s || "").trim().replace(/'/g, "''").slice(0, 300);
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

/**
 * 兼容历史脏数据：
 * - url 可能是绝对链接
 * - url 可能是 /cfile/xxx 或 /rfile/xxx 这种相对路径
 * - url 可能被错误写成 https---domain-...（把 :// 和 / 变成 -）
 */
function normalizeStoredUrl(rawUrl, origin) {
  const u = String(rawUrl || "").trim();
  if (!u) return null;

  // 1) 已经是标准绝对 URL
  try {
    if (/^https?:\/\//i.test(u)) {
      return new URL(u).toString();
    }
  } catch (_) {}

  // 2) 形如 /cfile/xxx 或 /rfile/xxx 或 /api/xxx
  try {
    if (u.startsWith("/")) {
      return new URL(u, origin).toString();
    }
  } catch (_) {}

  // 3) 形如 cfile/xxx
  try {
    if (/^(cfile|rfile|api)\//i.test(u)) {
      return new URL("/" + u, origin).toString();
    }
  } catch (_) {}

  // 4) 修复历史错误：把 https---domain-xxx 还原为 https://domain/xxx
  //    只做保守修复：必须以 http 或 https 开头，且包含 --- 作为协议分隔特征
  if (/^https?---/i.test(u)) {
    // https---imaes.dpdns.org-api-cfile-xxx
    const fixedProto = u.replace(/^https?---/i, (m) => (m.toLowerCase().startsWith("https") ? "https://" : "http://"));
    // 剩余的 - 还原为 / （这是历史 bug 的常见写法）
    const fixed = fixedProto.replace(/-/g, "/");
    try {
      return new URL(fixed).toString();
    } catch (_) {}
  }

  // 5) 修复另一种常见错：少了协议，像 imaes.dpdns.org/api/p/xxx
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(u)) {
    try {
      return new URL("https://" + u).toString();
    } catch (_) {}
  }

  return null;
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

  const origin = new URL(request.url).origin;
  const raw = params?.filename || "";
  const filename = decodeURIComponent(raw);
  const safeName = esc(filename);

  // 私密签名校验（可选）：只要带 exp 或 sig，就必须校验通过
  const urlObj = new URL(request.url);
  const exp = urlObj.searchParams.get("exp");
  const sig = urlObj.searchParams.get("sig");
  const hasExp = exp !== null && exp !== "";
  const hasSig = sig !== null && sig !== "";

  if (hasExp || hasSig) {
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
    // 读取最新一条（filename 维度）
    const sql = `SELECT url FROM img_log WHERE filename='${safeName}' ORDER BY created_at DESC LIMIT 1`;
    const res = await env.IMG.prepare(sql).all();
    const storedUrl = res?.results?.[0]?.url;

    if (!storedUrl) {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    const redirectTo = normalizeStoredUrl(storedUrl, origin);

    if (!redirectTo) {
      return new Response(
        JSON.stringify({
          message: `Unable to parse URL: ${String(storedUrl)}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return Response.redirect(redirectTo, 302);
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
