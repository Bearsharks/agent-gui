import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { createServer as createViteServer } from "vite";
import path from "node:path";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createApi } from "./http/api";
import { createMcpHttpRoutes } from "./mcp/httpTools";

const app = new Hono();
app.route("/", createApi());
app.route("/", createMcpHttpRoutes());
const honoListener = getRequestListener(app.fetch);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const reviewRoot = path.join(repoRoot, "apps/review-web");
const prototypeRoot = path.join(repoRoot, "apps/prototype-runtime");

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/api/") || url.startsWith("/events/") || url.startsWith("/mcp")) {
    void honoListener(req, res);
    return;
  }
  if (url.startsWith("/prototype/")) {
    void serveIndex(req.url ?? "/", prototypeRoot, prototypeVite, res);
    return;
  }
  if (url.startsWith("/prototype-vite/")) {
    prototypeVite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Prototype asset not found");
    });
    return;
  }
  if (url.startsWith("/sessions/")) {
    void serveIndex(req.url ?? "/", reviewRoot, reviewVite, res);
    return;
  }
  if (
    url.startsWith("/sessions/") ||
    url === "/" ||
    url.startsWith("/src/") ||
    url.startsWith("/@vite/") ||
    url.startsWith("/@fs/") ||
    url.startsWith("/node_modules/")
  ) {
    if (url.startsWith("/sessions/")) req.url = "/";
    reviewVite.middlewares(req, res, () => {
      res.statusCode = 404;
      res.end("Review route not found");
    });
    return;
  }
  res.statusCode = 404;
  res.end("Not found");
});

const reviewVite = await createViteServer({
  root: reviewRoot,
  server: { middlewareMode: true, hmr: { server } },
  appType: "spa",
});

const prototypeVite = await createViteServer({
  root: prototypeRoot,
  base: "/prototype-vite/",
  server: { middlewareMode: true, hmr: { server } },
  appType: "spa",
});

server.listen(8787, () => {
  console.log("agent-gui server listening on http://localhost:8787");
});

async function serveIndex(url: string, root: string, vite: Awaited<ReturnType<typeof createViteServer>>, res: import("node:http").ServerResponse) {
  try {
    const html = await readFile(path.join(root, "index.html"), "utf8");
    const transformed = await vite.transformIndexHtml(url, html);
    res.statusCode = 200;
    res.setHeader("content-type", "text/html");
    res.end(transformed);
  } catch (error) {
    vite.ssrFixStacktrace(error as Error);
    res.statusCode = 500;
    res.end(String(error));
  }
}
