import { test, expect } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { splitMotion, motionGroupPrompt } from "../core/motion-import.mjs";
import { FRAME_SIZE, BASELINE } from "../core/frame-size.mjs";
import { Studio } from "../core/studio.mjs";
async function sheet(columns, rows) {
  const marker = await sharp({
    create: { width: 6, height: 4, channels: 4, background: "#fff" },
  })
    .png()
    .toBuffer();
  const tile = await sharp({
    create: { width: 24, height: 32, channels: 4, background: "#123456" },
  })
    .composite([{ input: marker, left: 3, top: 4 }])
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: columns * 64,
      height: rows * 64,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(
      Array.from({ length: columns * rows }, (_, i) => ({
        input: tile,
        left: (i % columns) * 64 + 8,
        top: Math.floor(i / columns) * 64 + 16,
      })),
    )
    .png()
    .toBuffer();
}
test("moving tail does not shift the torso horizontally and magenta removal preserves white markings", async () => {
  const body = await sharp({
    create: { width: 20, height: 30, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  const eye = await sharp({
    create: { width: 3, height: 3, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const tail = await sharp({
    create: { width: 4, height: 6, channels: 4, background: "#123456" },
  })
    .png()
    .toBuffer();
  const input = await sharp({
    create: { width: 128, height: 64, channels: 4, background: "#ff00ff" },
  })
    .composite([
      { input: body, left: 20, top: 18 },
      { input: eye, left: 24, top: 22 },
      { input: tail, left: 41, top: 32 },
      { input: body, left: 84, top: 18 },
      { input: eye, left: 88, top: 22 },
      { input: tail, left: 113, top: 32 },
    ])
    .png()
    .toBuffer();
  const frames = await splitMotion(input, "idle", "magenta");
  const center = [];
  for (const f of frames) {
    const raw = await sharp(f).raw().toBuffer();
    const xs = [];
    for (let y = 0; y < FRAME_SIZE; y++)
      for (let x = 0; x < FRAME_SIZE; x++) {
        const n = (y * FRAME_SIZE + x) * 4;
        if (raw[n] > 250 && raw[n + 1] > 250 && raw[n + 2] > 250 && raw[n + 3])
          xs.push(x);
      }
    expect(xs.length).toBeGreaterThan(0);
    center.push(xs.reduce((a, b) => a + b) / xs.length);
  }
  // Smooth resampling may move the centroid by a fraction of a pixel.
  expect(Math.abs(center[0] - center[1])).toBeLessThan(0.5);
});
test("separate sheets split with stable canvas and baseline, and reject bad layouts", async () => {
  const frames = await splitMotion(await sheet(4, 2), "walk", "alpha");
  expect(frames).toHaveLength(8);
  const raw = await sharp(frames[0]).ensureAlpha().raw().toBuffer();
  const ys = [];
  for (let y = 0; y < FRAME_SIZE; y++)
    for (let x = 0; x < FRAME_SIZE; x++) if (raw[(y * FRAME_SIZE + x) * 4 + 3]) ys.push(y);
  expect(ys.reduce((a, y) => Math.max(a, y), 0)).toBe(BASELINE - 1);
  await expect(
    splitMotion(await sheet(2, 1), "walk", "alpha"),
  ).rejects.toThrow();
  await expect(
    splitMotion(await sheet(2, 1), "unknown", "alpha"),
  ).rejects.toThrow();
  const flat = await sharp({
    create: { width: 256, height: 128, channels: 3, background: "#fff" },
  })
    .png()
    .toBuffer();
  await expect(splitMotion(flat, "idle", "alpha")).rejects.toThrow();
  expect(
    motionGroupPrompt({
      name: "터치",
      features: "흰 하트",
      style: "pixel",
      action: "walk",
    }),
  ).toContain("RIGHT");
  expect(
    motionGroupPrompt({
      name: "터치",
      features: "흰 하트",
      style: "pixel",
      action: "master",
    }),
  ).toContain("흰 하트");
});
test("reviewed motion assembles without AI, preserves flip/order and requires review", async () => {
  const dir = await mkdtemp(join(tmpdir(), "motion-import-"));
  try {
    const s = await Studio.open({ dir, getKey: () => "" });
    const groups = {};
    for (const action of ["walk", "idle", "sleep", "eat"]) {
      const prepared = await s.prepareMotion({
        action,
        background: "alpha",
        file: {
          name: "sheet.png",
          bytes: await sheet(
            action === "walk" ? 4 : 2,
            action === "walk" ? 2 : 1,
          ),
        },
      });
      groups[action] = prepared.map((image) => ({ image, flip: false }));
    }
    const r = { name: "터치", groups, reviewed: false };
    await expect(s.saveMotion(r)).rejects.toThrow();
    r.reviewed = true;
    const original = await s.saveMotion(r);
    groups.walk[0].flip = true;
    const edited = await s.saveMotion(r);
    const a = await s.petFrames(original.id),
      b = await s.petFrames(edited.id);
    expect(a).toHaveLength(20);
    expect(a[12]).not.toBe(b[12]);
    expect(a[13]).toBe(b[13]);
    expect(s.data.attempts).toHaveLength(0);
    await expect(
      s.saveMotion({ ...r, groups: { ...groups, walk: [] } }),
    ).rejects.toThrow();
    groups.walk[0].image = "https://example.com/image.png";
    await expect(s.saveMotion(r)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
