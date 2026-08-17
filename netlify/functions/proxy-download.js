// netlify/functions/proxy-download.js
// Sèvè a li menm ki telechaje fichye videyo/mizik la (san limit CORS)
// epi voye l bay navigatè a ak yon antèt ki fòse yon vrè download.
//
// NÒT: Netlify Functions (senkron) gen yon limit repons ~6 MB. Pou fichye
// ki pi gwo pase sa, nou pa ka anvlope tout fichye a nan repons fonksyon
// an. Nan ka sa a, nou di frontend lan pou l telechaje dirèkteman soti nan
// lyen sous la (CDN platfòm nan) — sa retire limit 6 MB la nèt pou gwo
// fichye. (Nou pa itilize rekèt HEAD ankò paske kèk CDN videyo pa reponn
// byen a HEAD; nou tcheke Content-Length dirèkteman nan repons GET la.)

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const mediaUrl = event.queryStringParameters && event.queryStringParameters.url;
  const filename =
    (event.queryStringParameters && event.queryStringParameters.filename) ||
    "download";

  if (!mediaUrl) {
    return { statusCode: 400, body: "Missing 'url' parameter" };
  }

  const MAX_BYTES = 4.2 * 1024 * 1024; // rete anba 6 MB apre base64 (+33%)
  const userAgent =
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

  const tooLargeMarker = () => ({
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tooLargeForProxy: true, directUrl: mediaUrl }),
  });

  try {
    const upstream = await fetch(mediaUrl, { headers: { "User-Agent": userAgent } });

    if (!upstream.ok) {
      return { statusCode: 502, body: "Upstream fetch failed" };
    }

    // Tcheke Content-Length nan antèt repons lan anvan nou li tout kò a.
    const declaredLength = upstream.headers.get("content-length");
    if (declaredLength && parseInt(declaredLength, 10) > MAX_BYTES) {
      if (upstream.body && upstream.body.cancel) {
        upstream.body.cancel().catch(() => {});
      }
      return tooLargeMarker();
    }

    const contentType =
      upstream.headers.get("content-type") || "application/octet-stream";
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Si Content-Length pa t bay yo davans e li rive twò gwo apre kou.
    if (buffer.length > MAX_BYTES) {
      return tooLargeMarker();
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (err) {
    return { statusCode: 500, body: "Server error: " + err.message };
  }
};
