// 文件：src/app/api/p/[filename]/route.js
export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

// 只做最小安全处理，避免引号破坏 SQL
function esc(s) {
  return String(s || "")
    .trim()
    .replace(/'/g, "''")
    .slice(0, 200);
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
  const safeName = esc(filename);

  try {
    const sql = `SELECT url FROM img_log WHERE filename='${safeName}' ORDER BY created_at DESC LIMIT 1`;
    const res = await env.IMG.prepare(sql).all();
    const url = res?.results?.[0]?.url;

    if (!url) {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    return Response.redirect(url, 302);
  } catch (e) {
    return new Response(JSON.stringify({ message: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}
