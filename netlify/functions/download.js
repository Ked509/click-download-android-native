// netlify/functions/download.js
// Downloader UNIVÈSÈL: TikTok, Instagram, Facebook, Twitter/X, Threads,
// Pinterest, Douyin, Kuaishou. Detekte platfòm lan otomatikman apati lyen an.

// Chaje btch-downloader avèk pridans: si lib la echwe (pa egzanp Node.js
// twò ansyen sou Netlify), TikTok (ki pa depann de li) dwe kontinye mache.
let btch = null;
let btchLoadError = null;
try {
  btch = require("btch-downloader");
} catch (err) {
  btchLoadError = err.message;
}

// ===== Detekte ki platfòm lyen an soti ladan l =====
function detectPlatform(url) {
  const u = url.toLowerCase();
  if (/tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com/.test(u)) return "tiktok";
  if (/instagram\.com/.test(u)) return "instagram";
  if (/facebook\.com|fb\.watch/.test(u)) return "facebook";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/twitter\.com|x\.com/.test(u)) return "twitter";
  if (/threads\.net/.test(u)) return "threads";
  if (/douyin\.com/.test(u)) return "douyin";
  if (/kuaishou\.com/.test(u)) return "kuaishou";
  if (/pinterest\.com|pin\.it/.test(u)) return "pinterest";
  return null;
}

// ===== Jwenn premye videyo/lyen ki sanble ak yon videyo nan yon objè/tablo =====
// Diferan lib "reverse-engineered" sa yo pa toujou retounen menm fòm JSON nan,
// kidonk nou chèche plizyè non chan posib olye nou sipoze yon sèl fòma fiks.
const VIDEO_KEYS = ["url", "video", "video_hd", "video_sd", "hd", "sd", "play", "download_url", "downloadUrl", "mp4"];
const AUDIO_KEYS = ["audio", "music", "mp3", "audio_url"];
const THUMB_KEYS = ["thumbnail", "cover", "image", "thumb"];

// Plan B: si okenn non chan konni pa jwenn anyen, chèche nenpòt valè tèks
// ki sanble ak yon lyen (kòmanse ak http) ki pa deja itilize kòm foto
// kouvèti a — sa ede lè lib la itilize yon non chan nou pa t prevwa.
function findAnyUrlFallback(item, excludeKeys) {
  if (!item || typeof item !== "object") return null;
  for (const k of Object.keys(item)) {
    if (excludeKeys.includes(k)) continue;
    const v = item[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

function pickFirst(obj, keys) {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    const v = obj[k];
    if (!v) continue;
    if (typeof v === "string") return v;
    if (Array.isArray(v) && v.length) {
      const first = v[0];
      if (typeof first === "string") return first;
      if (first && typeof first === "object") {
        const nested = pickFirst(first, VIDEO_KEYS.concat(["url"]));
        if (nested) return nested;
      }
    }
  }
  return null;
}

// Anpil nan lib sa yo vlope rezilta a nan yon objè tankou
// { status, result: [...] } oswa { status, data: [...] } olye yo retounen
// tablo/objè a dirèkteman — nou dezanvlope l anvan nou chèche chan yo.
function unwrapRaw(raw) {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.result !== undefined) return raw.result;
    if (raw.data !== undefined) return raw.data;
  }
  return raw;
}

function normalizeResult(platform, rawInput) {
  const raw = unwrapRaw(rawInput);
  const item = Array.isArray(raw) ? raw[0] : raw;
  if (!item) return null;

  const video = pickFirst(item, VIDEO_KEYS) || findAnyUrlFallback(item, THUMB_KEYS.concat(AUDIO_KEYS));
  const music = pickFirst(item, AUDIO_KEYS);
  const cover = pickFirst(item, THUMB_KEYS);
  const title = (typeof item.title === "string" && item.title) ||
                (typeof item.caption === "string" && item.caption) ||
                (typeof item.desc === "string" && item.desc) || "";

  if (!video) return null;

  return {
    success: true,
    platform,
    title,
    author: item.author || item.username || item.developer || "",
    cover: cover || "",
    video_no_watermark: video,
    music: music || "",
    duration: item.duration || 0,
  };
}

exports.handler = async function (event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    let mediaUrl;
    if (event.httpMethod === "GET") {
      mediaUrl = event.queryStringParameters && event.queryStringParameters.url;
    } else {
      const body = JSON.parse(event.body || "{}");
      mediaUrl = body.url;
    }

    if (!mediaUrl) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Ou dwe voye yon lyen videyo (paramèt 'url')" }),
      };
    }
    mediaUrl = mediaUrl.trim();

    const platform = detectPlatform(mediaUrl);

    if (!platform) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "Nou pa rekonèt platfòm lyen sa a. Nou sipòte: TikTok, Instagram, Facebook, YouTube, Twitter/X, Threads, Pinterest, Douyin, Kuaishou.",
        }),
      };
    }

    // ===== TikTok: kontinye pase pa tikwm (deja teste, bay mizik separe) =====
    if (platform === "tiktok") {
      const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(mediaUrl)}`;
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (!data || data.code !== 0 || !data.data) {
        return {
          statusCode: 502,
          body: JSON.stringify({ error: "Pa t kapab jwenn videyo a. Verifye lyen an." }),
        };
      }

      const video = data.data;
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          platform: "tiktok",
          title: video.title || "",
          author: video.author ? video.author.nickname : "",
          cover: video.cover || "",
          video_no_watermark: video.play || "",
          music: video.music || "",
          duration: video.duration || 0,
        }),
      };
    }

    // ===== Lòt platfòm yo: pase pa btch-downloader =====
    if (!btch) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Sèvis ekstraksyon an pa t kapab chaje sou sèvè a (verifye vèsyon Node.js sou Netlify, li dwe v20+): " + btchLoadError,
        }),
      };
    }

    const fnMap = {
      instagram: btch.igdl,
      facebook: btch.fbdown,
      youtube: btch.youtube,
      twitter: btch.twitter,
      threads: btch.threads,
      douyin: btch.douyin,
      kuaishou: btch.kuaishou,
      pinterest: btch.pinterest,
    };

    const fn = fnMap[platform];
    if (!fn) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Platfòm sa a poko disponib." }),
      };
    }

    let raw;
    try {
      raw = await Promise.race([
        fn(mediaUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("TIMEOUT_20S")), 20000)
        ),
      ]);
    } catch (err) {
      if (err.message === "TIMEOUT_20S") {
        return {
          statusCode: 504,
          body: JSON.stringify({
            error: "Sèvis ekstraksyon an pran twò lontan pou reponn (plis pase 20 segond). Eseye ankò, oswa lyen sa a ka prive/pwoblematik.",
          }),
        };
      }
      return {
        statusCode: 502,
        body: JSON.stringify({ error: "Sèvis ekstraksyon an echwe pou lyen sa a: " + err.message }),
      };
    }

    const normalized = normalizeResult(platform, raw);

    if (!normalized) {
      // Mete yon vèsyon kout done brit yo dirèkteman nan mesaj erè a (vizib
      // sou ekran an) pou fasilite debogaj san bezwen konsole navigatè.
      let rawPreview;
      try {
        rawPreview = JSON.stringify(raw).slice(0, 900);
      } catch (e) {
        rawPreview = String(raw).slice(0, 500);
      }
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: "Pa t kapab ekstrè yon lyen videyo klè pou platfòm sa a. DEBUG: " + rawPreview,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(normalized),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erè sèvè: " + err.message }),
    };
  }
};
