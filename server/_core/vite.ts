import express, {
  type Express,
  type Request,
  type Response,
} from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import { isRegisteredClientRoute } from "../../shared/client-route-registry";
import viteConfig from "../../vite.config";
import { mountPlatformStaticDocuments } from "./platform-static-documents";

function requestPathname(req: Request): string {
  try {
    return new URL(req.originalUrl, "http://lighthouse.local").pathname;
  } catch {
    return req.originalUrl.split("?")[0] || "/";
  }
}

function rejectUnknownRoute(req: Request, res: Response): boolean {
  const pathname = requestPathname(req);

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    res.status(404).json({
      ok: false,
      error: "not_found",
      path: pathname,
    });
    return true;
  }

  if (!isRegisteredClientRoute(pathname)) {
    res.status(404).type("text/plain").send("Not Found");
    return true;
  }

  return false;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  mountPlatformStaticDocuments(app);

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    if (rejectUnknownRoute(req, res)) return;

    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        'src="/src/main.tsx"',
        'src="/src/main.tsx?v=' + nanoid() + '"'
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Try multiple candidate paths to find the build directory
  const candidates = [
    path.resolve(import.meta.dirname, "public"),
    path.resolve(import.meta.dirname, "../..", "dist", "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "public"),
  ];

  let distPath = candidates[0]; // default fallback
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      distPath = candidate;
      break;
    }
  }

  console.log(
    "[Static] Serving from: " +
      distPath +
      " (exists: " +
      fs.existsSync(distPath) +
      ", has index.html: " +
      fs.existsSync(path.join(distPath, "index.html")) +
      ")",
  );

  if (!fs.existsSync(distPath)) {
    console.error(
      "Could not find the build directory: " +
        distPath +
        ", make sure to build the client first"
    );
  }

  mountPlatformStaticDocuments(app);

  // Serve static with no-cache for HTML to prevent stale deployments
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      }
    }
  }));

  // Only registered SPA routes receive index.html. Unknown API and browser
  // paths get a real 404 instead of an HTML success response.
  app.use("*", (req, res) => {
    if (rejectUnknownRoute(req, res)) return;

    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
