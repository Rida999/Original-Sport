import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import server from "../dist/server/server.js";

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const publicDir = join(process.cwd(), "dist/client");

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
]);

const maybeServeStatic = async (requestPath, response) => {
  const cleanPath = normalize(decodeURIComponent(requestPath)).replace(/^\.\.(\/|$)/, "");
  const filePath = join(publicDir, cleanPath === "/" ? "index.html" : cleanPath);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    response.writeHead(200, {
      "content-type": mimeTypes.get(extname(filePath)) || "application/octet-stream",
      "content-length": fileStat.size,
    });
    createReadStream(filePath).pipe(response);
    return true;
  } catch {
    return false;
  }
};

createServer(async (incoming, outgoing) => {
  try {
    const requestHost = incoming.headers.host || host + ":" + port;
    const url = new URL(incoming.url || "/", "http://" + requestHost);

    if (await maybeServeStatic(url.pathname, outgoing)) return;

    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : incoming,
      duplex: "half",
    });

    const appResponse = await server.fetch(request, {}, {});
    outgoing.writeHead(appResponse.status, Object.fromEntries(appResponse.headers));

    if (!appResponse.body) {
      outgoing.end();
      return;
    }

    const reader = appResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      outgoing.write(Buffer.from(value));
    }
    outgoing.end();
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Internal Server Error");
  }
}).listen(port, host, () => {
  console.log("Original Sport running at http://" + host + ":" + port);
});
