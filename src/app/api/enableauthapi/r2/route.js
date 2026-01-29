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

function sanitizeBaseName(name) {
  const s = String(name || "").trim();
  return s.replace(/[\/\\]/g, "-").replace(/[^a-zA-Z0-9\-_.]/g, "-").slice(0, 120);
}

async function ensureImgLogTable(envDb) {
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

async function insertImgLogSafe(envDb, row) {
  try {
    await ensureImgLogTable(envDb);
    const sql = `
      INSERT INTO img_log (id, url, provider, filename, created_at)
      VALUES ('${row.id}', '${row.url}', '${row.provider}', '${row.filename}', ${row.created_at})
    `;
    await envDb.prepare(sql).run();
  } catch (_) {}
}

async function objectExists(bucket, key) {
  try {
    const head = await bucket.head(key);
    return !!head;
  } catch (_) {
    return false;
  }
}

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.IMGRS) {
    return new Response(JSON.stringify({ status: 500, message: "IMGRS is not Set", success: false }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const reqUrl = new URL(request.url);
  const formData = await request.formData();
  const file = formData.get("file");
  if (!file) {
    return new Response(JSON.stringify({ status: 400, message: "file is required" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const mime = file.type || "";
  const ext = getExtFromMime(mime) || (file.name?.includes(".") ? `.${file.name.split(".").pop()}` : "");

  // 命名：优先用前端传来的 name；否则自动 YYYY-MM-DD-000
  const wantName = sanitizeBaseName(formData.get("name"));
  const autoDailyName = String(formData.get("autoDailyName") || "true") === "true";

  let filename = "";
  if (wantName) {
    filename = wantName.endsWith(ext) ? wantName : `${wantName}${ext}`;
  } else if (autoDailyName && env.IMG) {
    filename = await genDailyName(env.IMG, ext, "");
  } else {
    filename = sanitizeBaseName(file.name) || `image${ext}`;
  }

  // 防覆盖：如同名已存在，追加随机后缀
  let key = filename;
  if (await objectExists(env.IMGRS, key)) {
    const rand = Math.random().toString(16).slice(2, 6);
    key = filename.replace(ext, `-${rand}${ext}`);
  }

  try {
    const headers = new Headers();
    if (mime) headers.set("content-type", mime);
    headers.set("content-length", `${file.size}`);

    const putRes = await env.IMGRS.put(key, file, { httpMetadata: headers });
    if (!putRes) {
      return new Response(JSON.stringify({ status: 500, message: "R2 put failed", success: false }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const url = `${reqUrl.origin}/api/rfile/${encodeURIComponent(key)}`;
    const id = key; // 用 key 作为 id
    const createdAt = Date.now();

    if (env.IMG) {
      await insertImgLogSafe(env.IMG, {
        id: sanitizeBaseName(id),
        url: sanitizeBaseName(url),
        provider: "r2",
        filename: sanitizeBaseName(key),
        created_at: createdAt,
      });
    }

    return new Response(
      JSON.stringify({
        id,
        url,
        name: key,
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
