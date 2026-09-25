import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { poseTimeline, pounceMotion } from "../src/neoburie/timeline.js";

// Ported from FirstEduKitSeries src/app/login/neoburieTimeline.test.ts and
// neoburieMotion.test.ts so the desktop port keeps the login-page motion.
function settlingFrame(at) {
  const { keys } = poseTimeline("settle", at);
  return keys.filter((key) => key.at <= at).at(-1).pose;
}

describe("Nerburi pose timeline", () => {
  it("yawns wide and then blinks twice before closing the eyes for sleep", () => {
    expect([1050, 1550, 1800, 2600, 2850].map(settlingFrame)).toMatchObject([
      { sheet: "groom", frame: 0 }, { sheet: "yawnHalf", frame: 0 },
      { sheet: "yawnOpen", frame: 0 }, { sheet: "yawnHalf", frame: 0 },
      { sheet: "groom", frame: 0 },
    ]);
    expect([3150, 3700, 3840, 4150, 4320, 4650, 5200, 5850, 6700].map(settlingFrame)).toMatchObject([
      { sheet: "rest", frame: 2 }, { sheet: "rest", frame: 3 },
      { sheet: "rest", frame: 2 }, { sheet: "rest", frame: 4 },
      { sheet: "rest", frame: 2 }, { sheet: "rest", frame: 3 },
      { sheet: "rest", frame: 4 }, { sheet: "rest", frame: 5 },
      { sheet: "sleep", frame: 0 },
    ]);
  });

  it("uses twelve distinct poses to move smoothly through the wake-up stretch", () => {
    const { keys } = poseTimeline("wake", 5300);
    const wakeKeys = keys.filter((key) => key.pose.sheet === "wake");
    expect(wakeKeys.map((key) => key.pose.frame)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(keys.at(-1).at).toBeLessThan(5300);
  });

  it("uses only complete-paw frames during the vertical jump", () => {
    const { keys } = poseTimeline("pounce", 940);
    expect(keys.map((key) => [key.at, key.pose.frame]))
      .toEqual([[0, 0], [150, 1], [300, 1], [470, 4], [610, 4], [790, 5]]);
  });
});

describe("vertical toy pounce", () => {
  it("holds the feet during the crouch and returns them to the floor", () => {
    expect(pounceMotion(0, 220, 24)).toEqual({ lift: 0, travel: 0 });
    expect(pounceMotion(.17, 220, 24)).toEqual({ lift: 0, travel: 0 });
    expect(pounceMotion(1, 220, 24)).toEqual({ lift: 0, travel: 24 });
  });

  it("rises almost straight up and lingers near the apex", () => {
    const rising = pounceMotion(.4, 220, 24);
    const apex = pounceMotion(.58, 220, 24);
    expect(rising.lift).toBeGreaterThan(175);
    expect(rising.travel).toBeLessThan(6);
    expect(apex.lift).toBeGreaterThan(210);
    expect(apex.travel).toBeLessThan(12);
  });
});

describe("desktop overlay wiring", () => {
  it("runs the built-in pet as a click-through work-area overlay fed by the global cursor", async () => {
    const main = await readFile(new URL("../desktop/pet-main.cjs", import.meta.url), "utf8");
    expect(main).toContain('"app://pet/neoburie.html"');
    expect(main).toContain("pet.setBounds(d.workArea, false)");
    expect(main).toContain('pet.webContents.send("pet:cursor", local)');
    expect(main).toContain('ipcMain.on("pet:hover"');
    const renderer = await readFile(new URL("../src/neoburie/main.js", import.meta.url), "utf8");
    expect(renderer).toContain("api.onCursor");
    expect(renderer).toContain("api?.hover(over)");
    expect(renderer).not.toContain("api.openai.com");
  });

  it("puts the cat to bed with a right-click and keeps it asleep until clicked", async () => {
    const renderer = await readFile(new URL("../src/neoburie/main.js", import.meta.url), "utf8");
    expect(renderer).toMatch(/addEventListener\("contextmenu"[\s\S]*?putToBed\(\)/);
    expect(renderer).toContain("if (anchored && asleep()) return;");
    expect(renderer).toContain('mode === "sleep" && !anchored');
    const main = await readFile(new URL("../desktop/pet-main.cjs", import.meta.url), "utf8");
    expect(main).toContain("anchored: value.anchored === true");
  });

  it("keeps the held cat's tail solid so the desktop never shows through it", async () => {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(new URL("../public/neoburie/neoburie-held-v4-hand-4f.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let frame = 0; frame < 4; frame++) {
      let seeThrough = 0;
      const alpha = (x, y) => data[(y * info.width + frame * 543 + x) * 4 + 3];
      // Tail area: any cat pixel more than 3px from clear transparency is
      // inside the silhouette (not its anti-aliased rim) and must be opaque.
      for (let y = 560; y < 690; y++) for (let x = 40; x < 440; x++) {
        if (alpha(x, y) < 128 || alpha(x, y) >= 250) continue;
        let rim = false;
        for (let dy = -3; dy <= 3 && !rim; dy++) for (let dx = -3; dx <= 3; dx++) if (alpha(x + dx, y + dy) < 128) { rim = true; break; }
        if (!rim) seeThrough++;
      }
      expect(seeThrough, `frame ${frame}`).toBe(0);
    }
  });

  it("ships every sprite sheet the renderer loads", async () => {
    const sources = await Promise.all(["main.js", "face.js", "care.js"].map((f) => readFile(new URL(`../src/neoburie/${f}`, import.meta.url), "utf8")));
    const sheets = new Set(sources.join("\n").match(/neoburie-[\w-]+\.png/g));
    expect(sheets.size).toBeGreaterThanOrEqual(13);
    for (const sheet of sheets) await readFile(new URL(`../public/neoburie/${sheet}`, import.meta.url));
  });
});
