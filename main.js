'use strict';

const { app, BrowserWindow, ipcMain, Menu, Tray, screen, nativeImage, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { contain, advance } = require('./lib/motion');

const TITLE = 'Somewhere, Over the Rainbow Bridge';
const SIZE = { width: 240, height: 220 };
const asset = path.join(__dirname, 'assets', 'touch.png');
const pageURL = pathToFileURL(path.join(__dirname, 'src', 'index.html')).href;
let win, tray, timer, drag, lastTick, activeDisplay, hitImage;
let state = { x: 0, y: 0, direction: 1, paused: false, dragging: false, menuOpen: false };
let ignored = false;

// Tests keep Chromium's temporary data inside the writable project folder.
if (process.env.TOUCH_USER_DATA) {
  fs.mkdirSync(process.env.TOUCH_USER_DATA, { recursive: true });
  app.setPath('userData', process.env.TOUCH_USER_DATA);
  app.setPath('sessionData', process.env.TOUCH_USER_DATA);
}
app.setName(TITLE);
app.setAppUserModelId('local.touch.rainbowbridge');

function publicState() {
  return { paused: state.paused, direction: state.direction, dragging: state.dragging,
    walking: !state.paused && !state.dragging && !state.menuOpen };
}
function publish() {
  if (win && !win.isDestroyed()) win.webContents.send('pet:state', publicState());
  if (tray) tray.setToolTip(`Touch · ${state.paused ? '쉬는 중' : '산책 중'}`);
}
function place() {
  const x = Math.round(state.x), y = Math.round(state.y);
  const [previousX, previousY] = win.getPosition();
  if (previousX !== x || previousY !== y) win.setPosition(x, y, false);
}
function setPaused() { state.paused = !state.paused; publish(); }
function goHome() {
  drag = null;
  state.dragging = false;
  activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  state = { ...state, ...contain(state, SIZE, activeDisplay.workArea) };
  state.y = activeDisplay.workArea.y + activeDisplay.workArea.height - SIZE.height;
  place(); publish();
}
function menuTemplate() {
  return [
    { label: TITLE, enabled: false },
    { type: 'separator' },
    { id: 'pause', label: state.paused ? '산책 재개' : '일시정지', click: setPaused },
    { id: 'home', label: '화면 하단으로 돌아가기', click: goHome },
    { type: 'separator' },
    { id: 'quit', label: 'Touch 종료', click: () => app.quit() }
  ];
}
function openMenu() {
  if (state.menuOpen) return;
  drag = null; state.dragging = false; state.menuOpen = true;
  publish();
  Menu.buildFromTemplate(menuTemplate()).popup({ window: win, callback: () => {
    state.menuOpen = false; publish();
  }});
}
function startDrag() {
  if (state.menuOpen) return;
  const cursor = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  drag = { x: cursor.x - x, y: cursor.y - y, start: cursor };
}
function finishDrag() {
  drag = null; state.dragging = false; publish();
}
function updateClickThrough() {
  if (!hitImage) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  // A small alpha hit margin covers the visual bounce without trapping the
  // transparent rectangle around the dog. The original asset faces right.
  const lx = cursor.x - wx, ly = cursor.y - wy;
  const width = hitImage.width, height = hitImage.height;
  const left = (SIZE.width - width) / 2, top = SIZE.height - 12 - height;
  let hit = false;
  for (let dy = -8; dy <= 8 && !hit; dy += 2) {
    for (let dx = -5; dx <= 5; dx += 2) {
      let x = Math.floor(lx - left + dx);
      const y = Math.floor(ly - top + dy);
      if (state.direction < 0) x = width - 1 - x;
      if (x >= 0 && x < width && y >= 0 && y < height && hitImage.bitmap[(y * width + x) * 4 + 3] > 20) { hit = true; break; }
    }
  }
  const nextIgnored = !drag && !state.menuOpen && !hit;
  if (nextIgnored !== ignored) {
    ignored = nextIgnored;
    win.setIgnoreMouseEvents(ignored, { forward: true });
  }
}
function tick() {
  const now = performance.now();
  const seconds = (now - lastTick) / 1000; lastTick = now;
  if (drag) {
    const cursor = screen.getCursorScreenPoint();
    if (Math.hypot(cursor.x - drag.start.x, cursor.y - drag.start.y) > 4 || state.dragging) {
      if (!state.dragging) { state.dragging = true; publish(); }
      activeDisplay = screen.getDisplayNearestPoint(cursor);
      Object.assign(state, contain({ x: cursor.x - drag.x, y: cursor.y - drag.y }, SIZE, activeDisplay.workArea));
      place();
    }
  } else {
    const previousDirection = state.direction;
    state = advance(state, seconds, SIZE, activeDisplay.workArea);
    place();
    if (previousDirection !== state.direction) publish();
  }
  updateClickThrough();
}
function createWindow() {
  const pet = nativeImage.createFromPath(asset);
  if (pet.isEmpty()) {
    dialog.showErrorBox('Touch PNG가 필요합니다', 'assets/touch.png에 이전 대화에서 만든 투명 PNG를 넣어 주세요.');
    app.quit(); return;
  }
  const sourceSize = pet.getSize();
  const ratio = Math.min(216 / sourceSize.width, 192 / sourceSize.height);
  const resized = pet.resize({ width: Math.round(sourceSize.width * ratio), height: Math.round(sourceSize.height * ratio) });
  hitImage = { ...resized.getSize(), bitmap: resized.toBitmap() };
  activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = activeDisplay.workArea;
  state.x = area.x + Math.min(100, Math.max(0, area.width - SIZE.width));
  state.y = area.y + area.height - SIZE.height;
  win = new BrowserWindow({ ...SIZE, x: Math.round(state.x), y: Math.round(state.y),
    title: TITLE, transparent: true, frame: false, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, maximizable: false, minimizable: false, fullscreenable: false,
    hasShadow: false, backgroundColor: '#00000000', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
      nodeIntegration: false, sandbox: true, backgroundThrottling: false }
  });
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.once('ready-to-show', () => { win.showInactive(); publish(); });
  win.on('blur', finishDrag);
  win.on('closed', () => { clearInterval(timer); win = null; app.quit(); });
  win.loadURL(pageURL);
  tray = new Tray(path.join(__dirname, 'assets', 'icon.ico'));
  tray.on('right-click', openMenu);
  tray.on('double-click', setPaused);
  publish();
  screen.on('display-removed', goHome);
  screen.on('display-metrics-changed', goHome);
  lastTick = performance.now();
  timer = setInterval(tick, 1000 / 60);
}
function trusted(event) {
  return win && event.sender === win.webContents && event.senderFrame?.url === pageURL;
}
ipcMain.handle('pet:get-state', event => trusted(event) ? publicState() : null);
for (const [channel, action] of Object.entries({ 'pet:toggle': setPaused, 'pet:menu': openMenu,
  'pet:drag-start': startDrag, 'pet:drag-end': finishDrag })) {
  ipcMain.on(channel, event => { if (trusted(event)) action(); });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { win.showInactive(); goHome(); } });
  app.whenReady().then(createWindow);
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { clearInterval(timer); if (tray) { tray.destroy(); tray = null; } });
