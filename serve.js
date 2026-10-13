const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const ROOT_DIR = __dirname;
const REMOTE_BASE = "https://pand-gthb.github.io/initialdac-round-data-auto-json-00";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  // CORSヘッダー付与
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Cache-Control, Pragma, Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const localFilePath = path.join(ROOT_DIR, safePath);

  // ローカルファイルが存在すればローカルから配信
  if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
    const ext = path.extname(localFilePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(localFilePath).pipe(res);
    return;
  }

  // ローカルにないファイル（生成JSON等）はGitHub Pagesからプロキシ取得
  const remoteUrl = `${REMOTE_BASE}${pathname}${reqUrl.search}`;
  try {
    const remoteRes = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (InitialDAC-Viewer-DevServer)"
      }
    });

    if (!remoteRes.ok) {
      res.writeHead(remoteRes.status, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Remote fetch failed: ${remoteRes.status} ${remoteRes.statusText}`);
      return;
    }

    const contentType = remoteRes.headers.get("content-type") || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    const buffer = Buffer.from(await remoteRes.arrayBuffer());
    res.end(buffer);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Proxy error: ${err.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`Local Viewer Server running at http://localhost:${PORT}/`);
  console.log(`- Local files served from: ${ROOT_DIR}`);
  console.log(`- Missing files proxied from: ${REMOTE_BASE}`);
});
