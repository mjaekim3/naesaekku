// Extract generated frames with a shared scale, then register heads to remove camera drift.
import sharp from "sharp";
import { copyFile, readFile, writeFile } from "node:fs/promises";
const source = process.argv[2];
if (!source) throw Error("Pass the eight-frame, four-column walking sheet.");
await copyFile(source, "assets/touch-walk-v2-source.png");
const meta = await sharp(source).metadata(),
  tiles = [];
for (let i = 0; i < 8; i++) {
  const x = Math.round(((i % 4) * meta.width) / 4),
    y = Math.round((Math.floor(i / 4) * meta.height) / 2);
  const w = Math.round((((i % 4) + 1) * meta.width) / 4) - x,
    h = Math.round(((Math.floor(i / 4) + 1) * meta.height) / 2) - y;
  const { data, info } = await sharp(source)
    .extract({ left: x, top: y, width: w, height: h })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let l = w,
    t = h,
    r = 0,
    b = 0;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++)
      if (data[(py * w + px) * 4 + 3] > 24) {
        l = Math.min(l, px);
        t = Math.min(t, py);
        r = Math.max(r, px);
        b = Math.max(b, py);
      }
  tiles.push({ data, info, l, t, w: r - l + 1, h: b - t + 1 });
}
const scale = Math.min(
  180 / Math.max(...tiles.map((t) => t.w)),
  160 / Math.max(...tiles.map((t) => t.h)),
);
const candidates = [];
for (const t of tiles) {
  const w = Math.round(t.w * scale),
    h = Math.round(t.h * scale);
  const tile = await sharp(t.data, { raw: t.info })
    .extract({ left: t.l, top: t.t, width: t.w, height: t.h })
    .resize(w, h, { kernel: "nearest" })
    .png()
    .toBuffer();
  candidates.push(
    await sharp({
      create: { width: 192, height: 192, channels: 4, background: "#00000000" },
    })
      .composite([
        { input: tile, left: Math.floor((192 - w) / 2), top: 185 - h },
      ])
      .raw()
      .toBuffer(),
  );
}
const ref = candidates[0],
  offsets = [];
for (let i = 0; i < 8; i++) {
  const data = candidates[i];
  let best = { dx: 0, dy: 0, loss: Infinity };
  // Match the head and upper chest, excluding moving feet and tail.
  for (let dy = -5; dy <= 5; dy++)
    for (let dx = -5; dx <= 5; dx++) {
      let loss = 0;
      for (let y = 28; y < 116; y += 2)
        for (let x = 108; x < 182; x += 2) {
          const a = (y * 192 + x) * 4,
            b = ((y - dy) * 192 + x - dx) * 4;
          for (let c = 0; c < 3; c++)
            loss += Math.abs(
              (ref[a + c] * ref[a + 3]) / 255 -
                (data[b + c] * data[b + 3]) / 255,
            );
          loss += Math.abs(ref[a + 3] - data[b + 3]) * 2;
        }
      if (loss < best.loss) best = { dx, dy, loss };
    }
  const out = Buffer.alloc(192 * 192 * 4);
  for (let y = 0; y < 192; y++)
    for (let x = 0; x < 192; x++) {
      const sx = x - best.dx,
        sy = y - best.dy;
      if (sx >= 0 && sy >= 0 && sx < 192 && sy < 192)
        data.copy(
          out,
          (y * 192 + x) * 4,
          (sy * 192 + sx) * 4,
          (sy * 192 + sx) * 4 + 4,
        );
    }
  await sharp(out, { raw: { width: 192, height: 192, channels: 4 } })
    .png()
    .toFile(`public/pet/${i + 12}.png`);
  offsets.push({ frame: i + 12, dx: best.dx, dy: best.dy });
}
const masks = [];
for (let i = 0; i < 20; i++)
  masks.push(
    await sharp(`public/pet/${i}.png`)
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer(),
  );
await writeFile("public/pet/alpha.bin", Buffer.concat(masks));
const manifest = JSON.parse(await readFile("public/pet/manifest.json", "utf8"));
manifest.frames = 20;
manifest.animations.walk = Array.from({ length: 8 }, (_, i) => i + 12);
manifest.animations.happy = [5];
manifest.walkAlignment = offsets;
await writeFile("public/pet/manifest.json", JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ scale, offsets }));
