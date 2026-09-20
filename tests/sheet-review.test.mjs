import { test, expect } from "vitest";
import sharp from "sharp";
import { reviewSheet } from "../core/sheet-review.mjs";
import { preparePetSheet } from "../core/pet-pack.mjs";
const png = (w, h, bg) =>
  sharp({ create: { width: w, height: h, channels: 4, background: bg } })
    .png()
    .toBuffer();
test("review rescues edge touching cells, reports empty cells and emits importable padded tiles", async () => {
  const pet = await png(64, 40, "#c79563");
  const source = await sharp(await png(256, 256, "#00000000"))
    .composite(
      Array.from({ length: 15 }, (_, i) => ({
        input: pet,
        left: (i % 4) * 64,
        top: Math.floor(i / 4) * 64 + 12,
      })),
    )
    .png()
    .toBuffer();
  const result = await reviewSheet(source);
  expect(result.cells).toHaveLength(16);
  expect(result.cells[0].warnings).toContain("edge");
  expect(result.cells[15].warnings).toContain("empty");
  const sheet = await sharp(await png(2048, 2048, "#00000000"))
    .composite(
      result.cells.map((c, i) => ({
        input: Buffer.from(
          (i === 15 ? result.cells[0] : c).image.split(",")[1],
          "base64",
        ),
        left: (i % 4) * 512,
        top: Math.floor(i / 4) * 512,
      })),
    )
    .png()
    .toBuffer();
  expect((await preparePetSheet(sheet)).frames).toHaveLength(20);
});
test("optional edge-connected solid background removal preserves enclosed same-color details", async () => {
  const data = Buffer.alloc(64 * 64 * 4, 255);
  for (let y = 16; y < 48; y++)
    for (let x = 16; x < 48; x++) {
      const n = (y * 64 + x) * 4;
      data[n] = 50;
      data[n + 1] = 60;
      data[n + 2] = 70;
    }
  for (let y = 24; y < 32; y++)
    for (let x = 24; x < 32; x++) {
      const n = (y * 64 + x) * 4;
      data[n] = data[n + 1] = data[n + 2] = 255;
    }
  const file = await sharp(data, {
    raw: { width: 64, height: 64, channels: 4 },
  })
    .png()
    .toBuffer();
  const result = await reviewSheet(file, {
    single: true,
    removeBackground: true,
  });
  expect(result.cells[0].warnings).not.toContain("opaque");
  const raw = await sharp(
    Buffer.from(result.cells[0].image.split(",")[1], "base64"),
  )
    .raw()
    .toBuffer();
  expect(raw[3]).toBe(0);
  expect(raw.some((v, i) => i % 4 === 3 && v === 255)).toBe(true);
});
test("review validates options and image shape", async () => {
  await expect(reviewSheet(await png(64, 400, "white"))).rejects.toThrow();
  await expect(
    reviewSheet(await png(256, 256, "white"), { single: "yes" }),
  ).rejects.toThrow();
});

import { Studio } from "../core/studio.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("studio review validates bytes and reuses repaired cells without paid services", async () => {
  const dir = await mkdtemp(join(tmpdir(), "review-"));
  try {
    const studio = await Studio.open({ dir, getKey: () => "" });
    await expect(
      studio.reviewPetSheet({ file: { name: "x.png", bytes: [] } }),
    ).rejects.toThrow();
    const bytes = await png(256, 256, "#00000000");
    const r = await studio.reviewPetSheet({
      file: { name: "sheet.png", bytes },
    });
    expect(r.cells).toHaveLength(16);
    expect(r.cells.every((c) => c.warnings.includes("empty"))).toBe(true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("review keeps 512px tiles and explicitly flags insufficient lift headroom", async()=>{
 const source=await sharp(await png(256,256,'#00000000')).composite([{input:await png(20,50,'#aa7755'),left:138,top:192}]).png().toBuffer();
 const r=await reviewSheet(source);
 expect(r.cells[14].warnings).toContain('headroom');
 const meta=await sharp(Buffer.from(r.cells[14].image.split(',')[1],'base64')).metadata();
 expect(meta.width).toBe(512);
});
