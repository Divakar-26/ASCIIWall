// Tiny static server for web/ (no dependencies):  node tools/serve.mjs [port]
// Also serves /api/contributions?user=<login> — fetches that user's public GitHub contribution
// calendar server-side (browsers can't, because of CORS) so the Contribution Garden shows real data.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fromPublicCalendar, fromGraphQL } from "../github/garden.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const cache = new Map(); // login -> { at, body }

async function contributions(res, login) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(login || "")) { res.writeHead(400, { "content-type": "application/json" }).end('{"error":"bad username"}'); return; }
  const key = login.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 3600e3) { res.writeHead(200, { "content-type": "application/json" }).end(hit.body); return; }
  try {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const data = token ? await fromGraphQL(login, token) : await fromPublicCalendar(login);
    const body = JSON.stringify({ user: login, ...data, generated: new Date().toISOString() });
    cache.set(key, { at: Date.now(), body });
    res.writeHead(200, { "content-type": "application/json" }).end(body);
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" }).end(JSON.stringify({ error: String(e.message || e) }));
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/contributions") return contributions(res, url.searchParams.get("user"));
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, "127.0.0.1", () => console.log(`ASCIIWall → http://127.0.0.1:${port}`));
