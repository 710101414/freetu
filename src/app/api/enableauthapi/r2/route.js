export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

export async function POST(request) {
  const { env } = getRequestContext();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400", // 24 hours
    "Content-Type": "application/json",
  };

  if (!env.IMGRS) {
    return Response.json(
      {
        status: 500,
        message: `IMGRS is not Set`,
        success: false,
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }

  const req_url = new URL(request.url);

  const ip =
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    request.socket?.remoteAddress;
  const clientIp = ip ? ip.split(",")[0].trim() : "IP not found";
  const Referer = request.headers.get("Referer") || "Referer";

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file) {
    return Response.json(
      {
        status: 400,
        message: "file is required",
        success: false,
      },
      { status: 400, headers: corsHeaders }
    );
  }

  const fileType = file.type || "application/octet-stream";
  const filename = file.name || `file-${Date.now()}`;

  const header = new Headers();
  header.set("content-type", fileType);
  header.set("content-length", `${file.size}`);

  try {
    const object = await env.IMGRS.put(filename, file, {
      httpMetadata: header,
    });

    if (object === null) {
      return Response.json(
        {
          status: 404,
          message: `upload failed`,
          success: false,
        },
        {
          status: 404,
          headers: corsHeaders,
        }
      );
    }

    const imgUrl = `${req_url.origin}/api/rfile/${filename}`;

    const data = {
      url: imgUrl,
      code: 200,
      name: filename,
      id: filename,
    };

    if (!env.IMG) {
      data.env_img = "null";
      return Response.json(
        {
          ...data,
          msg: "1",
        },
        {
          status: 200,
          headers: corsHeaders,
        }
      );
    } else {
      const nowTime = await get_nowTime();

      try {
        const rating_index = await getRating(env, `${imgUrl}`);

        // 原表：imginfo（保持原项目行为）
        await insertImageData(
          env.IMG,
          `/rfile/${filename}`,
          Referer,
          clientIp,
          rating_index,
          nowTime
        );

        // 新表：img_log（用于“管理库”；如果表不存在/字段不匹配，不影响上传）
        await insertManageLogSafe(
          env.IMG,
          filename,
          imgUrl,
          "r2",
          filename,
          Date.now()
        );

        return Response.json(
          {
            ...data,
            msg: "2",
            Referer: Referer,
            clientIp: clientIp,
            rating_index: rating_index,
            nowTime: nowTime,
          },
          {
            status: 200,
            headers: corsHeaders,
          }
        );
      } catch (error) {
        try {
          await insertImageData(
            env.IMG,
            `/rfile/${filename}`,
            Referer,
            clientIp,
            -1,
            nowTime
          );
        } catch (_) {}

        try {
          await insertManageLogSafe(
            env.IMG,
            filename,
            imgUrl,
            "r2",
            filename,
            Date.now()
          );
        } catch (_) {}

        return Response.json(
          {
            msg: error?.message || "error",
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }
    }
  } catch (error) {
    return Response.json(
      {
        status: 500,
        message: ` ${error.message}`,
        success: false,
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}

async function insertImageData(envDb, src, referer, ip, rating, time) {
  try {
    await envDb
      .prepare(
        `INSERT INTO imginfo (url, referer, ip, rating, total, time)
         VALUES ('${src}', '${referer}', '${ip}', ${rating}, 1, '${time}')`
      )
      .run();
  } catch (error) {}
}

async function insertManageLogSafe(envDb, id, url, provider, filename, createdAt) {
  try {
    await envDb
      。prepare(
        `INSERT INTO img_log (id, url, provider, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      。bind(String(id), String(url), String(provider), String(filename), Number(createdAt))
      。run();
  } catch (e) {}
}

async function get_nowTime() {
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
  const timedata = new Date();
  const formattedDate = new Intl.DateTimeFormat("zh-CN", options).format(
    timedata
  );
  return formattedDate;
}

async function getRating(env, url) {
  try {
    const apikey = env.ModerateContentApiKey;
    const ModerateContentUrl = apikey
      ? `https://api.moderatecontent.com/moderate/?key=${apikey}&`
      : "";

    const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : ModerateContentUrl;

    if (ratingApi) {
      const res = await fetch(`${ratingApi}url=${url}`);
      const data = await res.json();
      const rating_index = data.hasOwnProperty("rating_index")
        ? data.rating_index
        : -1;

      return rating_index;
    } else {
      return 0;
    }
  } catch (error) {
    return -1;
  }
}
