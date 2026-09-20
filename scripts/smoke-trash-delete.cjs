const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
(async () => {
  await app.whenReady();
  const root = path.resolve(__dirname, "..");
  const dir = path.join(root, "test-results", "trash-delete-095");
  await fs.mkdir(dir, { recursive: true });
  const { Studio } = await import(
    pathToFileURL(path.join(root, "core/studio.mjs"))
  );
  const { createActions } = await import(
    pathToFileURL(path.join(root, "desktop/actions.mjs"))
  );
  const studio = await Studio.open({ dir, getKey: () => "" });
  const actions = createActions({ studio });
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
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('nav button')).find(b=>b.textContent.includes('기억 보관함')).click()`);
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('삭제 · 휴지통으로'))`);
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('삭제 · 휴지통으로')).click()`);
  await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='영구삭제')`);
  await w.webContents.executeJavaScript(`(()=>{document.querySelector('details.panel').open=true;Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='영구삭제').click();})()`);
  await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(b=>b.textContent==='취소').click()`);
  await wait(`!document.querySelector('[role="alertdialog"]')`);
  if ((await studio.state()).trash.length!==1) throw Error('Cancel removed item');
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='영구삭제').click()`);
  await wait(`!!document.querySelector('[role="alertdialog"]')`);
  await w.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role="alertdialog"] button')).find(b=>b.textContent==='영구삭제 확인').click()`);
  await wait(`!document.querySelector('[role="alertdialog"]')`);
  if ((await studio.state()).trash.length) throw Error('Trash not cleared');
  try {await fs.access(path.join(dir,'pets',state.artworks[0].id));throw Error('Pet files remain');}catch(e){if(e.code!=='ENOENT')throw e;}
  console.log('PASS: trash, cancel, confirm permanent deletion and disk cleanup');
  app.quit();
})().catch((e) => {
  console.error(e);
  app.exit(1);
});
