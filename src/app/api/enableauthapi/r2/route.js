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

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.IMGRS) {
    return Response.json(
      { status: 500, message: "IMGRS is not Set", success: false },
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
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json(
      { status: 400, message: "file is required", success: false },
      { status: 400, headers: corsHeaders }
    );
  }

  const filename = safeFilename(file.name);
  const contentType = file.type || "application/octet-stream";

  try {
    const putRes = await env.IMGRS.put(filename, file, {
      httpMetadata: { contentType },
    });

    if (!putRes) {
      return Response.json(
        { status: 500, message: "R2 put failed", success: false },
        { status: 500, headers: corsHeaders }
      );
    }

    // ✅ 对外统一 /api/p/<filename>
    const publicUrl = `${reqUrl.origin}/api/p/${encodeURIComponent(filename)}`;

    // ✅ 写入 img_log（关键）
    const createdAt = nowMs();
    const id = crypto.randomUUID();
    const storedUrl = `/rfile/${filename}`;

    await insertManageLogSafe(env.IMG, {
      id,
      url: storedUrl,
      provider: "r2",
      filename,
      createdAt,
    });

    return Response.json(
      {
        code: 200,
        id,
        name: filename,
        url: publicUrl,
        provider: "r2",
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
