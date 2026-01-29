export const runtime = 'edge';
import { getRequestContext } from '@cloudflare/next-on-pages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json'
};

export async function POST(request) {
  const { env } = getRequestContext();

  // --- 1. 安全校验：检查 SA_TOKEN ---
  const authHeader = request.headers.get('Authorization');
  if (env.SA_TOKEN) {
    if (!authHeader || authHeader !== `Bearer ${env.SA_TOKEN}`) {
      return new Response(JSON.stringify({ 
        code: 401, 
        msg: "Unauthorized: 权限验证失败，请在 Header 中配置正确的 SA_TOKEN" 
      }), { 
        status: 401, 
        headers: corsHeaders 
      });
    }
  }

  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'IP not found';
  const clientIp = ip.split(',')[0].trim();
  const Referer = request.headers.get('Referer') || "Referer";
  const req_url = new URL(request.url);
  const customDomain = env.CUSTOM_DOMAIN || req_url.origin;

  // 处理 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  try {
    // 转发请求到 Telegraph
    const res = await fetch(`https://telegra.ph/upload?source=bugtracker`, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
    });

    if (!res.ok) throw new Error(`Telegraph 响应错误: ${res.status}`);

    const resdata = await res.json();
    const imgPath = resdata[0]?.src || resdata.src; // 兼容不同返回格式

    if (!imgPath) throw new Error("Telegraph 未返回有效的图片路径");

    let data = {
      "url": `${customDomain}${imgPath}`,
      "code": 200,
      "name": imgPath
    };

    // --- 2. 数据库写入逻辑 ---
    // 注意：这里统一使用 env.IMG，请确保 Cloudflare 后台 D1 变量名也是大写的 IMG
    if (!env.IMG) {
      return Response.json({ ...data, msg: "图片上传成功，但未绑定 D1 数据库记录" }, {
        status: 200,
        headers: corsHeaders,
      });
    } else {
      const rating_index = await getRating(env, imgPath);
      const nowTime = await get_nowTime();
      try {
        await insertImageData(env.IMG, imgPath, Referer, clientIp, rating_index, nowTime);
        return Response.json({ ...data, msg: "上传并记录成功" }, {
          status: 200,
          headers: corsHeaders,
        });
      } catch (dbError) {
        return Response.json({ ...data, msg: `上传成功但数据库写入失败: ${dbError.message}` }, {
          status: 200,
          headers: corsHeaders,
        });
      }
    }

  } catch (error) {
    return Response.json({
      status: 500,
      message: `服务器内部错误: ${error.message}`,
      success: false
    }, {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// 辅助函数：插入数据库
async function insertImageData(D1, src, referer, ip, rating, time) {
  // 使用参数化查询防止 SQL 注入
  await D1.prepare(
    `INSERT INTO imginfo (url, referer, ip, rating, total, time) VALUES (?, ?, ?, ?, 1, ?)`
  ).bind(src, referer, ip, rating, time).run();
}

// 辅助函数：获取时间
async function get_nowTime() {
  const options = {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: 'long', day: 'numeric',
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  };
  return new Intl.DateTimeFormat('zh-CN', options).format(new Date());
}

// 辅助函数：内容审查
async function getRating(env, url) {
  try {
    const apikey = env.ModerateContentApiKey;
    const ratingApi = env.RATINGAPI || (apikey ? `https://api.moderatecontent.com/moderate/?key=${apikey}&url=` : null);
    if (ratingApi) {
      const res = await fetch(`${ratingApi}https://telegra.ph${url}`);
      const data = await res.json();
      return data.rating_index ?? 0;
    }
    return 0;
  } catch {
    return -1;
  }
}
