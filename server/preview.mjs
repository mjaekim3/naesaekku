// Local UI verification surface. The desktop app uses the same Studio and actions.
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Studio } from "../core/studio.mjs";
import { createActions } from "../desktop/actions.mjs";
const port = Number(process.env.ONGI_PREVIEW_PORT || 8788),
  origin = `http://127.0.0.1:${port}`;
const root = resolve("dist"),
  token = randomBytes(32).toString("hex");
let key = process.env.OPENAI_API_KEY || "";
const studio = await Studio.open({
  dir: resolve(process.env.ONGI_DATA_DIR || ".local-data"),
  getKey: () => key,
});
const actions = createActions({
  studio,
  setKey: async (r) => {
    if (r.remember)
      throw Error(
        "암호화 저장은 데스크탑 앱에서 사용할 수 있어요. 미리보기에서는 저장 옵션을 해제해주세요.",
      );
    key = r.key;
  },
  saveFile: async (out) => ({
    base64: out.buffer.toString("base64"),
    mime: out.mime,
    ext: out.ext,
  }),
});
http
  .createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    if (req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(403);
      return res.end();
    }
    const url = new URL(req.url, origin);
    try {
      if (req.method === "POST" && url.pathname === "/bridge") {
        const provided = Buffer.from(
            (req.headers.cookie || "")
              .split("; ")
              .find((x) => x.startsWith("ongi="))
              ?.slice(5) || "",
          ),
          expected = Buffer.from(token);
        if (
          req.headers.origin !== origin ||
          req.headers["x-ongi-request"] !== "studio" ||
          provided.length !== expected.length ||
          !timingSafeEqual(provided, expected)
        ) {
          res.writeHead(403);
          return res.end("{}");
        }
        let size = 0;
        const parts = [];
        for await (const part of req) {
          size += part.length;
          if (size > 160 * 1024 * 1024) throw Error("파일이 너무 큽니다.");
          parts.push(part);
        }
        const { method, args } = JSON.parse(Buffer.concat(parts));
        if (!Object.hasOwn(actions, method))
          throw Error("지원하지 않는 요청입니다.");
        const data = await actions[method](args);
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ ok: true, data }));
      }
      if (req.method !== "GET") {
        res.writeHead(405);
        return res.end();
      }
      const pathname = decodeURIComponent(url.pathname),
        file = resolve(root, pathname === "/" ? "index.html" : "." + pathname);
      if (!file.startsWith(root + sep)) {
        res.writeHead(403);
        return res.end();
      }
      if (pathname === "/")
        res.setHeader(
          "Set-Cookie",
          `ongi=${token}; HttpOnly; SameSite=Strict; Path=/`,
        );
      const ext = file.split(".").pop();
      res.setHeader(
        "Content-Type",
        {
          html: "text/html; charset=utf-8",
          js: "text/javascript",
          css: "text/css",
          png: "image/png",
          svg: "image/svg+xml",
        }[ext] || "application/octet-stream",
      );
      res.end(await readFile(file));
    } catch (e) {
      res.writeHead(e.code === "ENOENT" ? 404 : 400, {
        "Content-Type": "application/json",
      });
      res.end(
        JSON.stringify({
          ok: false,
          error: e.code ? "파일을 찾을 수 없습니다." : e.message,
        }),
      );
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Ongi preview ${origin}`));
