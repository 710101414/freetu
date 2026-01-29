export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

export async function POST(request) {
  const { env } = getRequestContext();
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // 1. 基础权限检查 (简单校验，可根据需要加强)
  if (!env.IMG) {
    return new Response(JSON.stringify({ error: "数据库未绑定" }), { status: 500, headers: corsHeaders });
  }

  try {
    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return new Response(JSON.stringify({ error: "未选择要删除的记录" }), { status: 400, headers: corsHeaders });
    }

    // 2. 执行批量删除 SQL
    // 注意：这里假设你的表名是 imginfo，主键是 id
    const placeholders = ids.map(() => '?').join(',');
    const sql = `DELETE FROM imginfo WHERE id IN (${placeholders})`;
    
    await env.IMG.prepare(sql).bind(...ids).run();

    return new Response(JSON.stringify({ success: true, message: `成功删除 ${ids.length} 条记录` }), { 
      status: 200, 
      headers: corsHeaders 
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}
