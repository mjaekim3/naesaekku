import sharp from "sharp";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { NATURAL_APPEARANCE } from "./appearance-prompt.mjs";
import {
  FIT_WIDTH,
  FIT_HEIGHT,
  LIFT_MAX_HEIGHT,
  FRAME_SIZE,
  MASK_SIZE,
  PACK_FRAME_SIZES,
  placeSprite,
  frameMasks,
} from "./frame-size.mjs";
export const validPackId = (id) =>
  typeof id === "string" && /^[a-f0-9-]{36}$/.test(id);
export async function preparePetSheet(buffer) {
  const image = sharp(buffer, { limitInputPixels: 40_000_000 });
  const meta = await image.metadata();
  if (
    !meta.hasAlpha ||
    meta.width < 256 ||
    meta.height < 256 ||
    Math.abs(meta.width / meta.height - 1) > 0.02
  )
    throw Error("SPRITE_LAYOUT");
  const tiles = [];
  for (let i = 0; i < 16; i++) {
    const left = Math.round(((i % 4) * meta.width) / 4),
      top = Math.round((Math.floor(i / 4) * meta.height) / 4);
    const width = Math.round((((i % 4) + 1) * meta.width) / 4) - left,
      height = Math.round(((Math.floor(i / 4) + 1) * meta.height) / 4) - top;
    const { data, info } = await sharp(buffer)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let l = width,
      t = height,
      r = -1,
      b = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[(y * width + x) * 4 + 3] > 24) {
          l = Math.min(l, x);
          t = Math.min(t, y);
          r = Math.max(r, x);
          b = Math.max(b, y);
        }
    if (r < 0 || l < 2 || t < 2 || r >= width - 2 || b >= height - 2)
      throw Error("SPRITE_LAYOUT");
    tiles.push({
      data,
      info,
      left: l,
      top: t,
      width: r - l + 1,
      height: b - t + 1,
    });
  }
  // One common scale for all 16 cells keeps the pet the same size across
  // animations, exactly as drawn in the sheet. The upright lifted pose
  // (cell index 14) is taller than the others at the same body size, so it
  // does not set the height limit; it may use the headroom above the fit box
  // instead of shrinking every other animation.
  const lifted = tiles[14];
  const scale = Math.min(
    FIT_WIDTH / Math.max(...tiles.map((t) => t.width)),
    FIT_HEIGHT / Math.max(...tiles.filter((t) => t !== lifted).map((t) => t.height)),
    LIFT_MAX_HEIGHT / lifted.height,
  );
  const normalized = [];
  for (const t of tiles) {
    const w = Math.max(1, Math.round(t.width * scale)),
      h = Math.max(1, Math.round(t.height * scale));
    normalized.push(
      await placeSprite(
        { data: t.data, info: t.info, region: { left: t.left, top: t.top, width: t.width, height: t.height } },
        w,
        h,
      ),
    );
  }
  const map = [
    0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7,
  ];
  const frames = map.map((i) => normalized[i]);
  return { frames, alpha: await frameMasks(frames) };
}
export async function savePetPack(
  dir,
  id,
  name,
  sheet,
  sheetFormat = "legacy",
) {
  if (!validPackId(id)) throw Error("Invalid pet id");
  const pack = await preparePetSheet(sheet);
  return savePreparedPetPack(dir, id, name, pack, sheet, sheetFormat);
}
export async function savePreparedPetPack(
  dir,
  id,
  name,
  pack,
  sheet,
  sheetFormat = "legacy",
) {
  if (!["legacy", "lift-v2", "companion-v1"].includes(sheetFormat))
    throw Error("Invalid sheet format");
  if (!validPackId(id)) throw Error("Invalid pet id");
  const parent = join(dir, "pets");
  await mkdir(parent, { recursive: true });
  const tmp = join(parent, id + ".tmp");
  await mkdir(tmp, { recursive: true });
  await Promise.all(
    pack.frames.map((f, i) => writeFile(join(tmp, `${i}.png`), f)),
  );
  await writeFile(join(tmp, "alpha.bin"), pack.alpha);
  await writeFile(
    join(tmp, "manifest.json"),
    JSON.stringify({
      version: 1,
      id,
      name,
      frames: 20,
      size: FRAME_SIZE,
      maskSize: MASK_SIZE,
      sheetFormat,
    }),
  );
  await writeFile(join(tmp, "sheet.png"), sheet);
  await rename(tmp, join(parent, id));
}
export async function loadPetPack(dir, id) {
  if (!validPackId(id)) throw Error("Invalid pet id");
  const root = join(dir, "pets", id);
  const manifest = JSON.parse(
    await readFile(join(root, "manifest.json"), "utf8"),
  );
  const alpha = await readFile(join(root, "alpha.bin"));
  if (
    manifest.frames !== 20 ||
    !PACK_FRAME_SIZES.includes(manifest.size) ||
    alpha.length !== 20 * MASK_SIZE * MASK_SIZE
  )
    throw Error("Invalid pet pack");
  await Promise.all(
    Array.from({ length: 20 }, (_, i) => readFile(join(root, `${i}.png`))),
  );
  return { root, manifest, alpha };
}
export function motionPrompt(name, sheetFormat = "legacy") {
  const ending =
    ["lift-v2", "companion-v1"].includes(sheetFormat)
      ? "Cell 14: lifted upright front-facing, relaxed legs dangling, calm closed mouth, full body visible, no hand or person or collar tension. Cell 15: gentle landing on four paws, slightly bent knees, relaxed expression. LIFT SAFETY: zoom out for cell 14 only; the entire lifted animal including BOTH ear tips, paws and tail must fit in the middle 60% of the cell height. Leave at least 25% completely empty space ABOVE the ear tips and 15% below the paws. Reduce the whole lifted animal proportionally if needed; never cut or bend its ears to fit. No hand above the head. Keep the lifted head centered horizontally."
      : "Cells 14-15: relaxed seated eyes closed, subtle species-appropriate tail movement.";
  return `Create one square transparent PNG sprite sheet for the SAME pet ${name} in the FIRST reference (approved master). Preserve its identity, markings and art style. ${NATURAL_APPEARANCE} EXACTLY 4 columns and 4 rows, 16 equal cells, read left-to-right then top-to-bottom. No text, labels, grid lines, scenery or shadows. One complete pet per cell, confined to the central 65% of each cell. Leave fully transparent padding of at least 15% on ALL FOUR sides of EVERY cell, including tails, ears, whiskers, feet and bowls; never overlap cells. Do not crop the canvas to the subjects. No colored fringes, floating speckles or stray background pixels. Consistent camera and body scale within each animation; the lifted pose may be smaller to preserve headroom. Cells 0-7: eight sequential distinct frames of a seamless right-facing side-view walking cycle, natural alternating front and hind leg contact/pass/lift, stable head and torso. Cells 8-9: front-facing seated idle then eyes closed blink, mouth unchanged. Cells 10-11: curled sleeping, subtle breathing. ${sheetFormat === "companion-v1" ? "Cells 12-13: friendly greeting loop, same seated three-quarter view and fixed paws in both frames. For dogs: relaxed eyes and ears, loose body, gently wag the tail from one side to the other with a small chest sway. Preserve actual tail length, curl and ear shape; no forced tongue or human smile. For cats: gentle slow blink and subtle tail-tip movement, not a dog-like wag. No bowl or food. These frames play when the owner clicks the pet. Basic set: walking, idle/blink, sleeping, greeting; cells 14-15 support dragging." : "Cells 12-13: eating from small bowl, head down then slightly raised."} ${ending} Keep feet at the same baseline within each animation. Real transparent alpha, no checkerboard background.`;
}
