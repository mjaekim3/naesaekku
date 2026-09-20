import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { preparePetSheet } from "../core/pet-pack.mjs";

test("built-in pet is Nerburi with frames and hit masks from the approved sheet", async () => {
  const main = await readFile(new URL("../desktop/pet-main.cjs", import.meta.url), "utf8");
  expect(main).toContain('currentPack?.manifest.name || "너부리"');
  expect(main).toContain("기본 너부리로 돌아가기");
  const pack = await preparePetSheet(await readFile(new URL("../assets/nerburi-sheet.png", import.meta.url)));
  for (let i = 0; i < 20; i++) {
    expect((await readFile(new URL(`../public/pet/${i}.png`, import.meta.url))).equals(pack.frames[i])).toBe(true);
  }
  expect((await readFile(new URL("../public/pet/alpha.bin", import.meta.url))).equals(pack.alpha)).toBe(true);
});
test("pet boots directly into an isolated overlay and preserves existing data location", async () => {
  const entry = await readFile(
    new URL("../desktop/main.cjs", import.meta.url),
    "utf8",
  );
  const main = await readFile(
    new URL("../desktop/pet-main.cjs", import.meta.url),
    "utf8",
  );
  expect(entry).toContain("pet-main.cjs");
  expect(main).toContain("Ongi Studio");
  expect(main).toContain("transparent: true");
  expect(main).toContain("sandbox: true");
  expect(main).toContain("setIgnoreMouseEvents");
});
test("pet renderer includes gesture release recovery and offline assets only", async () => {
  const ui = await readFile(new URL("../src/pet.js", import.meta.url), "utf8");
  expect(ui).toContain("pointercancel");
  expect(ui).toContain("lostpointercapture");
  expect(ui).toContain("drawImage");
  expect(ui).not.toContain("api.openai.com");
});
