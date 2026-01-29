export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function POST(request) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (!env.IMG) {
    return new Response(JSON.stringify({ error: "数据库未绑定" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(JSON.stringify({ error: "未选择要删除的记录" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 兼容：既支持删除旧表 imginfo 的记录，也支持删除新表 img_log（管理库用）
    const placeholders = ids.map(() => "?").join(",");

    // 1) 删除 imginfo（如果你的 imginfo 没有 id 字段，这条会失败，但不会影响后续删除 img_log）
    try {
      const sql1 = `DELETE FROM imginfo WHERE id IN (${placeholders})`;
      await env.IMG.prepare(sql1).bind(...ids).run();
    } catch (_) {}

    // 2) 删除 img_log（管理库表）
    try {
      const sql2 = `DELETE FROM img_log WHERE id IN (${placeholders})`;
      await env.IMG.prepare(sql2).bind(...ids).run();
    } catch (_) {}

    return new Response(
      JSON.stringify({ success: true, message: `成功删除 ${ids.length} 条记录` }),
      {
        status: 200,
        headers: corsHeaders,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
