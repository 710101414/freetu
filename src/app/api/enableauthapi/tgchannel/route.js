export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function getExtFromMime(mime) {
  if (!mime) return "";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("webp")) return ".webp";
  return "";
}

function shanghaiYMD() {
  // 生成 YYYY-MM-DD（按上海时区）
  const now = new Date();
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(now)
    .reduce((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function ensureImgLogTable(envDb) {
  // 可选：如果你已经手动建表，这段也不会有副作用
  try {
    await envDb
      .prepare(
        `CREATE TABLE IF NOT EXISTS img_log (
          id TEXT PRIMARY KEY,
          url TEXT NOT NULL,
          provider TEXT NOT NULL,
          filename TEXT,
          created_at INTEGER NOT NULL
        );`
      )
      .run();

    await envDb
      .prepare(`CREATE INDEX IF NOT EXISTS idx_img_log_created_at ON img_log(created_at DESC);`)
      .run();

    await envDb
      .prepare(`CREATE INDEX IF NOT EXISTS idx_img_log_provider_created_at ON img_log(provider, created_at DESC);`)
      .run();
  } catch (_) {}
}

async function genDailyName(envDb, ext, fallbackBase = "") {
  const ymd = shanghaiYMD();
  // 统计当天数量（created_at 为毫秒）
  const sql = `
    SELECT COUNT(*) AS c
    FROM img_log
    WHERE date(created_at/1000, 'unixepoch', 'localtime') = '${ymd}'
  `;
  const res = await envDb.prepare(sql).all();
  const c = Number(res?.results?.[0]?.c || 0);
  const idx = c + 1;
  const seq = String(idx).padStart(3, "0");
  const base = fallbackBase || `${ymd}-${seq}`;
  return `${base}${ext || ""}`;
}

function sanitizeBaseName(name) {
  // 只保留安全字符：字母数字 - _ .
  // 并去掉路径分隔符，防止写入奇怪内容
  const s = String(name || "").trim();
  return s.replace(/[\/\\]/g, "-").replace(/[^a-zA-Z0-9\-_.]/g, "-").slice(0, 120);
}

async function insertImgLogSafe(envDb, row) {
  try {
    await ensureImgLogTable(envDb);

    // D1(Pages) 无 bind，使用转义后的字符串拼接（row 经过 sanitize）
    const sql = `
      INSERT INTO img_log (id, url, provider, filename, created_at)
      VALUES ('${row.id}', '${row.url}', '${row.provider}', '${row.filename}', ${row.created_at})
    `;
    await envDb.prepare(sql).run();
  } catch (_) {}
}

async function getFile(response) {
  try {
    if (!response.ok) return null;

    const getFileDetails = (file) => ({
      file_id: file.file_id,
      file_name: file.file_name || file.file_unique_id,
    });

    if (response.result.photo) {
      const largestPhoto = response.result.photo.reduce((prev, current) =>
        prev.file_size > current.file_size ? prev : current
      );
      return getFileDetails(largestPhoto);
    }

    if (response.result.video) return getFileDetails(response.result.video);
    if (response.result.document) return getFileDetails(response.result.document);

    return null;
  } catch (_) {
    return null;
  }
}

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return new Response(
      JSON.stringify({
        status: 500,
        message: "TG_BOT_TOKEN or TG_CHAT_ID is not Set",
        success: false,
      }),
      { status: 500, headers: corsHeaders }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) {
    return new Response(JSON.stringify({ status: 400, message: "file is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const reqUrl = new URL(request.url);
  const fileType = file.type || "";
  const ext = getExtFromMime(fileType) || (file.name?.includes(".") ? `.${file.name.split(".").pop()}` : "");

  const fileTypeMap = {
    "image/": { endpoint: "sendPhoto", field: "photo" },
    "video/": { endpoint: "sendVideo", field: "video" },
    "audio/": { endpoint: "sendAudio", field: "audio" },
    "application/pdf": { endpoint: "sendDocument", field: "document" },
  };
  const defaultType = { endpoint: "sendDocument", field: "document" };
  const hitKey = Object.keys(fileTypeMap).find((k) => fileType.startsWith(k));
  const { endpoint, field } = hitKey ? fileTypeMap[hitKey] : defaultType;

  const upUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`;
  const tgForm = new FormData();
  tgForm.append("chat_id", env.TG_CHAT_ID);
  tgForm.append(field, file);

  try {
    const tgRes = await fetch(upUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      },
      body: tgForm,
    });

    const tgData = await tgRes.json();
    const fileData = await getFile(tgData);
    if (!fileData?.file_id) {
      return new Response(JSON.stringify({ status: 500, message: "Telegram upload failed" }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    // 命名：优先用前端传来的 name；否则自动生成 YYYY-MM-DD-000
    const wantName = sanitizeBaseName(formData.get("name"));
    const autoDailyName = String(formData.get("autoDailyName") || "true") === "true";
    const finalName = wantName
      ? `${wantName}${wantName.endsWith(ext) ? "" : ext}`
      : autoDailyName
      ? await genDailyName(env.IMG, ext, "")
      : (sanitizeBaseName(file.name) || `image${ext}`);

    const id = fileData.file_id; // tg file_id 作为主键
    const url = `${reqUrl.origin}/api/cfile/${fileData.file_id}`;
    const createdAt = Date.now();

    if (env.IMG) {
      await insertImgLogSafe(env.IMG, {
        id: sanitizeBaseName(id),
        url: sanitizeBaseName(url),
        provider: "tgchannel",
        filename: sanitizeBaseName(finalName),
        created_at: createdAt,
      });
    }

    return new Response(
      JSON.stringify({
        id,
        url,
        name: finalName,
        code: 200,
        success: true,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    return new Response(JSON.stringify({ status: 500, message: e.message, success: false }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
