const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  session,
  dialog,
  safeStorage,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const smoke = process.argv.includes("--smoke");
if (process.env.ONGI_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.ONGI_DATA_DIR));
else app.setPath("userData", path.join(app.getPath("appData"), "Ongi Studio"));
app.setName("Somewhere, Over the Rainbow Bridge");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
let window, studio, sessionKey, smokeTimer;
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      const { Studio } = await import("../core/studio.mjs");
      const { createActions } = await import("./actions.mjs");
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      const vault = path.join(dir, "api-key.encrypted");
      sessionKey = process.env.OPENAI_API_KEY || "";
      if (!sessionKey && safeStorage.isEncryptionAvailable())
        try {
          sessionKey = safeStorage.decryptString(await fs.readFile(vault));
        } catch {}
      studio = await Studio.open({ dir, getKey: () => sessionKey });
      const actions = createActions({
        studio,
        setKey: async ({ key, remember }) => {
          if (remember && key) {
            if (!safeStorage.isEncryptionAvailable())
              throw Error(
                "이 PC의 암호화 저장소를 사용할 수 없어요. 저장 옵션을 해제해주세요.",
              );
            await fs.writeFile(vault, safeStorage.encryptString(key), {
              mode: 0o600,
            });
          } else await fs.rm(vault, { force: true });
          sessionKey = key;
        },
        saveFile: async (result, request) => {
          const { canceled, filePath } = await dialog.showSaveDialog(window, {
            title: "우리 아이의 모습 저장",
            defaultPath: path.join(
              app.getPath("downloads"),
              `ongi-${request.format}.${result.ext}`,
            ),
            filters: [
              { name: result.ext.toUpperCase(), extensions: [result.ext] },
            ],
          });
          if (canceled || !filePath) return { saved: false };
          await fs.writeFile(filePath, result.buffer);
          return { saved: true };
        },
      });
      const root = path.resolve(__dirname, "../dist");
      protocol.handle("app", (request) => {
        const url = new URL(request.url);
        if (url.host !== "ongi")
          return new Response("Forbidden", { status: 403 });
        let pathname;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const file = path.resolve(
          root,
          pathname === "/" ? "index.html" : "." + pathname,
        );
        if (file !== root && !file.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).href);
      });
      session.defaultSession.setPermissionRequestHandler(
        (_webContents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      window = new BrowserWindow({
        icon: path.join(__dirname, "../assets/icon.png"),
        width: 1440,
        height: 960,
        minWidth: 1020,
        minHeight: 740,
        show: !smoke,
        backgroundColor: "#f8f8f3",
        title: "Somewhere, Over the Rainbow Bridge",
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== "app://ongi/index.html") event.preventDefault();
      });
      window.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      ipcMain.handle("ongi:call", async (event, method, args) => {
        try {
          if (
            event.senderFrame !== window.webContents.mainFrame ||
            event.senderFrame.url !== "app://ongi/index.html"
          )
            throw Error("잘못된 요청입니다.");
          if (!Object.hasOwn(actions, method))
            throw Error("지원하지 않는 요청입니다.");
          const data = await actions[method](args);
          if (smoke && method === "state") {
            clearTimeout(smokeTimer);
            await fs.writeFile(
              path.join(dir, "smoke.json"),
              JSON.stringify(
                {
                  ready: true,
                  rendererLoaded: true,
                  preloadConnected: true,
                  hasKey: data.hasKey,
                  security: {
                    sandbox: true,
                    contextIsolation: true,
                    nodeIntegration: false,
                  },
                },
                null,
                2,
              ),
            );
            setTimeout(() => app.quit(), 200);
          }
          return { ok: true, data };
        } catch (e) {
          return {
            ok: false,
            error: e.code
              ? "파일을 처리하지 못했어요. 파일과 저장 위치를 확인해주세요."
              : e.message,
          };
        }
      });
      window.on("close", async (event) => {
        if (studio.active && !smoke) {
          event.preventDefault();
          const result = await dialog.showMessageBox(window, {
            type: "question",
            message: "아직 그림을 만들고 있어요.",
            detail:
              "지금 종료하면 결과를 저장하지 못할 수 있어요. 처리된 API 요청에는 비용이 발생할 수 있습니다.",
            buttons: ["계속 기다리기", "종료하기"],
            defaultId: 0,
            cancelId: 0,
          });
          if (result.response === 1) {
            studio.cancel(studio.active);
            window.destroy();
            app.quit();
          }
        }
      });
      if (smoke) smokeTimer = setTimeout(() => app.exit(2), 15000);
      await window.loadURL("app://ongi/index.html");
    })
    .catch((error) => {
      console.error("Ongi startup failed:", error.code || error.name);
      app.exit(1);
    });
  app.on("window-all-closed", () => app.quit());
}
