export const runtime = "edge";
import { getRequestContext } from "@cloudflare/next-on-pages";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400", // 24 hours
  "Content-Type": "application/json",
};

export async function POST(request) {
  const { env } = getRequestContext();

  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) {
    return Response.json(
      {
        status: 500,
        message: `TG_BOT_TOKEN or TG_CHAT_ID is not Set`,
        success: false,
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }

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
  const fileName = file.name || "";

  const req_url = new URL(request.url);

  const fileTypeMap = {
    "image/": { url: "sendPhoto", type: "photo" },
    "video/": { url: "sendVideo", type: "video" },
    "audio/": { url: "sendAudio", type: "audio" },
    "application/pdf": { url: "sendDocument", type: "document" },
  };

  const defaultType = { url: "sendDocument", type: "document" };

  const matchedKey = Object.keys(fileTypeMap).find((key) =>
    fileType.startsWith(key)
  );
  const { url: endpoint, type: fileTypevalue } = matchedKey
    ? fileTypeMap[matchedKey]
    : defaultType;

  const up_url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${endpoint}`;
  const newformData = new FormData();
  newformData.append("chat_id", env.TG_CHAT_ID);
  newformData.append(fileTypevalue, file);

  try {
    const res_img = await fetch(up_url, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
      },
      body: newformData,
    });

    const responseData = await res_img.json();
    const fileData = await getFile(responseData);

    if (!fileData?.file_id) {
      return Response.json(
        {
          status: 500,
          message: "Telegram upload ok but cannot parse file_id",
          success: false,
          raw: responseData,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    const imgUrl = `${req_url.origin}/api/cfile/${fileData.file_id}`;

    const data = {
      url: imgUrl,
      code: 200,
      name: fileData.file_name,
      id: fileData.file_id,
    };

    // 没绑定 D1（env.IMG）就只返回 URL（保持原逻辑）
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
    }

    // 绑定了 D1：写入记录（保持原有 imginfo 表写入 + 额外写入 img_log 表用于“管理库”）
    const nowTime = await get_nowTime();

    try {
      const rating_index = await getRating(env, `${fileData.file_id}`);

      // 原表：imginfo（保持原项目行为）
      await insertImageData(
        env.IMG,
        `/cfile/${fileData.file_id}`,
        Referer,
        clientIp,
        rating_index,
        nowTime
      );

      // 新表：img_log（用于“管理已上传图片”；如果你还没建表，会被 try/catch 吞掉，不影响上传）
      await insertManageLogSafe(
        env.IMG,
        fileData.file_id,
        imgUrl,
        "tgchannel",
        fileName || fileData.file_name || "",
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
      // 兜底：即使评级失败，也至少写入 imginfo（rating=-1）
      try {
        await insertImageData(
          env.IMG,
          `/cfile/${fileData.file_id}`,
          Referer,
          clientIp,
          -1,
          nowTime
        );
      } catch (_) {}

      // 兜底：尽力写入管理日志
      try {
        await insertManageLogSafe(
          env.IMG,
          fileData.file_id,
          imgUrl,
          "tgchannel",
          fileName || fileData.file_name || "",
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

async function getFile_path(env, file_id) {
  try {
    const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/getFile?file_id=${file_id}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome",
      },
    });

    const responseData = await res.json();

    if (responseData.ok) {
      return responseData.result.file_path;
    }
    return "error";
  } catch (error) {
    return "error";
  }
}

const getFile = async (response) => {
  try {
    if (!response?.ok) return null;

    const getFileDetails = (file) => ({
      file_id: file.file_id,
      file_name: file.file_name || file.file_unique_id,
    });

    if (response.result?.photo) {
      const largestPhoto = response.result.photo.reduce((prev, current) =>
        prev.file_size > current.file_size ? prev : current
      );
      return getFileDetails(largestPhoto);
    }

    if (response.result?.video) {
      return getFileDetails(response.result.video);
    }

    if (response.result?.document) {
      return getFileDetails(response.result.document);
    }

    return null;
  } catch (error) {
    console.error("Error getting file id:", error.message);
    return null;
  }
};

async function insertImageData(envDb, src, referer, ip, rating, time) {
  try {
    // 保持你原来的 SQL 拼接风格（不改表结构、不改字段名）
    await envDb
      .prepare(
        `INSERT INTO imginfo (url, referer, ip, rating, total, time)
         VALUES ('${src}', '${referer}', '${ip}', ${rating}, 1, '${time}')`
      )
      .run();
  } catch (error) {
    // 静默
  }
}

async function insertManageLogSafe(envDb, id, url, provider, filename, createdAt) {
  try {
    // 这个表用于“管理库”；如果表不存在/字段不匹配，不影响主流程
    await envDb
      .prepare(
        `INSERT INTO img_log (id, url, provider, filename, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(String(id), String(url), String(provider), String(filename), Number(createdAt))
      .run();
  } catch (e) {
    // 静默
  }
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
  return new Intl.DateTimeFormat("zh-CN", options).format(timedata);
}

async function getRating(env, url) {
  try {
    const file_path = await getFile_path(env, url);

    const apikey = env.ModerateContentApiKey;
    const ModerateContentUrl = apikey
      ? `https://api.moderatecontent.com/moderate/?key=${apikey}&`
      : "";

    const ratingApi = env.RATINGAPI ? `${env.RATINGAPI}?` : ModerateContentUrl;

    if (ratingApi) {
      const res = await fetch(
        `${ratingApi}url=https://api.telegram.org/file/bot${env.TG_BOT_TOKEN}/${file_path}`
      );
      const data = await res.json();
      const rating_index = data.hasOwnProperty("rating_index")
        ? data.rating_index
        : -1;

      return rating_index;
    }
    return 0;
  } catch (error) {
    return -1;
  }
}
