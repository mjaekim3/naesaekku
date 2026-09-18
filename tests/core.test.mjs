import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { Studio, buildPrompt } from "../core/studio.mjs";
import { normalize, pixelate, animate } from "../core/images.mjs";
import { createRenderer, publicError } from "../core/provider.mjs";
let dir, studio, png, render;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ongi-"));
  png = await sharp({
    create: { width: 32, height: 32, channels: 4, background: "#f3a5b8" },
  })
    .png()
    .toBuffer();
  render = vi.fn(async () => ({ buffer: png, usage: { total_tokens: 100 } }));
  studio = await Studio.open({ dir, render, getKey: () => "test-key" });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const ref = () => studio.importPhotos([{ name: "pet.png", bytes: png }]);
const request = (ids) => ({
  name: "터치",
  features: "이마의 흰 하트, 분홍 입가",
  style: "pixel",
  quality: "medium",
  photoIds: ids,
  consent: true,
  mode: "generate",
});
async function done(id) {
  for (let i = 0; i < 100; i++) {
    const job = studio.job(id);
    if (["complete", "error", "canceled"].includes(job.status)) return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("job timeout");
}
test("imports actual image bytes and persists local library across restart", async () => {
  const photos = await ref();
  expect(photos[0].id).toMatch(/^[a-f0-9-]+$/);
  const next = await Studio.open({ dir, render, getKey: () => "" });
  expect((await next.state()).photos).toHaveLength(1);
  expect((await next.asset(photos[0].id)).mime).toBe("image/png");
});
test("rejects invalid files, excess files and oversized uploads", async () => {
  await expect(
    studio.importPhotos([{ name: "x.png", bytes: Buffer.from("bad") }]),
  ).rejects.toThrow();
  await expect(
    studio.importPhotos(Array(6).fill({ name: "x.png", bytes: png })),
  ).rejects.toThrow();
  await expect(
    studio.importPhotos([{ name: "x.svg", bytes: png }]),
  ).rejects.toThrow();
  await expect(
    studio.importPhotos([
      { name: "x.png", bytes: Buffer.alloc(21 * 1024 * 1024) },
    ]),
  ).rejects.toThrow();
});
test("validates consent, IDs, missing key, input length and enum before spending", async () => {
  const photos = await ref();
  const req = request(photos.map((p) => p.id));
  for (const bad of [
    { ...req, consent: false },
    { ...req, photoIds: ["../../etc/passwd"] },
    { ...req, name: "" },
    { ...req, features: "x".repeat(2001) },
    { ...req, style: "bad" },
    { ...req, quality: "bad" },
    { ...req, mode: "bad" },
    { ...req, photoIds: [] },
    { ...req, mode: "refine", baseId: "bad" },
  ])
    await expect(studio.start(bad)).rejects.toThrow();
  studio.getKey = () => "";
  await expect(studio.start(req)).rejects.toThrow("API");
  expect(render).not.toHaveBeenCalled();
});
test("generation saves a real provider result and usage without exposing key", async () => {
  const photos = await ref();
  const j = await studio.start(request(photos.map((p) => p.id)));
  const end = await done(j.id);
  expect(end.status).toBe("complete");
  const state = await studio.state();
  expect(state.artworks).toHaveLength(1);
  expect(state.artworks[0].usage.total_tokens).toBe(100);
  expect(JSON.stringify(state)).not.toContain("test-key");
  expect(render.mock.calls[0][0].images).toHaveLength(1);
  expect(render.mock.calls[0][0].prompt).toContain("이마의 흰 하트");
});
test("refining and blinking use selected master as first reference and retain parent ID", async () => {
  const base = await studio.importArtwork({ name: "master.png", bytes: png });
  const j = await studio.start({
    ...request([]),
    mode: "blink",
    baseId: base.id,
  });
  const end = await done(j.id);
  expect(end.status).toBe("complete");
  expect(render.mock.calls[0][0].prompt).toMatch(/eyes|blink/i);
  expect((await studio.state()).artworks[0].parentId).toBe(base.id);
  const edit = await studio.start({
    ...request([]),
    mode: "refine",
    baseId: base.id,
    instruction: "하트를 크게",
  });
  await done(edit.id);
  expect(render.mock.calls[1][0].prompt).toContain("하트를 크게");
});
test("allows only one active job, cancels and never saves a canceled result", async () => {
  render.mockImplementation(
    () => new Promise((r) => setTimeout(() => r({ buffer: png }), 50)),
  );
  const photos = await ref();
  const req = request(photos.map((p) => p.id));
  const job = await studio.start(req);
  await expect(studio.start(req)).rejects.toThrow("진행");
  studio.cancel(job.id);
  expect((await done(job.id)).status).toBe("canceled");
  await new Promise((r) => setTimeout(r, 70));
  expect((await studio.state()).artworks).toHaveLength(0);
});
test("provider failures are actionable and hide secrets", async () => {
  render.mockRejectedValue({ status: 401, message: "secret test-key" });
  const photos = await ref();
  const j = await studio.start(request(photos.map((p) => p.id)));
  const end = await done(j.id);
  expect(end.error).toContain("API");
  expect(end.error).not.toContain("test-key");
});
test("exports PNG, actual 128px pixels, and animated GIF; rejects unrelated frames", async () => {
  const master = await studio.importArtwork({ name: "master.png", bytes: png });
  const j = await studio.start({
    ...request([]),
    mode: "blink",
    baseId: master.id,
  });
  const blink = (await done(j.id)).artworkId;
  const raw = await studio.export(master.id, "png");
  expect((await sharp(raw.buffer).metadata()).width).toBe(32);
  const px = await studio.export(master.id, "pixel");
  expect((await sharp(px.buffer).metadata()).width).toBe(128);
  const gif = await studio.export(master.id, "gif", blink);
  expect(gif.buffer.subarray(0, 3).toString()).toBe("GIF");
  expect(
    (await sharp(gif.buffer, { animated: true }).metadata()).pages,
  ).toBeGreaterThan(1);
  await expect(studio.export(master.id, "gif", master.id)).rejects.toThrow();
  await expect(studio.export(master.id, "bad")).rejects.toThrow();
  await expect(studio.asset("../bad")).rejects.toThrow();
  expect(studio.job("missing")).toBeNull();
});
test("image processing preserves alpha and validates input", async () => {
  const transparent = await sharp({
    create: {
      width: 64,
      height: 32,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  expect((await sharp(await normalize(transparent)).metadata()).width).toBe(64);
  expect(
    (await sharp(await pixelate(transparent, 128)).metadata()).hasAlpha,
  ).toBe(true);
  expect((await animate(png, png)).subarray(0, 3).toString()).toBe("GIF");
  await expect(pixelate(png, 0)).rejects.toThrow();
});
test("prompt preserves identity and provider edit payload contains reference photos", async () => {
  expect(buildPrompt(request(["a"]))).toMatch(/same|identity/i);
  const edit = vi.fn(async () => ({
    data: [{ b64_json: png.toString("base64") }],
    usage: { total_tokens: 3 },
  }));
  const renderer = createRenderer(() => ({ images: { edit } }));
  const result = await renderer({
    images: [png],
    prompt: "portrait",
    quality: "medium",
    apiKey: "test-key",
    signal: new AbortController().signal,
  });
  expect(result.buffer.equals(png)).toBe(true);
  expect(edit.mock.calls[0][0].image).toHaveLength(1);
  expect(edit.mock.calls[0][0].n).toBe(1);
  edit.mockResolvedValue({ data: [] });
  await expect(
    renderer({ images: [png], prompt: "x", quality: "medium", apiKey: "x" }),
  ).rejects.toThrow();
  for (const code of [400, 401, 403, 429, 500])
    expect(publicError({ status: code, message: "secret" })).not.toContain(
      "secret",
    );
  expect(publicError({ name: "AbortError" })).toContain("취소");
});
