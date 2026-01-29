export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

// 这个接口作用：把 Telegram 的 file_id 代理成可访问的文件流，并带上正确 Content-Type
export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const fileId = params?.name ? decodeURIComponent(params.name) : "";

  if (!fileId) return new Response("Bad Request", { status: 400 });

  if (!env.TG_BOT_TOKEN) {
    return Response.json(
      { message: "TG_BOT_TOKEN not set" },
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 1) 先用 getFile 拿到 file_path
  const infoUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(
    fileId
  )}`;

  const infoRes = await fetch(infoUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const infoJson = await infoRes.json().catch(() => null);
  if (!infoJson || !infoJson.ok || !infoJson.result?.file_path) {
    return new Response("Not Found", { status: 404 });
  }

  const filePath = infoJson.result.file_path;

  // 2) 取真正文件流
  const tgFileUrl = `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${filePath}`;
  const tgRes = await fetch(tgFileUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!tgRes.ok) return new Response("Not Found", { status: 404 });

  // ✅ 关键：把 TG 的 Content-Type 原样透传
  const contentType = tgRes.headers.get("content-type") || "application/octet-stream";

  // 可选：透传长度（有些浏览器更友好）
  const contentLength = tgRes.headers.get("content-length");

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000"); // 1 年缓存
  if (contentLength) headers.set("Content-Length", contentLength);

  return new Response(tgRes.body, { status: 200, headers });
}
