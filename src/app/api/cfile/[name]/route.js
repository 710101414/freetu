export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function guessContentTypeFromPath(path) {
  const p = String(path || "").toLowerCase();
  if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".mov")) return "video/quicktime";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  if (p.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const fileId = params?.name ? decodeURIComponent(params.name) : "";

  if (!fileId) return new Response("Bad Request", { status: 400 });
  if (!env.TG_BOT_TOKEN) return new Response("TG_BOT_TOKEN not set", { status: 500 });

  // 1) getFile -> file_path
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

  // 2) 真正文件流
  const tgFileUrl = `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${filePath}`;
  const tgRes = await fetch(tgFileUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!tgRes.ok) return new Response("Not Found", { status: 404 });

  // ✅ 关键：透传 Telegram 返回的 content-type
  const tgContentType = tgRes.headers.get("content-type");
  const contentType = tgContentType || guessContentTypeFromPath(filePath);

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Cache-Control", "public, max-age=31536000");

  // 可选：透传长度
  const len = tgRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  // 可选：支持文件名（inline，不强制下载）
  // headers.set("Content-Disposition", `inline; filename="${filePath.split("/").pop() || "file"}"`);

  return new Response(tgRes.body, { status: 200, headers });
}
