import { test, expect } from "vitest";
import sharp from "sharp";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Studio } from "../core/studio.mjs";
import { preparePetSheet, loadPetPack } from "../core/pet-pack.mjs";
import { FRAME_SIZE, MASK_SIZE } from "../core/frame-size.mjs";

async function sheet() {
  const sprite = await sharp({
    create: { width: 36, height: 40, channels: 4, background: "#333333" },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 256, height: 256, channels: 4, background: "#00000000" },
  })
    .composite(
      Array.from({ length: 16 }, (_, i) => ({
        input: sprite,
        left: (i % 4) * 64 + 14,
        top: Math.floor(i / 4) * 64 + 12,
      })),
    )
    .png()
    .toBuffer();
}
test("sprite processing produces compatible frames and masks; rejects empty and opaque sheets", async () => {
  const pack = await preparePetSheet(await sheet());
  expect(pack.frames).toHaveLength(20);
  expect(pack.alpha.length).toBe(20 * MASK_SIZE * MASK_SIZE);
  expect((await sharp(pack.frames[4]).metadata()).width).toBe(FRAME_SIZE);
  const opaque = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  await expect(preparePetSheet(opaque)).rejects.toThrow();
  const blank = await sharp({
    create: { width: 256, height: 256, channels: 4, background: "#00000000" },
  })
    .png()
    .toBuffer();
  await expect(preparePetSheet(blank)).rejects.toThrow();
});
test("photo to master to motion pack persists across restart with two explicit API requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pet-generation-"));
  try {
    const picture = await sheet();
    const prompts = [];
    const studio = await Studio.open({
      dir,
      getKey: () => "test-only",
      render: async ({ prompt }) => {
        prompts.push(prompt);
        return { buffer: picture };
      },
    });
    const photos = await studio.importPhotos([
      { name: "pet.png", bytes: picture },
    ]);
    const job = await studio.start({
      name: "터치",
      features: "흰 하트",
      style: "pixel",
      quality: "low",
      mode: "pet",
      photoIds: photos.map((x) => x.id),
      consent: true,
    });
    for (let i = 0; i < 300 && studio.job(job.id).status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(studio.job(job.id).status).toBe("complete");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("4 columns");
    const id = studio.job(job.id).artworkId;
    const pack = await loadPetPack(dir, id);
    expect(pack.manifest.name).toBe("터치");
    expect(pack.alpha.length).toBe(20 * MASK_SIZE * MASK_SIZE);
    const reopened = await Studio.open({ dir });
    expect(await reopened.petFrames(id)).toHaveLength(20);
    expect(
      (await reopened.state()).artworks.find((x) => x.id === id).hasMotion,
    ).toBe(true);
    await expect(loadPetPack(dir, "../../bad")).rejects.toThrow();
    expect(
      JSON.parse(await readFile(join(dir, "library.json"), "utf8")).attempts,
    ).toHaveLength(2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("failed motion preserves master; cancellation prevents second paid request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pet-failure-"));
  try {
    const picture = await sheet();
    let calls = 0;
    const studio = await Studio.open({
      dir,
      getKey: () => "test",
      render: async () => {
        calls++;
        if (calls === 2) throw Error("network");
        return { buffer: picture };
      },
    });
    const photos = await studio.importPhotos([
      { name: "pet.png", bytes: picture },
    ]);
    const req = {
      name: "터치",
      features: "",
      style: "pixel",
      quality: "low",
      mode: "pet",
      photoIds: photos.map((x) => x.id),
      consent: true,
    };
    const job = await studio.start(req);
    for (let i = 0; i < 300 && studio.job(job.id).status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(studio.job(job.id).status).toBe("error");
    const master = studio.job(job.id).masterId;
    expect(studio.find(master).mode).toBe("generate");
    const retry = await studio.start({
      ...req,
      mode: "motion",
      baseId: master,
    });
    for (let i = 0; i < 300 && studio.job(retry.id).status === "running"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(studio.job(retry.id).status).toBe("complete");
    expect(calls).toBe(3);
    let release;
    studio.render = async () => {
      calls++;
      await new Promise((r) => (release = r));
      return { buffer: picture };
    };
    const cancel = await studio.start(req);
    for (let i = 0; i < 100 && !release; i++)
      await new Promise((r) => setTimeout(r, 5));
    studio.cancel(cancel.id);
    release();
    await new Promise((r) => setTimeout(r, 30));
    expect(studio.job(cancel.id).status).toBe("canceled");
    expect(calls).toBe(4);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("packs saved with the earlier 192 px frames still load next to new 576 px packs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pack-compat-"));
  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const id = "00000000-0000-4000-8000-000000000192";
    const root = join(dir, "pets", id);
    await mkdir(root, { recursive: true });
    const frame = await sharp({ create: { width: 192, height: 192, channels: 4, background: "#00000000" } }).png().toBuffer();
    await Promise.all(Array.from({ length: 20 }, (_, i) => writeFile(join(root, `${i}.png`), frame)));
    await writeFile(join(root, "alpha.bin"), Buffer.alloc(20 * MASK_SIZE * MASK_SIZE));
    await writeFile(join(root, "manifest.json"), JSON.stringify({ version: 1, id, name: "예전 펫", frames: 20, size: 192, sheetFormat: "lift-v2" }));
    expect((await loadPetPack(dir, id)).manifest.size).toBe(192);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("a taller upright lifted cell does not shrink the other animations", async () => {
  const sprite = (h) => sharp({ create: { width: 20, height: h, channels: 4, background: "#a0785a" } }).png().toBuffer();
  const body = await sprite(30), lifted = await sprite(33);
  const sheetPng = await sharp({ create: { width: 256, height: 256, channels: 4, background: "#00000000" } })
    .composite(Array.from({ length: 16 }, (_, i) => ({ input: i === 14 ? lifted : body, left: (i % 4) * 64 + 22, top: Math.floor(i / 4) * 64 + 14 })))
    .png()
    .toBuffer();
  const pack = await preparePetSheet(sheetPng);
  const height = async (frame) => {
    const { data, info } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let top = info.height, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 128) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    return bottom - top + 1;
  };
  // Idle (frame 4) fills the fit box as if the lifted cell were absent
  // (504 px at 576); counting the lifted cell would have given ~458 px.
  expect(await height(pack.frames[4])).toBeGreaterThan(470);
  // The lifted frame (10) keeps the same scale, so it stays 10% taller.
  expect((await height(pack.frames[10])) / (await height(pack.frames[4]))).toBeCloseTo(1.1, 1);
});
