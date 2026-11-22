/**
 * Local fixture site for end-to-end tests and demos.
 *   node fixtures/server.mjs [port]
 *
 * Serves fixtures/site with {{ORIGIN}}, {{YEAR}} and {{ABOUT_DATE}} substituted, plus
 * synthetic images (a heavy 2400px JPEG hero and small PNGs). Requests whose user agent
 * contains "PerplexityBot" get HTTP 403, to exercise the bot-probe logic.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "site");
const TYPES = { ".html": "text/html; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".js": "text/javascript", ".pdf": "application/pdf" };

function jpeg(width, height, totalBytes) {
  const head = Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // APP0
    0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, // SOF0
  ]);
  const body = Buffer.alloc(Math.max(0, totalBytes - head.length - 2), 0x55);
  return Buffer.concat([head, body, Buffer.from([0xff, 0xd9])]);
}

function png(width, height, totalBytes) {
  const b = Buffer.alloc(totalBytes, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

export async function startFixtureServer(port = 0) {
  const state = {
    /** ISO date used for the About page's dateModified. */
    aboutDate: "2023-01-15",
    /** Every request: path and user agent. */
    log: [],
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const ua = req.headers["user-agent"] ?? "";
    state.log.push({ path: url.pathname, ua, at: Date.now() });
    if (/PerplexityBot/i.test(ua)) {
      res.writeHead(403, { "content-type": "text/plain" }).end("Forbidden");
      return;
    }
    if (url.pathname === "/img/hero.jpg") {
      res.writeHead(200, { "content-type": "image/jpeg" }).end(jpeg(2400, 1600, 310 * 1024));
      return;
    }
    if (/^\/img\/work-\d\.png$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "image/png" }).end(png(600, 400, 12 * 1024));
      return;
    }
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(400).end();
      return;
    }
    try {
      let body = await readFile(file);
      const ext = path.extname(file);
      if ([".html", ".txt", ".xml"].includes(ext)) {
        const origin = `http://${req.headers.host}`;
        body = Buffer.from(
          body
            .toString("utf8")
            .replaceAll("{{ORIGIN}}", origin)
            .replaceAll("{{YEAR}}", String(new Date().getFullYear()))
            .replaceAll("{{ABOUT_DATE}}", state.aboutDate),
        );
      }
      res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/html" }).end("<!doctype html><title>Not found</title><h1>Not found</h1>");
    }
  });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { port: actual } = server.address();
  return {
    url: `http://localhost:${actual}/`,
    state,
    close: () => new Promise((r) => server.close(r)),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startFixtureServer(Number(process.argv[2] ?? 4010));
  console.log(`Fixture site running at ${s.url}`);
}
