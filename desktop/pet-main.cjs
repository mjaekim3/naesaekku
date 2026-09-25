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
const overlaySmoke = process.argv.includes("--overlay-smoke");
if (overlaySmoke && !process.env.ONGI_DATA_DIR)
  throw Error("Overlay smoke requires an isolated ONGI_DATA_DIR");
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
let registration;
let currentPack = null;
let changePet;
// The built-in Nerburi runs as a full work-area overlay (see
// src/neoburie/main.js); registered pets keep the 220 × 230 window.
let overlay = false,
  overlayPlace = null,
  hoverWanted = false,
  lastCursor = "";
const petName = () => currentPack?.manifest.name || "너부리";
// Every pet runs in the work-area overlay: the built-in Nerburi page, or the
// companion page for registered packs. Smoke tests keep the small window.
const overlayWanted = () => !smoke;
const nerburiShown = () => overlay && !currentPack;
const pageURL = () =>
  !overlay
    ? "app://pet/pet.html"
    : currentPack
      ? "app://pet/companion.html"
      : "app://pet/neoburie.html";
const command = (name) => {
  if (ready && overlay) pet.webContents.send("pet:command", name);
};
function overlayDisplay() {
  const displays = screen.getAllDisplays();
  return (
    displays.find((d) => d.id === overlayPlace?.displayId) ||
    screen.getPrimaryDisplay()
  );
}
function applyWindowMode() {
  overlay = overlayWanted();
  lastBounds = "";
  lastCursor = "";
  hoverWanted = false;
  if (overlay) {
    const d = overlayDisplay();
    if (overlayPlace?.displayId !== d.id) overlayPlace = { displayId: d.id };
    pet.setBounds(d.workArea, false);
  } else
    pet.setBounds(
      {
        x: Math.round(model.x),
        y: Math.round(model.y),
        width: 220,
        height: 230,
      },
      false,
    );
}
const registrationSmoke = process.argv.includes("--registration-smoke");
async function openRegistration() {
  try {
    await registration.open();
  } catch {
    dialog.showErrorBox(
      title,
      "사진 등록 화면을 열지 못했어요. 앱을 다시 시작해주세요.",
    );
  }
}
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
  const value = JSON.stringify({
    ...model.snapshot(),
    petId: currentPack?.manifest.id || null,
    neoburie: overlayPlace,
  });
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
  if (overlay) return;
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
  command("rehover");
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
  // The overlay page owns the live pet; the main model only keeps settings.
  if (overlay) command(action === "walk" ? "roam" : action);
  sendView(true);
  save();
  refreshTray();
}
function items() {
  return [
    { label: `${petName()} · 내새꾸, 내곁에`, enabled: false },
    { type: "separator" },
    { label: "내새꾸 등록하기 · 사진으로 만들기", click: openRegistration },
    {
      label: "기본 너부리로 돌아가기",
      visible: !!currentPack,
      click: () => changePet(null).catch(() => {}),
    },
    {
      label: visible ? "잠시 숨기기" : `${petName()} 만나기`,
      click: () => (visible ? hide() : show()),
    },
    {
      label: model.greetingEnabled ? "반겨주기" : "쓰다듬기",
      visible: !nerburiShown(),
      click: () => {
        show();
        act("pet");
      },
    },
    {
      label: "간식 주기",
      visible: !nerburiShown() && !model.greetingEnabled,
      click: () => {
        show();
        act("eat");
      },
    },
    {
      label: sleeping() ? "깨우기" : "잠자기",
      click: () => act(sleeping() ? "wake" : "sleep"),
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
          if (overlay) {
            overlayPlace = { displayId: d.id };
            applyWindowMode();
            command("arrive");
            save();
            show();
            return;
          }
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
          nerburiShown()
            ? "오른쪽 클릭하면 그 자리에서 자요 · 클릭하면 깨요"
            : model.greetingEnabled
              ? "드래그로 다른 화면에 · 클릭하면 반겨줘요"
              : "드래그로 다른 화면에 · 클릭하면 쓰다듬기",
        );
      },
    },
    { type: "separator" },
    {
      label: updateLabel(),
      enabled: !["checking", "downloading"].includes(updates?.status.state),
      click: () => updateAction().catch(() => {}),
    },
    { label: `버전 ${app.getVersion()}`, enabled: false },
    { label: "종료", click: () => app.quit() },
  ];
}
function sleeping() {
  return overlay ? !!overlayPlace?.sleeping : model.state === "sleep";
}
function refreshTray() {
  if (tray) tray.setContextMenu(Menu.buildFromTemplate(items()));
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--studio") && registration) {
      openRegistration();
      return;
    }
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
      if (saved.neoburie && Number.isFinite(saved.neoburie.displayId))
        overlayPlace = saved.neoburie;
      let masks = await fs.readFile(path.join(root, "pet/alpha.bin"));
      const { loadPetPack, validPackId } = await import("../core/pet-pack.mjs");
      if (saved.petId) {
        try {
          currentPack = await loadPetPack(dir, saved.petId);
          masks = currentPack.alpha;
        } catch {
          currentPack = null;
        }
      }
      model.greetingEnabled = currentPack?.manifest.sheetFormat === "companion-v1";
      model.liftEnabled = currentPack
        ? ["lift-v2", "companion-v1"].includes(currentPack.manifest.sheetFormat)
        : true;
      if (masks.length !== FRAME_COUNT * 192 * 192)
        throw Error("Invalid sprite alpha masks");
      protocol.handle("app", (request) => {
        const url = new URL(request.url);
        if (!["pet", "ongi"].includes(url.host))
          return new Response("Forbidden", { status: 403 });
        if (url.pathname.startsWith("/packs/")) {
          const match = /^\/packs\/([a-f0-9-]{36})\/(\d{1,2})\.png$/.exec(
            url.pathname,
          );
          if (!match || !validPackId(match[1]) || Number(match[2]) >= 20)
            return new Response("Forbidden", { status: 403 });
          return net.fetch(
            pathToFileURL(path.join(dir, "pets", match[1], match[2] + ".png"))
              .href,
          );
        }
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
      const { createRegistration } = await import("./registration.mjs");
      changePet = async (id) => {
        const pack = id ? await loadPetPack(dir, id) : null;
        const nextMasks =
          pack?.alpha || (await fs.readFile(path.join(root, "pet/alpha.bin")));
        if (model.state === "drag") model.endDrag();
        currentPack = pack;
        model.greetingEnabled = pack?.manifest.sheetFormat === "companion-v1";
        model.liftEnabled = pack
          ? ["lift-v2", "companion-v1"].includes(pack.manifest.sheetFormat)
          : true;
        masks = nextMasks;
        model.act("wake");
        ready = false;
        lastView = "";
        await save();
        tray.setToolTip(title + " · " + petName());
        applyWindowMode();
        await pet.loadURL(pageURL());
        show();
      };
      registration = createRegistration({
        electron: require("electron"),
        dir,
        preload: path.join(__dirname, "preload.cjs"),
        icon: path.join(__dirname, "../assets/icon.png"),
        activatePet: changePet,
        beforeDeletePet: async (id) => {
          if (currentPack?.manifest.id === id) await changePet(null);
        },
      });
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
        e.senderFrame.url === pageURL();
      ipcMain.handle("pet:ready", (e) => {
        if (!trusted(e)) throw Error("Forbidden");
        ready = true;
        return {
          place:
            overlay && Number.isFinite(overlayPlace?.x)
              ? {
                  x: overlayPlace.x,
                  y: overlayPlace.y,
                  sleeping: !!overlayPlace.sleeping,
                  anchored: !!overlayPlace.anchored,
                }
              : null,
          roaming: model.roaming,
          liftEnabled: model.liftEnabled,
          greetingEnabled: model.greetingEnabled,
          view: model.view(),
          spriteBase: currentPack
            ? `app://pet/packs/${currentPack.manifest.id}/`
            : "./pet/",
        };
      });
      ipcMain.on("pet:drag-start", (e) => {
        if (!trusted(e) || !visible || menuOpen) return;
        model.beginDrag(screen.getCursorScreenPoint());
        ignore(false);
        sendView(true);
      });
      ipcMain.on("pet:hover", (e, value) => {
        if (!trusted(e) || !overlay) return;
        hoverWanted = value === true;
        if (!menuOpen) ignore(!hoverWanted);
      });
      let placeTimer;
      ipcMain.on("pet:place", (e, value) => {
        if (!trusted(e) || !overlay) return;
        if (!Number.isFinite(value?.x) || !Number.isFinite(value?.y)) return;
        const wasSleeping = sleeping();
        overlayPlace = {
          displayId: overlayDisplay().id,
          x: Math.round(value.x),
          y: Math.round(value.y),
          sleeping: value.sleeping === true,
          anchored: value.anchored === true,
        };
        if (wasSleeping !== sleeping()) refreshTray();
        clearTimeout(placeTimer);
        placeTimer = setTimeout(save, 3000);
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
            if (overlay) {
              ignore(true);
              command("rehover");
            }
          },
        });
      });
      function recoverDisplays() {
        endDrag();
        model.updateDisplays(screen.getAllDisplays());
        if (overlay) applyWindowMode();
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
      tray.setToolTip(title + " · " + petName());
      tray.on("click", () => (visible ? hide() : show()));
      refreshTray();
      function loop() {
        if (quitting) return;
        const now = Date.now(),
          delta = now - last;
        last = now;
        if (ready && visible && !suspended && !menuOpen && overlay) {
          const cursor = screen.getCursorScreenPoint(),
            bounds = pet.getBounds(),
            local = { x: cursor.x - bounds.x, y: cursor.y - bounds.y },
            key = `${local.x},${local.y}`;
          if (key !== lastCursor) {
            lastCursor = key;
            pet.webContents.send("pet:cursor", local);
          }
        } else if (ready && visible && !suspended && !menuOpen) {
          const cursor = screen.getCursorScreenPoint();
          if (model.state === "drag") model.dragTo(cursor);
          model.tick(delta);
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
          !visible || suspended
            ? 1000
            : !overlay && model.state === "sleep"
              ? 100
              : 33,
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
          model.beginDrag({ x: model.x + 110, y: model.y + 90 });
          model.dragTo({ x: model.x + 160, y: model.y + 100 });
          model.tick(33);
          sendView(true);
          await new Promise((r) => setTimeout(r, 120));
          const liftView = model.view();
          await fs.writeFile(
            path.join(dir, "pet-lift.png"),
            (await pet.webContents.capturePage()).toPNG(),
          );
          model.endDrag();
          const landingView = model.view();
          sendView(true);
          await new Promise((r) => setTimeout(r, 120));
          await fs.writeFile(
            path.join(dir, "pet-landing.png"),
            (await pet.webContents.capturePage()).toPNG(),
          );
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
                liftView,
                landingView,
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
      applyWindowMode();
      await pet.loadURL(pageURL());
      if (overlaySmoke) {
        smokeTimeout = setTimeout(() => app.exit(2), 45000);
        const { runOverlaySmoke } = require("./overlay-smoke.cjs");
        await runOverlaySmoke({ pet, dir, command, save, registration, screen });
        clearTimeout(smokeTimeout);
        app.quit();
        return;
      }
      if (registrationSmoke) {
        const w = await registration.open({ hidden: true });
        const photo = await fs.readFile(process.env.REGISTRATION_SMOKE_PHOTO);
        const result = await w.webContents.executeJavaScript(`(async () => {
          const before = await window.ongi.state();
          const imported = await window.ongi.importPhotos([{name:'smoke-photo.jpg', bytes:${JSON.stringify(Array.from(photo))}}]);
          const after = await window.ongi.state();
            const local = await window.ongi.localStatus();
            return {preloadConnected:true, localReady:local.ready, localPanel:document.body.textContent.includes('이 PC에서 만들기'), imported:imported.length, before:before.photos.length, after:after.photos.length, keyExposed:Object.hasOwn(after,'apiKey'), title:document.title};
        })()`);
        let smokePetId = process.env.REGISTRATION_SMOKE_PET_ID;
        if (process.env.MOTION_SMOKE_DIR) {
          const sheets = {};
          for (const action of ["walk", "idle", "sleep", "eat"])
            sheets[action] = (
              await fs.readFile(
                path.join(process.env.MOTION_SMOKE_DIR, action + ".png"),
              )
            ).toString("base64");
          const flow = await w.webContents.executeJavaScript(`(async()=>{
            const wait=ms=>new Promise(r=>setTimeout(r,ms));
            const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait(50);}throw Error('Motion UI timeout');};
            const panel=document.querySelector('.motion-workshop');
            if(!panel)throw Error('Motion workshop missing');
            const name=panel.querySelector('input[aria-label="동작 준비 이름"]');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'동작 가져오기 검증');
            name.dispatchEvent(new Event('input',{bubbles:true}));
            await wait(100);
            const sheets=${JSON.stringify(sheets)};
            const labels={walk:'걷기',idle:'대기·깜빡임',sleep:'수면',eat:'먹기'};
            for(const [action,label] of Object.entries(labels)) {
              [...panel.querySelectorAll('button')].find(b=>b.textContent.startsWith(label+' ')).click();
              await wait(100);
              const input=panel.querySelector('input[type=file]');
              const bytes=Uint8Array.from(atob(sheets[action]),c=>c.charCodeAt(0));
              const transfer=new DataTransfer();transfer.items.add(new File([bytes],action+'.png',{type:'image/png'}));
              input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
              await wait(100);
              await until(()=>[...panel.querySelectorAll('button')].some(b=>b.textContent.includes(label+' 그림 가져오기')&&!b.disabled)&&panel.querySelectorAll('button[aria-label^="'+label+' 프레임"]').length===(action==='walk'?8:2));
            }
            const review=panel.querySelector('.consent input');
            await until(()=>!review.disabled);review.click();
            const save=[...panel.querySelectorAll('button')].find(b=>b.textContent.includes('보관함에 저장'));
            await until(()=>!save.disabled);save.click();
            await until(()=>panel.textContent.includes('아래 미리보기에서'));
            const state=await window.ongi.state();
            const item=state.artworks.find(a=>a.petName==='동작 가져오기 검증');
            if(!item?.hasMotion)throw Error('Motion pack not saved');
            return {id:item.id,reviewed:true,groups:4,prompt:(await window.ongi.motionPrompt({name:'터치',features:'흰 하트',style:'pixel',action:'walk'})).includes('RIGHT')};
          })()`);
          result.motionWorkflow = flow;
          smokePetId = flow.id;
          w.show();
          await w.webContents.executeJavaScript(
            `document.querySelector('img[alt="동작 정렬 미리보기"]').scrollIntoView({block:'center'})`,
          );
          await new Promise((resolve) => setTimeout(resolve, 350));
          await fs.writeFile(
            path.join(dir, "motion-workshop.png"),
            (await w.webContents.capturePage()).toPNG(),
          );
        }
        if (process.env.MANUAL_SMOKE_SHEET) {
          const bytes = Array.from(
            await fs.readFile(process.env.MANUAL_SMOKE_SHEET),
          );
          const imported = await w.webContents.executeJavaScript(
            `window.ongi.importPetSheet({name:'가져오기 검증',file:{name:'sheet.png',bytes:${JSON.stringify(bytes)}}})`,
          );
          smokePetId = imported.id;
          result.manualImport = imported.hasMotion;
          result.promptReady = await w.webContents.executeJavaScript(
            `window.ongi.chatPrompt({name:'터치',features:'흰 하트',style:'pixel'}).then(p=>p.includes('흰 하트') && p.includes('4 columns'))`,
          );
        }
        if (smokePetId) {
          const id = smokePetId;
          result.activation = await w.webContents.executeJavaScript(
            `window.ongi.activatePet(${JSON.stringify(id)})`,
          );
          result.frames = (
            await w.webContents.executeJavaScript(
              `window.ongi.petFrames(${JSON.stringify(id)})`,
            )
          ).length;
          result.petId = currentPack?.manifest.id;
          result.rendered = await pet.webContents.executeJavaScript(
            'document.querySelector("#pet").dataset.state',
          );
          result.saved = JSON.parse(
            await fs.readFile(path.join(dir, "pet-state.json"), "utf8"),
          ).petId;
          result.previewLoaded = await w.webContents
            .executeJavaScript(`new Promise(resolve => {
            const started=Date.now();const timer=setInterval(()=>{
              const image=document.querySelector('img[alt="생성된 동작 미리보기"]');
              if(image?.naturalWidth){clearInterval(timer);resolve(true);}
              else if(Date.now()-started>5000){clearInterval(timer);resolve(false);}
            },50);
          })`);
          await fs.writeFile(
            path.join(dir, "registration-preview.png"),
            (await w.webContents.capturePage()).toPNG(),
          );
          await fs.writeFile(
            path.join(dir, "active-pet.png"),
            (await pet.webContents.capturePage()).toPNG(),
          );
        }
        await fs.writeFile(
          path.join(dir, "registration-smoke.json"),
          JSON.stringify(result, null, 2),
        );
        registration.allowQuit();
        app.quit();
        return;
      }
      if (process.argv.includes("--studio")) await openRegistration();
      if (!smoke) {
        show();
        pet.webContents.send(
          "pet:message",
          overlay
            ? `${petName()}예요. 커서를 가까이 대보거나 들어서 옮겨보세요.`
            : `${petName()}예요. 드래그로 원하는 화면에 놓아주세요.`,
        );
        loop();
      } else smokeTimeout = setTimeout(() => app.exit(2), 15000);
    })
    .catch((error) => {
      console.error(error);
      if (!smoke)
        dialog.showErrorBox(
          title,
          "반려동물을 불러오지 못했어요. 실행 파일을 다시 열어주세요.",
        );
      app.exit(1);
    });
  app.on("before-quit", (event) => {
    if (quitting) return;
    quitting = true;
    registration?.allowQuit();
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
