const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
(async () => {
  await app.whenReady();
  const root = path.resolve(__dirname, "..");
  const dir = path.join(root, "test-results", "basic-companion-" + Date.now());
  await fs.mkdir(dir, { recursive: true });
  const { Studio } = await import(
    pathToFileURL(path.join(root, "core/studio.mjs"))
  );
  const { createActions } = await import(
    pathToFileURL(path.join(root, "desktop/actions.mjs"))
  );
  const studio = await Studio.open({ dir, getKey: () => "" });
  let copied = "";
  const actions = createActions({ studio, copyText: async text => { copied = text; } });
  ipcMain.handle("ongi:call", async (e, m, r) => {
    try {
      return { ok: true, data: await actions[m](r) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
  const w = new BrowserWindow({
    show: false,
    width: 1250,
    height: 1000,
    webPreferences: {
      preload: path.join(root, "desktop/preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      offscreen: true,
      backgroundThrottling: false,
    },
  });
  await w.loadFile(path.join(root, "dist/index.html"));
  await w.webContents.executeJavaScript(`new Promise(resolve => setTimeout(resolve, 250))`);
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '프롬프트 복사').click()`);
  await new Promise(resolve => setTimeout(resolve, 250));
  if (!copied.includes('friendly greeting loop') || !copied.includes('기본 너부리')) throw Error('Incorrect copied prompt');
  const fixedStyle = await w.webContents.executeJavaScript(`!document.body.textContent.includes('실제와 비슷하게') && !!document.querySelector('a[download="너부리-그림체-참고.png"]')`);
  if (!fixedStyle) throw Error('Style UI mismatch');
  await w.webContents.executeJavaScript(`document.querySelector('[aria-label="기본 너부리 그림체 참고"]').scrollIntoView({block:'center'})`);
  await fs.writeFile(path.join(dir, 'registration.png'), (await w.webContents.capturePage()).toPNG());
  const bytes = Array.from(
    await fs.readFile(path.join(root, "assets/nerburi-sheet.png")),
  );
  await w.webContents.executeJavaScript(
    `(()=>{const f=new File([new Uint8Array(${JSON.stringify(bytes)})],'sheet.png',{type:'image/png'});const dt=new DataTransfer();dt.items.add(f);const input=document.querySelector('input[accept="image/png"]');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  const wait = async (code) => {
    for (let i = 0; i < 100; i++) {
      if (await w.webContents.executeJavaScript(code)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw Error("UI timeout: " + code);
  };
  await wait(
    `document.querySelectorAll('.sheet-review-grid article').length===16`,
  );
  await w.webContents.executeJavaScript(
    `document.querySelector('.sheet-review').scrollIntoView({behavior:'instant'})`,
  );
  await new Promise((r) => setTimeout(r, 300));
  await fs.writeFile(
    path.join(dir, "review.png"),
    (await w.webContents.capturePage()).toPNG(),
  );
  await w.webContents.executeJavaScript(
    `(()=>{const select=document.querySelector('.sheet-review-grid select');select.value='1';select.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.sheet-review input[type="checkbox"]').click();})()`,
  );
  await wait(
    `Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='이 시트로 저장'&&!b.disabled)`,
  );
  await w.webContents.executeJavaScript(
    `Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='이 시트로 저장').click()`,
  );
  await wait(`!document.querySelector('.sheet-review')`);
  const state = await studio.state();
  if (!state.artworks[0]?.hasMotion) throw Error("No imported motion");
  if (state.artworks[0].sheetFormat !== 'companion-v1') throw Error('Wrong saved format');
  await wait(`Array.from(document.querySelectorAll('button')).some(b => b.textContent === '반겨주기')`);
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b => b.textContent === '반겨주기').click()`);
  await new Promise(resolve => setTimeout(resolve, 350));
  await w.webContents.executeJavaScript(`document.querySelector('img[alt="생성된 동작 미리보기"]').scrollIntoView({block:'center'})`);
  await fs.writeFile(path.join(dir, 'greeting-preview.png'), (await w.webContents.capturePage()).toPNG());
  await fs.writeFile(
    path.join(dir, "result.json"),
    JSON.stringify({
      reviewCells: 16,
      saved: true,
      hasMotion: state.artworks[0].hasMotion,
      sheetFormat: state.artworks[0].sheetFormat,
    }),
  );
  console.log(
    "PASS: review, reorder, confirm, compose, IPC import and persistence",
  );
  app.quit();
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
