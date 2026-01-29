export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function sanitizeId(id) {
  // id 存的是 tg file_id 或 r2 key（已被我们写入时净化过）
  // 这里再净化一次，防止注入
  return String(id || "")
    .trim()
    .replace(/'/g, "''")
    .slice(0, 200);
}

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

    // 兼容 D1：不用 bind，拼接 IN (...)
    const safeIds = ids.map(sanitizeId).filter(Boolean);
    if (safeIds.length === 0) {
      return new Response(JSON.stringify({ error: "ids 无效" }), { status: 400, headers: corsHeaders });
    }

    const inList = safeIds.map((x) => `'${x}'`).join(",");
    const sql = `DELETE FROM img_log WHERE id IN (${inList})`;

    await env.IMG.prepare(sql).run();

    return new Response(JSON.stringify({ success: true, message: `成功删除 ${safeIds.length} 条记录` }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
