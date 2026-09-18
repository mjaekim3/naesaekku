const {
  app,
  BrowserWindow,
  screen,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  protocol,
  net,
  session,
  powerMonitor,
  dialog,
} = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const title = "내새꾸, 내곁에";
const smoke =
  process.argv.includes("--pet-smoke") || process.argv.includes("--smoke");
app.setPath(
  "userData",
  process.env.ONGI_DATA_DIR
    ? path.resolve(process.env.ONGI_DATA_DIR)
    : path.join(app.getPath("appData"), "Ongi Studio"),
);
app.setName(title);
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
let pet,
  tray,
  model,
  timer,
  smokeTimeout,
  quitting = false,
  visible = true,
  suspended = false,
  ready = false,
  ignored = true,
  menuOpen = false,
  last = Date.now(),
  lastView = "",
  lastBounds = "",
  saveChain = Promise.resolve();
const root = path.resolve(__dirname, "../dist");
const dir = app.getPath("userData");
let updates;
async function updateAction() {
  const state = updates.status.state;
  if (state === "unconfigured") {
    await dialog.showMessageBox({
      type: "info",
      title,
      message: "로컬 시제품이에요.",
      detail: "GitHub 배포 저장소가 연결되면 이 메뉴에서 업데이트할 수 있어요.",
    });
  } else if (state === "available") {
    await updates.download();
  } else if (state === "ready") {
    const result = await dialog.showMessageBox({
      type: "question",
      title,
      message: "새 버전을 설치하고 다시 시작할까요?",
      buttons: ["설치하고 다시 시작", "나중에"],
      defaultId: 1,
      cancelId: 1,
    });
    if (result.response === 0) {
      await save();
      quitting = true;
      clearTimeout(timer);
      updates.install();
    }
  } else await updates.check();
}
function updateLabel() {
  const s = updates?.status || { state: "idle" };
  return (
    {
      checking: "업데이트 확인 중…",
      available: `새 버전 ${s.version} 다운로드`,
      downloading: `업데이트 다운로드 중 · ${s.percent}%`,
      ready: "업데이트 설치하고 다시 시작",
      current: "최신 버전이에요 · 다시 확인",
      error: "연결 실패 · 업데이트 다시 확인",
    }[s.state] || "업데이트 확인"
  );
}
function save() {
  const value = JSON.stringify(model.snapshot());
  saveChain = saveChain
    .catch(() => {})
    .then(async () => {
      const tmp = path.join(dir, "pet-state.tmp");
      await fs.writeFile(tmp, value);
      await fs.rename(tmp, path.join(dir, "pet-state.json"));
    })
    .catch(() => {});
  return saveChain;
}
function sendView(force = false) {
  if (!ready) return;
  const view = model.view(),
    key = JSON.stringify(view);
  if (force || key !== lastView) {
    lastView = key;
    pet.webContents.send("pet:view", view);
  }
}
function position() {
  const x = Math.round(model.x),
    y = Math.round(model.y),
    key = `${x},${y}`;
  if (key !== lastBounds) {
    lastBounds = key;
    pet.setPosition(x, y, false);
  }
}
function ignore(value) {
  if (value !== ignored) {
    ignored = value;
    pet.setIgnoreMouseEvents(value, { forward: true });
  }
}
function show() {
  visible = true;
  ignore(true);
  pet.showInactive();
  last = Date.now();
  sendView(true);
  refreshTray();
}
function hide() {
  if (model.state === "drag") model.endDrag();
  visible = false;
  pet.hide();
  save();
  refreshTray();
}
function act(action) {
  model.act(action);
  sendView(true);
  save();
  refreshTray();
}
function items() {
  return [
    { label: "터치 · 내새꾸, 내곁에", enabled: false },
    { type: "separator" },
    {
      label: visible ? "잠시 숨기기" : "터치 만나기",
      click: () => (visible ? hide() : show()),
    },
    {
      label: "쓰다듬기",
      click: () => {
        show();
        act("pet");
      },
    },
    {
      label: "간식 주기",
      click: () => {
        show();
        act("eat");
      },
    },
    {
      label: model.state === "sleep" ? "깨우기" : "잠자기",
      click: () => act(model.state === "sleep" ? "wake" : "sleep"),
    },
    {
      label: "자유롭게 걷기",
      type: "checkbox",
      checked: model.roaming,
      click: () => act(model.roaming ? "pause" : "walk"),
    },
    { type: "separator" },
    {
      label: "화면으로 데려오기",
      submenu: screen.getAllDisplays().map((d, i) => ({
        label: `모니터 ${i + 1} · ${d.label || `${d.size.width} × ${d.size.height}`}`,
        click: () => {
          const a = d.workArea;
          model.x = a.x + a.width / 2 - 110;
          model.y = a.y + a.height - 254;
          model.updateDisplays(screen.getAllDisplays());
          model.act("wake");
          position();
          save();
          show();
        },
      })),
    },
    {
      label: "사용 방법",
      click: () => {
        show();
        pet.webContents.send(
          "pet:message",
          "드래그로 다른 화면에 · 클릭하면 쓰다듬기",
        );
      },
    },
    { type: "separator" },
    {
      label: updateLabel(),
      enabled: !["checking", "downloading"].includes(updates?.status.state),
      click: () => updateAction().catch(() => {}),
    },
    { label: `버전 ${app.getVersion()} · 터치 시제품`, enabled: false },
    { label: "종료", click: () => app.quit() },
  ];
}
function refreshTray() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(items()));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (pet) show();
  });
  app
    .whenReady()
    .then(async () => {
      const { PetModel, hitAlpha, FRAME_COUNT } =
        await import("../core/pet.mjs");
      const { createUpdates } = await import("../core/updates.mjs");
      const { autoUpdater } = require("electron-updater");
      let configured = false;
      if (app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE && !smoke) {
        configured = await fs
          .access(path.join(process.resourcesPath, "app-update.yml"))
          .then(
            () => true,
            () => false,
          );
      }
      updates = createUpdates({
        updater: autoUpdater,
        enabled: configured,
        changed: refreshTray,
      });
      await fs.mkdir(dir, { recursive: true });
      let saved = {};
      try {
        saved = JSON.parse(
          await fs.readFile(path.join(dir, "pet-state.json"), "utf8"),
        );
      } catch {}
      const primary = screen.getPrimaryDisplay().id;
      const displays = screen
        .getAllDisplays()
        .sort((a, b) => Number(b.id === primary) - Number(a.id === primary));
      model = new PetModel({
        displays,
        x: saved.x,
        y: saved.y,
        roaming: saved.roaming,
      });
      const masks = await fs.readFile(path.join(root, "pet/alpha.bin"));
      if (masks.length !== FRAME_COUNT * 192 * 192)
        throw Error("Invalid sprite alpha masks");
      protocol.handle("app", (request) => {
        const url = new URL(request.url);
        if (url.host !== "pet")
          return new Response("Forbidden", { status: 403 });
        let file;
        try {
          file = path.resolve(root, "." + decodeURIComponent(url.pathname));
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        if (!file.startsWith(root + path.sep))
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).href);
      });
      session.defaultSession.setPermissionRequestHandler((_w, _p, cb) =>
        cb(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      pet = new BrowserWindow({
        width: 220,
        height: 230,
        x: Math.round(model.x),
        y: Math.round(model.y),
        transparent: true,
        frame: false,
        hasShadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        show: false,
        backgroundColor: "#00000000",
        title,
        icon: path.join(__dirname, "../assets/icon.png"),
        webPreferences: {
          preload: path.join(__dirname, "pet-preload.cjs"),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      });
      pet.setIgnoreMouseEvents(true, { forward: true });
      pet.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      pet.webContents.on("will-navigate", (event) => event.preventDefault());
      pet.webContents.on("will-attach-webview", (event) =>
        event.preventDefault(),
      );
      pet.on("close", (event) => {
        if (!quitting) {
          event.preventDefault();
          hide();
        }
      });
      const trusted = (e) =>
        e.sender === pet.webContents &&
        e.senderFrame === pet.webContents.mainFrame &&
        e.senderFrame.url === "app://pet/pet.html";
      ipcMain.handle("pet:ready", (e) => {
        if (!trusted(e)) throw Error("Forbidden");
        ready = true;
        return { view: model.view() };
      });
      ipcMain.on("pet:drag-start", (e) => {
        if (!trusted(e) || !visible || menuOpen) return;
        model.beginDrag(screen.getCursorScreenPoint());
        ignore(false);
        sendView(true);
      });
      function endDrag() {
        if (model.state !== "drag") return;
        const clicked = !model.dragMoved;
        model.endDrag();
        if (clicked) model.act("pet");
        position();
        save();
        sendView(true);
      }
      ipcMain.on("pet:drag-end", (e) => {
        if (trusted(e)) endDrag();
      });
      ipcMain.on("pet:menu", (e) => {
        if (!trusted(e)) return;
        endDrag();
        menuOpen = true;
        ignore(false);
        Menu.buildFromTemplate(items()).popup({
          window: pet,
          callback: () => {
            menuOpen = false;
            last = Date.now();
          },
        });
      });
      function recoverDisplays() {
        endDrag();
        model.updateDisplays(screen.getAllDisplays());
        position();
        save();
        refreshTray();
      }
      screen.on("display-added", recoverDisplays);
      screen.on("display-removed", recoverDisplays);
      screen.on("display-metrics-changed", recoverDisplays);
      powerMonitor.on("suspend", () => {
        suspended = true;
        endDrag();
        save();
      });
      powerMonitor.on("resume", () => {
        suspended = false;
        last = Date.now();
        recoverDisplays();
      });
      powerMonitor.on("lock-screen", () => {
        suspended = true;
      });
      powerMonitor.on("unlock-screen", () => {
        suspended = false;
        last = Date.now();
      });
      tray = new Tray(
        nativeImage
          .createFromPath(path.join(__dirname, "../assets/icon.png"))
          .resize({ width: 24, height: 24 }),
      );
      tray.setToolTip(title + " · 터치");
      tray.on("click", () => (visible ? hide() : show()));
      refreshTray();
      function loop() {
        if (quitting) return;
        const now = Date.now(),
          delta = now - last;
        last = now;
        if (ready && visible && !suspended && !menuOpen) {
          const cursor = screen.getCursorScreenPoint();
          if (model.state === "drag") model.dragTo(cursor);
          else model.tick(delta);
          position();
          sendView();
          const view = model.view(),
            bounds = pet.getBounds();
          const alpha = masks.subarray(
            view.frame * 192 * 192,
            (view.frame + 1) * 192 * 192,
          );
          const onPet = hitAlpha(
            alpha,
            192,
            192,
            cursor.x - bounds.x - 14,
            cursor.y - bounds.y - 34,
            view.mirrored,
          );
          ignore(model.state !== "drag" && !onPet);
        }
        timer = setTimeout(
          loop,
          !visible || suspended ? 1000 : model.state === "sleep" ? 100 : 33,
        );
      }
      // Smoke mode exercises the real renderer and native window on attached displays.
      const smokeStates = new Set();
      let probing = false;
      ipcMain.on("pet:painted", async (e, data) => {
        if (!trusted(e) || !smoke || data?.frames !== FRAME_COUNT || !ready)
          return;
        smokeStates.add(data.state);
        if (probing) return;
        probing = true;
        try {
          const monitors = [];
          for (const d of screen.getAllDisplays()) {
            const a = d.workArea;
            model.beginDrag({ x: model.x, y: model.y });
            model.dragTo({ x: a.x + 60, y: a.y + 80 });
            model.endDrag();
            position();
            monitors.push({
              id: d.id,
              scaleFactor: d.scaleFactor,
              workArea: a,
              bounds: pet.getBounds(),
              selected: model.displayId,
            });
          }
          for (const action of ["walk", "eat", "sleep", "pet", "wake"]) {
            model.act(action);
            sendView(true);
            await new Promise((r) => setTimeout(r, 120));
          }
          await fs.writeFile(
            path.join(dir, "pet-preview.png"),
            (await pet.webContents.capturePage()).toPNG(),
          );
          await fs.writeFile(
            path.join(dir, "pet-smoke.json"),
            JSON.stringify(
              {
                ready: true,
                frames: data.frames,
                states: [...smokeStates],
                monitors,
                transparent: pet.getBackgroundColor(),
                alwaysOnTop: pet.isAlwaysOnTop(),
                sandbox: pet.webContents.getLastWebPreferences().sandbox,
              },
              null,
              2,
            ),
          );
          clearTimeout(smokeTimeout);
          app.quit();
        } catch (error) {
          console.error(error);
          app.exit(2);
        }
      });
      await pet.loadURL("app://pet/pet.html");
      if (!smoke) {
        show();
        pet.webContents.send(
          "pet:message",
          "터치예요. 드래그로 원하는 화면에 놓아주세요.",
        );
        loop();
      } else smokeTimeout = setTimeout(() => app.exit(2), 15000);
    })
    .catch((error) => {
      console.error(error);
      if (!smoke)
        dialog.showErrorBox(
          title,
          "터치를 불러오지 못했어요. 실행 파일을 다시 열어주세요.",
        );
      app.exit(1);
    });
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    clearTimeout(timer);
    clearTimeout(smokeTimeout);
    if (model) {
      event.preventDefault();
      save().finally(() => app.quit());
    }
  });
  app.on("window-all-closed", () => {
    if (quitting) app.quit();
  });
}
