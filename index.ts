import { serve } from "bun";
import { join, resolve, sep } from "path";

const PORT = 3001;
const ROOT = import.meta.dir;

const server = serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname: string;

    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    // The dev server compiles the game on request, so a reload is enough
    // to see source changes.
    if (pathname === "/bundle.js") {
      const result = await Bun.build({
        entrypoints: [join(ROOT, "src", "game.ts")],
        target: "browser",
        sourcemap: "inline",
      });

      if (result.success && result.outputs.length > 0) {
        return new Response(await result.outputs[0].text(), {
          headers: { "Content-Type": "application/javascript" },
        });
      }

      return new Response("Build failed", { status: 500 });
    }

    const relativePath = pathname.replace(/^\/+/, "") || "index.html";
    const filePath = resolve(ROOT, relativePath);

    if (filePath !== ROOT && !filePath.startsWith(ROOT + sep)) {
      return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Tetris running at http://localhost:${PORT}`);
