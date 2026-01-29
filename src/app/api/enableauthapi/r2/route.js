export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.IMGRS) {
    return Response.json(
      { status: 500, message: "IMGRS is not Set", success: false },
      { status: 500, headers: corsHeaders }
    );
  }

  const reqUrl = new URL(request.url);

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    null;
  const clientIp = ip ? ip.split(",")[0].trim() : "IP not found";
  const referer = request.headers.get("Referer") || "Referer";

  let formData;
  try {
    formData = await request.formData();
  } catch (e) {
    return Response.json(
      { status: 400, message: "Invalid form data", success: false },
      { status: 400, headers: corsHeaders }
    );
  }

  const file = formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json(
      { status: 400, message: "file is required", success: false },
      { status: 400, headers: corsHeaders }
    );
  }

  const fileType = file.type || "application/octet-stream";
  const filename = file.name || `upload-${Date.now()}`;

  const httpMetadata = {
    contentType: fileType,
  };

  try {
    const putRes = await env.IMGRS.put(filename, file, { httpMetadata });

    if (!putRes) {
      // 这里不要引用不存在的 error
      return Response.json(
        { status: 500, message: "R2 put failed", success: false },
        { status: 500, headers: corsHeaders }
      );
    }

    const data = {
      url: `${reqUrl.origin}/api/rfile/${encodeURIComponent(filename)}`,
      code: 200,
      name: filename,
    };

    // 没绑 D1 就只返回外链
    if (!env.IMG) {
      return Response.json({ ...data, msg: "no_db" }, { status: 200, headers: corsHeaders });
    }

    // 绑了 D1：写入旧表 imginfo（保持与你现有结构兼容）
    try {
      const ratingIndex = await getRating(env, data.url);
      const nowTime = await getNowTime();
      await insertImageData(env.IMG, `/rfile/${filename}`, referer, clientIp, ratingIndex, nowTime);
      return Response.json(
        { ...data, msg: "ok", referer, clientIp, ratingIndex, nowTime },
        { status: 200, headers: corsHeaders }
      );
    } catch (e) {
      // 写库失败也不要炸上传
      return Response.json(
        { ...data, msg: "uploaded_but_log_failed", logError: e?.message || String(e) },
        { status: 200, headers: corsHeaders }
      );
    }
  } catch (e) {
    return Response.json(
      { status: 500, message: e?.message || String(e), success: false },
      { status: 500, headers: corsHeaders }
    );
  }
}

async function insertImageData(db, src, referer, ip, rating, time) {
  // ⚠️ 这段仍沿用你旧表 imginfo 的字段结构
  try {
    await db
      .prepare(
        `INSERT INTO imginfo (url, referer, ip, rating, total, time)
         VALUES (?, ?, ?, ?, 1, ?)`
      )
      .bind(src, referer, ip, rating, time)
      .run();
  } catch (_) {}
}

async function getNowTime() {
  const options = {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  };
  const t = new Date();
  return new Intl.DateTimeFormat("zh-CN", options).format(t);
}

async function getRating(env, url) {
  try {
    const apikey = env.ModerateContentApiKey;
    const moderateUrl = apikey
      ? `https://api.moderatecontent.com/moderate/?key=${apikey}&`
      : "";
    const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : moderateUrl;

    if (!ratingApi) return 0;

    const res = await fetch(`${ratingApi}url=${encodeURIComponent(url)}`);
    const data = await res.json().catch(() => ({}));
    return Object.prototype.hasOwnProperty.call(data, "rating_index") ? data.rating_index : -1;
  } catch (_) {
    return -1;
  }
}
