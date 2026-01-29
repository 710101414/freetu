export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Content-Type": "application/json",
};

function nowMs() {
  return Date.now();
}

function safeFilename(name) {
  const s = String(name || "").trim();
  // 只保留常见安全字符
  return s.replace(/[^\w.\-]/g, "_").slice(0, 180) || `img-${Date.now()}.png`;
}

async function insertManageLogSafe(db, { id, url, provider, filename, createdAt }) {
  try {
    await db
      .prepare(
        `INSERT INTO img_log (id, url, provider, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(id, url, provider, filename, createdAt)
      .run();
  } catch (_) {}
}

const getFile = async (response) => {
  try {
    if (!response?.ok) return null;

    const getFileDetails = (file) => ({
      file_id: file.file_id,
      file_name: file.file_name || file.file_unique_id,
    });

    if (response.result.photo) {
      const largest = response.result.photo.reduce((p, c) =>
        p.file_size > c.file_size ? p : c
      );
      return getFileDetails(largest);
    }
    if (response.result.video) return getFileDetails(response.result.video);
    if (response.result.document) return getFileDetails(response.result.document);

    return null;
  } catch (_) {
    return null;
  }
};

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return Response.json(
      { status: 500, message: "TG_BOT_TOKEN or TG_CHAT_ID is not Set", success: false },
      { status: 500, headers: corsHeaders }
    );
  }

  if (!env.IMG) {
    return Response.json(
      { status: 500, message: "D1(IMG) is not bound", success: false },
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

  const formData = await request.formData();
  const file = formData.get("file");
  if (!file || typeof file.type !== "string") {
    return Response.json(
      { status: 400, message: "file is required", success: false },
      { status: 400, headers: corsHeaders }
    );
  }

  const fileType = file.type || "application/octet-stream";
  const filename = safeFilename(file.name);

  const fileTypeMap = {
    "image/": { endpoint: "sendPhoto", field: "photo" },
    "video/": { endpoint: "sendVideo", field: "video" },
    "audio/": { endpoint: "sendAudio", field: "audio" },
    "application/pdf": { endpoint: "sendDocument", field: "document" },
  };

  const matchKey = Object.keys(fileTypeMap).find((k) => fileType.startsWith(k));
  const { endpoint, field } = matchKey ? fileTypeMap[matchKey] : { endpoint: "sendDocument", field: "document" };

  const upUrl = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`;

  const tgForm = new FormData();
  tgForm.append("chat_id", env.TG_CHAT_ID);
  tgForm.append(field, file, filename);

  try {
    const tgRes = await fetch(upUrl, {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0" },
      body: tgForm,
    });

    const tgJson = await tgRes.json();
    const fileData = await getFile(tgJson);

    if (!fileData?.file_id) {
      return Response.json(
        { status: 500, message: "Telegram upload failed", success: false, detail: tgJson },
        { status: 500, headers: corsHeaders }
      );
    }

    // ✅ 统一：对外永远返回 /api/p/<filename>
    const publicUrl = `${reqUrl.origin}/api/p/${encodeURIComponent(filename)}`;

    // ✅ 写入 img_log（关键）
    const createdAt = nowMs();
    const id = crypto.randomUUID();
    const storedUrl = `/cfile/${fileData.file_id}`; // 内部真实指向

    await insertManageLogSafe(env.IMG, {
      id,
      url: storedUrl,
      provider: "tgchannel",
      filename,
      createdAt,
    });

    return Response.json(
      {
        code: 200,
        id,
        name: filename,
        url: publicUrl,
        provider: "tgchannel",
        referer,
        clientIp,
        createdAt,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (e) {
    return Response.json(
      { status: 500, message: e?.message || String(e), success: false },
      { status: 500, headers: corsHeaders }
    );
  }
}
