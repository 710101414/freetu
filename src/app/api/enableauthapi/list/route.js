// 需要新增：app/api/enableauthapi/list/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function GET(request) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json",
  };

  if (!env.IMG) {
    return Response.json({ message: "数据库未绑定" }, { status: 500, headers: corsHeaders });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10), 200);
    const cursor = url.searchParams.get("cursor"); // created_at 游标
    const provider = url.searchParams.get("provider"); // 可选：tgchannel / r2

    let sql = `SELECT id, url, provider, filename, created_at
               FROM img_log
               WHERE 1=1`;
    const binds = [];

    if (provider) {
      sql += ` AND provider = ?`;
      binds.push(provider);
    }

    if (cursor) {
      sql += ` AND created_at < ?`;
      binds.push(Number(cursor));
    }

    sql += ` ORDER BY created_at DESC LIMIT ?`;
    binds.push(limit);

    const res = await env.IMG.prepare(sql).bind(...binds).全部();
    const items = res?.results || [];
    const nextCursor = items.length > 0 ? String(items[items.length - 1].created_at) : null;

    return Response.json({ items, nextCursor }, { status: 200, headers: corsHeaders });
  } catch (e) {
    return Response.json({ message: e.message || "list failed" }, { status: 500, headers: corsHeaders });
  }
}
