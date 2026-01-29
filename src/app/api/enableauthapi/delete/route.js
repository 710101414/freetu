export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.IMG) {
    return new Response(JSON.stringify({ error: "数据库未绑定(IMG)" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();
    const ids = body?.ids;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(JSON.stringify({ error: "未选择要删除的记录" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1) 先查出这些记录（用于删 R2 对象）
    const placeholders = ids.map(() => "?").join(",");
    const rows = await env.IMG
      .prepare(`SELECT id, url, provider FROM img_log WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all();

    const list = rows?.results || [];

    // 2) 删除 D1 记录
    await env.IMG
      .prepare(`DELETE FROM img_log WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();

    // 3) 删除 R2 对象（可选）
    let r2Deleted = 0;
    if (env.IMGRS) {
      for (const r of list) {
        const provider = String(r.provider || "").toLowerCase();
        const url = String(r.url || "");
        if (provider === "r2" && url.includes("/rfile/")) {
          const key = url.replace("/rfile/", "");
          if (key) {
            try {
              await env.IMGRS.delete(key);
              r2Deleted++;
            } catch (_) {}
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `成功删除 ${ids.length} 条记录`,
        r2Deleted,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
