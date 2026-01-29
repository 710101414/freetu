export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const filename = params.filename;

  if (!env.IMG) {
    return new Response("DB not bound", { status: 500 });
  }

  // 1. 用 filename 查数据库
  const row = await env.IMG
    .prepare(
      "SELECT url, provider FROM img_log WHERE filename = ? ORDER BY created_at DESC LIMIT 1"
    )
    .bind(filename)
    .first();

  if (!row) {
    return new Response("Not found", { status: 404 });
  }

  const { url, provider } = row;

  // 2. TG 文件：转发到 /api/cfile/<file_id>
  if (provider === "tg") {
    const fileId = url.replace("/cfile/", "");
    const target = new URL(`/api/cfile/${fileId}`, request.url);
    return Response.redirect(target.toString(), 302);
  }

  // 3. R2 文件：从 R2 读取
  if (provider === "r2") {
    const key = url.replace("/rfile/", "");
    const obj = await env.IMGRS.get(key);

    if (!obj) return new Response("Not found", { status: 404 });

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType || "image/png",
        "Cache-Control": "public, max-age=31536000"
      }
    });
  }

  return new Response("Unknown provider", { status: 500 });
}
