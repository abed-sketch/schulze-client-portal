import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist");
function origins(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const u = new URL(s);
      if (u.protocol !== "https:" || u.origin !== s)
        throw new Error("Expected exact HTTPS origin");
      return u.origin;
    });
}
const parents = origins(process.env.FRAME_ANCESTORS);
const api = origins(process.env.API_ORIGIN);
const realtime = origins(process.env.SUPABASE_ORIGIN || "https://zwtmlrzwqnluosrdbjfv.supabase.co");
const connect = [...new Set([...api, ...realtime])];
const csp = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' ${connect.join(" ")} ${realtime.map((origin) => origin.replace(/^https:/, "wss:")).join(" ")}; frame-ancestors ${parents.length ? parents.join(" ") : "'none'"}; base-uri 'none'; form-action 'none'; object-src 'none'`;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
createServer(async (req, res) => {
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(req.method === "HEAD" ? undefined : "ok");
      return;
    }
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!file.startsWith(root + sep) || !mime[extname(file)]) {
      res.writeHead(404);
      res.end();
      return;
    }
    const info = await stat(file);
    if (!info.isFile()) throw new Error();
    res.setHeader("Content-Type", mime[extname(file)]);
    if (pathname.startsWith("/assets/"))
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.writeHead(200);
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(Number(process.env.PORT) || 8080, "0.0.0.0", () =>
  console.log("Portal server ready"),
);
