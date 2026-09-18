import { test, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
test('pet boots directly into an isolated overlay and preserves existing data location', async () => {
  const entry=await readFile(new URL('../desktop/main.cjs',import.meta.url),'utf8');
  const main=await readFile(new URL('../desktop/pet-main.cjs',import.meta.url),'utf8');
  expect(entry).toContain('pet-main.cjs');
  expect(main).toContain('Ongi Studio');
  expect(main).toContain('transparent: true');
  expect(main).toContain('sandbox: true');
  expect(main).toContain('setIgnoreMouseEvents');
});
test('pet renderer includes gesture release recovery and offline assets only', async()=>{
  const ui=await readFile(new URL('../src/pet.js',import.meta.url),'utf8');
  expect(ui).toContain('pointercancel');
  expect(ui).toContain('lostpointercapture');
  expect(ui).toContain('drawImage');
  expect(ui).not.toContain('api.openai.com');
});
