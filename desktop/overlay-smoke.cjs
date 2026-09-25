// Opt-in integration check against the real app protocol, preload and window.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
exports.runOverlaySmoke = async ({ pet, dir, command, save, registration, screen }) => {
  const wc = pet.webContents;
  const evaluate = (code) => wc.executeJavaScript(code);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (code, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(code)) return;
      await delay(50);
    }
    throw Error("Overlay check timed out: " + code);
  };
  assert.equal(wc.getURL(), "app://pet/neoburie.html");
  pet.showInactive();
  await until('!!document.querySelector(".cat")?.dataset.mode');
  command("pause");
  await until('document.querySelector(".cat").classList.contains("is-still")');
  const sheets = await fs.readdir(path.join(__dirname, "../dist/neoburie"));
  const loaded = await evaluate(`Promise.all(${JSON.stringify(sheets.filter(f => f.endsWith('.png')))}.map(file => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve({file, width:image.naturalWidth, height:image.naturalHeight});
    image.onerror = () => reject(Error(file)); image.src = './neoburie/' + file;
  })))`);
  assert.ok(loaded.length >= 13);
  const bounds = pet.getBounds();
  assert.ok(screen.getAllDisplays().some(d => JSON.stringify(d.workArea) === JSON.stringify(bounds)));
  assert.equal(pet.isAlwaysOnTop(), true);
  const prefs = wc.getLastWebPreferences();
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  await fs.writeFile(path.join(dir, "overlay-awake.png"), (await wc.capturePage()).toPNG());
  await evaluate('document.querySelector(".cat").dispatchEvent(new MouseEvent("contextmenu", {bubbles:true, cancelable:true, button:2}))');
  await until('document.querySelector(".cat").dataset.mode === "sleep"');
  await delay(1700);
  await save();
  const saved = JSON.parse(await fs.readFile(path.join(dir, "pet-state.json"), "utf8"));
  assert.equal(saved.neoburie.sleeping, true);
  assert.equal(saved.neoburie.anchored, true);
  await fs.writeFile(path.join(dir, "overlay-asleep.png"), (await wc.capturePage()).toPNG());
  await wc.reload();
  await until('document.querySelector(".cat")?.dataset.mode === "sleep"');
  command("wake");
  await until('document.querySelector(".cat").dataset.mode === "wake"');
  await until('document.querySelector(".cat").dataset.mode === "walk"');
  const point = await evaluate('(()=>{const r=document.querySelector(".cat").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()');
  wc.sendInputEvent({type:"mouseDown", button:"left", clickCount:1, ...point});
  await until('document.querySelector(".cat").dataset.mode === "held"');
  wc.sendInputEvent({type:"mouseMove", x:point.x-60, y:point.y-50});
  await delay(150);
  await fs.writeFile(path.join(dir, "overlay-held.png"), (await wc.capturePage()).toPNG());
  wc.sendInputEvent({type:"mouseUp", button:"left", clickCount:1, x:point.x-60, y:point.y-50});
  await until('document.querySelector(".cat").dataset.mode === "walk"');
  const studio = await registration.open({hidden:true});
  const state = await studio.webContents.executeJavaScript('window.ongi.state()');
  assert.equal(state.photos.length, 0);
  assert.equal(Object.hasOwn(state, "apiKey"), false);
  await fs.writeFile(path.join(dir, "overlay-smoke.json"), JSON.stringify({
    passed:true, sheets:loaded, bounds, transparent:pet.getBackgroundColor(),
    checks:["pause", "right-click sleep", "sleep persistence and reload", "wake", "drag and release", "registration preload", "sandbox"],
  }, null, 2));
  console.log("PASS: built-in Nerburi overlay, sprites, sleep/wake, drag, persistence and registration");
};
