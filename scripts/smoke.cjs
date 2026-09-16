'use strict';
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.join(__dirname, '..');
const output = path.join(root, 'test-results');
fs.mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const env = { ...process.env, TOUCH_USER_DATA: path.join(root, '.runtime', 'smoke') };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const results = [];
  try {
    app = await electron.launch({ args: [root], env, timeout: 30000 });
    const page = await app.firstWindow();
    await page.waitForFunction(() => document.querySelector('#touch').naturalWidth > 0);
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    const inspect = () => app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { bounds: w.getBounds(), top: w.isAlwaysOnTop(), frame: w.hasShadow(),
        background: w.getBackgroundColor(), resizable: w.isResizable(), title: w.getTitle() };
    });
    const first = await inspect();
    assert.equal(first.top, true);
    assert.equal(first.frame, false);
    assert.equal(first.resizable, false);
    assert.equal(first.background, '#00000000');
    assert.equal(first.title, 'Somewhere, Over the Rainbow Bridge');
    await sleep(400);
    assert.notEqual((await inspect()).bounds.x, first.bounds.x);
    results.push('Real Electron window: transparent, always on top, no shadow, movement');
    await page.evaluate(() => document.querySelector('#pet').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#pet').getAttribute('aria-pressed') === 'true');
    const paused = (await inspect()).bounds;
    await sleep(300);
    assert.deepEqual((await inspect()).bounds, paused);
    assert.equal(await page.locator('#pet').evaluate(el => el.classList.contains('walking')), false);
    results.push('Double-click DOM event pauses movement and bounce');
    await page.evaluate(() => document.querySelector('#pet').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    await page.waitForFunction(() => document.querySelector('#pet').classList.contains('walking'));
    await sleep(300);
    assert.notEqual((await inspect()).bounds.x, paused.x);
    results.push('Double-click DOM event resumes movement and bounce');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(await page.evaluate(() => typeof window.process), 'undefined');
    assert.deepEqual(errors, []);
    results.push('Renderer sandbox and no page errors');
    await page.screenshot({ path: path.join(output, 'electron-window.png'), omitBackground: true });
    fs.writeFileSync(path.join(output, 'smoke.json'), JSON.stringify({ results, first }, null, 2));
    console.log(results.join('\n'));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
