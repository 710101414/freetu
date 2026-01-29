export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function normalizeProvider(p) {
  return String(p || "").trim().toLowerCase();
}

function stripPrefix(url, prefix) {
  const s = String(url || "").trim();
  if (s.startsWith(prefix)) return s.slice(prefix.length);
  const p2 = prefix.replace(/^\//, "");
  if (s.startsWith(p2)) return s.slice(p2.length);
  return s;
}

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const filename = params?.filename ? decodeURIComponent(params.filename) : "";

  if (!filename) return new Response("Bad Request", { status: 400 });
  if (!env.IMG) return new Response("DB not bound", { status: 500 });

  // 必须从 img_log 查（你要的“统一外链按文件名”就是靠这张表）
  const row = await env.IMG
    .prepare(
      "SELECT url, provider FROM img_log WHERE filename = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(filename)
    .first();

  if (!row) return new Response("Not found", { status: 404 });

  const url = String(row.url || "").trim();
  const provider = normalizeProvider(row.provider);

  // TG：跳转到 /api/cfile/<file_id>
  if (provider === "tgchannel" || provider === "tg" || provider === "telegram") {
    const fileId = stripPrefix(url, "/cfile/");
    if (!fileId) return new Response("Bad tg file id", { status: 500 });
    const target = new URL(`/api/cfile/${fileId}`, request.url);
    return Response.redirect(target.toString(), 302);
  }

  // R2：直出 R2 对象
  if (provider === "r2") {
    if (!env.IMGRS) return new Response("R2 not bound", { status: 500 });
    const key = stripPrefix(url, "/rfile/");
    if (!key) return new Response("Bad r2 key", { status: 500 });

    const obj = await env.IMGRS.get(key);
    if (!obj) return new Response("Not found", { status: 404 });

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=31536000",
      },
    });
  }

  return new Response(`Unknown provider: ${row.provider} | url: ${url}`, { status: 500 });
}
