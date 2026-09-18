// Mechanical sprite-sheet slicing; the artwork is generated separately.
import sharp from "sharp";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
const source = process.argv[2];
if (!source) throw Error("Pass a 4-column, 3-row transparent sprite sheet.");
await mkdir("public/pet", { recursive: true });
await copyFile(source, "assets/touch-sheet-source.png");
const { width, height } = await sharp(source).metadata();
const masks = [];
for (let i = 0; i < 12; i++) {
  // Measured row boundaries in this generated sheet; row 3 begins slightly above 2/3.
  const rows = [0, 1 / 3, 714 / 1086, 1],
    row = Math.floor(i / 4);
  const left = Math.round(((i % 4) * width) / 4),
    top = Math.round(rows[row] * height);
  const right = Math.round((((i % 4) + 1) * width) / 4),
    bottom = Math.round(rows[row + 1] * height);
  const cropped = await sharp(source)
    .extract({ left, top, width: right - left, height: bottom - top })
    .png()
    .toBuffer();
  // Normalize transparent margins and anchor feet to one baseline, without redrawing art.
  const { data: rgba, info } = await sharp(cropped)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (rgba[(y * info.width + x) * 4 + 3] > 24) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
  const targetW = Math.max(1, Math.round(((x1 - x0 + 1) * 184) / (width / 4))),
    targetH = Math.max(1, Math.round(((y1 - y0 + 1) * 184) / (width / 4)));
  const tile = await sharp(cropped)
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize(targetW, targetH, { kernel: "nearest" })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 192, height: 192, channels: 4, background: "#00000000" },
  })
    .composite([
      {
        input: tile,
        left: Math.floor((192 - targetW) / 2),
        top: 188 - targetH,
      },
    ])
    .png()
    .toFile(`public/pet/${i}.png`);
  masks.push(
    await sharp(`public/pet/${i}.png`)
      .ensureAlpha()
      .extractChannel(3)
      .raw()
      .toBuffer(),
  );
}
await writeFile("public/pet/alpha.bin", Buffer.concat(masks));
await writeFile(
  "public/pet/manifest.json",
  JSON.stringify(
    {
      name: "터치",
      width: 192,
      height: 192,
      frames: 12,
      source:
        "AI-generated animation sheet derived from the approved earlier character",
      animations: {
        walk: [0, 1, 2, 3],
        idle: [4, 5],
        sleep: [6, 7],
        eat: [8, 9],
        happy: [10, 11],
      },
    },
    null,
    2,
  ),
);
