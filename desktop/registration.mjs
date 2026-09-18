import fs from "node:fs/promises";
import path from "node:path";
import { createActions } from "./actions.mjs";

export function createRegistration({
  electron,
  dir,
  preload,
  icon,
  openStudio,
  activatePet,
  onState = () => {},
}) {
  const { BrowserWindow, ipcMain, safeStorage, dialog } = electron;
  let window,
    opening,
    studio,
    sessionKey = "",
    quitting = false;
  async function initialize() {
    await fs.mkdir(dir, { recursive: true });
    const vault = path.join(dir, "api-key.encrypted");
    sessionKey = process.env.OPENAI_API_KEY || "";
    if (!sessionKey && safeStorage.isEncryptionAvailable()) {
      try {
        sessionKey = safeStorage.decryptString(await fs.readFile(vault));
      } catch {}
    }
    const factory =
      openStudio ||
      (async (options) =>
        (await import("../core/studio.mjs")).Studio.open(options));
    studio = await factory({ dir, getKey: () => sessionKey });
    const actions = createActions({
      studio,
      activatePet,
      setKey: async ({ key, remember }) => {
        if (remember && key) {
          if (!safeStorage.isEncryptionAvailable())
            throw Error(
              "암호화 저장소를 사용할 수 없어요. 키 저장 옵션을 해제해주세요.",
            );
          await fs.writeFile(vault, safeStorage.encryptString(key), {
            mode: 0o600,
          });
        } else await fs.rm(vault, { force: true });
        sessionKey = key;
      },
      saveFile: async (result, request) => {
        const selected = await dialog.showSaveDialog(window, {
          title: "캐릭터 저장",
          defaultPath: `naesaekku-${request.format}.${result.ext}`,
          filters: [
            { name: result.ext.toUpperCase(), extensions: [result.ext] },
          ],
        });
        if (selected.canceled || !selected.filePath) return { saved: false };
        await fs.writeFile(selected.filePath, result.buffer);
        return { saved: true };
      },
    });
    window = new BrowserWindow({
      width: 1280,
      height: 900,
      minWidth: 1020,
      minHeight: 740,
      title: "내새꾸 등록하기 · 내새꾸, 내곁에",
      icon,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#f8f8f3",
      webPreferences: {
        preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) =>
      event.preventDefault(),
    );
    ipcMain.handle("ongi:call", async (event, method, args) => {
      try {
        if (
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          event.senderFrame.url !== "app://ongi/index.html"
        )
          throw Error("잘못된 요청입니다.");
        if (!Object.hasOwn(actions, method))
          throw Error("지원하지 않는 요청입니다.");
        const data = await actions[method](args);
        if (method === "state") onState(data, window);
        return { ok: true, data };
      } catch (error) {
        return {
          ok: false,
          error: error.code
            ? "파일을 처리하지 못했어요. 파일과 저장 위치를 확인해주세요."
            : error.message,
        };
      }
    });
    window.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    await window.loadURL("app://ongi/index.html");
    return window;
  }
  return {
    get active() {
      return Boolean(studio?.active);
    },
    allowQuit() {
      quitting = true;
    },
    async open({ hidden = false } = {}) {
      if (!opening) opening = initialize();
      const w = await opening;
      if (!hidden) {
        if (w.isMinimized()) w.restore();
        w.show();
        w.focus();
      }
      return w;
    },
  };
}
