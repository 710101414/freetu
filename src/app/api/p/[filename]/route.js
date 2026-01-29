// 新增文件：src/app/api/p/[filename]/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

function esc(s) {
  return String(s || "").trim().替换(/'/g， "''").slice(0, 200);
}

export async function GET(request, { params }) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (!env.IMG) {
    return new Response(JSON.stringify({ message: "数据库未绑定" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const raw = params?.filename || "";
  const filename = decodeURIComponent(raw);

  // 允许 filename 带扩展名；按 filename 精确匹配
  const safeName = esc(filename);

  try {
    const sql = `SELECT url FROM img_log WHERE filename='${safeName}' ORDER BY created_at DESC LIMIT 1`;
    const res = await env.IMG.prepare(sql).全部();
    const url = res?.results?.[0]?.url;

    if (!url) {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    // 302 重定向到真实资源（/api/cfile/<id> 或 /api/rfile/<key>）
    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
