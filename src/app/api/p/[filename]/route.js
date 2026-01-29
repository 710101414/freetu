export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function normalizeProvider(p) {
  return String(p || "")
    .trim()
    .toLowerCase();
}

function pickProvider(providerRaw, urlRaw) {
  const p = normalizeProvider(providerRaw);
  const u = String(urlRaw || "").trim();

  // 1) 明确值：按你项目接口命名
  if (p === "tgchannel" || p === "tg" || p === "telegram") return "tg";
  if (p === "r2" || p === "cloudflare_r2" || p === "imgrs") return "r2";

  // 2) provider 为空/脏数据：根据 url 形态推断
  if (u.includes("/cfile/") || u.startsWith("cfile/")) return "tg";
  if (u.includes("/rfile/") || u.startsWith("rfile/")) return "r2";

  return "unknown";
}

function stripPrefix(url, prefix) {
  const s = String(url || "").trim();
  if (s.startsWith(prefix)) return s.slice(prefix.length);
  if (s.startsWith(prefix.replace(/^\//, ""))) return s.slice(prefix.replace(/^\//, "").length);
  return s;
}

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const filename = params?.filename;

  if (!filename) return new Response("Bad Request", { status: 400 });
  if (!env.IMG) return new Response("DB not bound", { status: 500 });

  // 查最新一条
  const row = await env.IMG
    .prepare(
      "SELECT url, provider FROM img_log WHERE filename = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(filename)
    .first();

  if (!row) return new Response("Not found", { status: 404 });

  const url = String(row.url || "").trim();
  const provider = pickProvider(row.provider, url);

  // TG：统一转到 /api/cfile/<file_id>
  if (provider === "tg") {
    const fileId = stripPrefix(url, "/cfile/");
    if (!fileId) return new Response("Bad tg file id", { status: 500 });
    const target = new URL(`/api/cfile/${fileId}`, request.url);
    return Response.redirect(target.toString(), 302);
  }

  // R2：从 R2 读取并直出
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

  // 兜底：把你看到的 provider 原样返回，方便你定位
  return new Response(
    `Unknown provider: ${String(row.provider)} | url: ${url}`,
    { status: 500 }
  );
}
