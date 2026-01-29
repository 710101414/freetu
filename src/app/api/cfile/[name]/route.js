export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

/**
 * 根据 Telegram 返回的 filePath 猜测类型
 */
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
  // 如果路径里包含 photos/ 目录，通常是图片
  if (p.includes("photos/")) return "image/jpeg";
  return null; 
}

export async function GET(request, { params }) {
  const { env } = getRequestContext();
  const fileId = params?.name ? decodeURIComponent(params.name) : "";

  if (!fileId) return new Response("Bad Request", { status: 400 });
  if (!env.TG_BOT_TOKEN) return new Response("TG_BOT_TOKEN not set", { status: 500 });

  // 1) getFile -> 获取文件的 file_path
  const infoUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`;

  const infoRes = await fetch(infoUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const infoJson = await infoRes.json().catch(() => null);
  if (!infoJson || !infoJson.ok || !infoJson.result?.file_path) {
    return new Response("Not Found (Info)", { status: 404 });
  }

  const filePath = infoJson.result.file_path;

  // 2) 请求 Telegram 服务器上的真实文件流
  const tgFileUrl = `https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${filePath}`;
  const tgRes = await fetch(tgFileUrl, {
    method: "GET",
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!tgRes.ok) return new Response("Not Found (File)", { status: 404 });

  // --- 关键修复逻辑开始 ---
  
  // 获取路径猜测的类型
  const guessedType = guessContentTypeFromPath(filePath);
  // 获取 TG 返回的类型
  const tgContentType = tgRes.headers.get("content-type");

  /**
   * 决策逻辑：
   * 1. 如果路径能猜出具体格式（jpg/png等），优先用猜的（因为路径后缀最准）。
   * 2. 如果猜不出，用 TG 返回的。
   * 3. 如果 TG 返回的是二进制流 (octet-stream) 或者是空的，强制给 image/jpeg (图床兜底)。
   */
  let finalContentType = guessedType || tgContentType;

  if (!finalContentType || finalContentType === "application/octet-stream") {
    finalContentType = "image/jpeg"; 
  }

  const headers = new Headers();
  headers.set("Content-Type", finalContentType);
  headers.set("Cache-Control", "public, max-age=31536000");

  // 显式告知浏览器：这是用来预览的 (inline)，不是用来下载的 (attachment)
  headers.set("Content-Disposition", "inline");

  const len = tgRes.headers.get("content-length");
  if (len) headers.set("Content-Length", len);

  // --- 关键修复逻辑结束 ---

  return new Response(tgRes.body, { status: 200, headers });
}
