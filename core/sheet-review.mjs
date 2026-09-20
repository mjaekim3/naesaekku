import sharp from "sharp";
// Remove only a near-uniform color connected to the image edge. No AI inference.
function clearBackground(data, w, h) {
  const corners = [0, w - 1, (h - 1) * w, w * h - 1];
  const color = [0, 1, 2].map((c) =>
    Math.round(corners.reduce((s, p) => s + data[p * 4 + c], 0) / 4),
  );
  const matches = (p) =>
    [0, 1, 2].every((c) => Math.abs(data[p * 4 + c] - color[c]) <= 24);
  if (!corners.every(matches)) return false;
  const seen = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  const add = (p) => {
    if (!seen[p] && matches(p)) {
      seen[p] = 1;
      queue[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    add(x);
    add((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    add(y * w);
    add(y * w + w - 1);
  }
  while (head < tail) {
    const p = queue[head++];
    data[p * 4 + 3] = 0;
    const x = p % w,
      y = Math.floor(p / w);
    if (x) add(p - 1);
    if (x < w - 1) add(p + 1);
    if (y) add(p - w);
    if (y < h - 1) add(p + w);
  }
  return true;
}
export async function reviewSheet(
  buffer,
  { single = false, removeBackground = false, autoSplit = true } = {},
) {
  if (
    typeof single !== "boolean" ||
    typeof removeBackground !== "boolean" ||
    typeof autoSplit !== "boolean"
  )
    throw Error("잘못된 시트 옵션이에요.");
  const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (
    !["png", "jpeg", "webp"].includes(meta.format) ||
    meta.pages > 1 ||
    meta.width < 32 ||
    meta.height < 32 ||
    (!single &&
      (meta.width < 256 ||
        meta.height < 256 ||
        meta.width / meta.height < 0.7 ||
        meta.width / meta.height > 1.4))
  )
    throw Error("4×4 시트 이미지 또는 한 칸 교체용 이미지를 선택해주세요.");
  const size = single ? 1 : 4,
    tiles = [];
  const rows = Array.from({ length: size }, () =>
    Array.from({ length: size + 1 }, (_, i) =>
      Math.round((i * meta.height) / size),
    ),
  );
  let adjusted = false;
  if (!single && autoSplit && meta.hasAlpha) {
    const alpha = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .extractChannel("alpha")
      .raw()
      .toBuffer();
    for (let col = 0; col < 4; col++) {
      const x0 = Math.round((col * meta.width) / 4),
        x1 = Math.round(((col + 1) * meta.width) / 4);
      const occupied = new Uint8Array(meta.height);
      for (let y = 0; y < meta.height; y++)
        for (let x = x0; x < x1; x++)
          if (alpha[y * meta.width + x] > 24) {
            occupied[y] = 1;
            break;
          }
      for (let row = 1; row < 4; row++) {
        const nominal = rows[col][row];
        if (!occupied[nominal] && !occupied[nominal - 1]) continue;
        const radius = Math.floor((meta.height / 4) * 0.35),
          lo = Math.max(1, nominal - radius),
          hi = Math.min(meta.height - 1, nominal + radius);
        let candidate = nominal,
          distance = Infinity;
        for (let y = lo; y <= hi; y++) {
          if (occupied[y]) continue;
          const start = y;
          while (y <= hi && !occupied[y]) y++;
          if (y - start < 3) continue;
          const mid = Math.floor((start + y - 1) / 2),
            d = Math.abs(mid - nominal);
          if (d < distance) {
            distance = d;
            candidate = mid;
          }
        }
        rows[col][row] = candidate;
        if (candidate !== nominal) adjusted = true;
      }
    }
  }
  for (let i = 0; i < size * size; i++) {
    const col = i % size,
      row = Math.floor(i / size);
    const left = Math.round((col * meta.width) / size),
      top = rows[col][row];
    const width = Math.round(((col + 1) * meta.width) / size) - left,
      height = rows[col][row + 1] - top;
    const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 })
      .extract({ left, top, width, height })
      .resize({
        width: 1024,
        height: 1024,
        fit: "inside",
        withoutEnlargement: true,
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const originalImage =
      "data:image/png;base64," +
      (await sharp(data, { raw: info }).png().toBuffer()).toString("base64");
    const w = info.width,
      h = info.height,
      warnings = [];
    if (removeBackground && !clearBackground(data, w, h))
      warnings.push("background");
    let l = w,
      t = h,
      r = -1,
      b = -1,
      clear = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 24) {
          l = Math.min(l, x);
          t = Math.min(t, y);
          r = Math.max(r, x);
          b = Math.max(b, y);
        } else clear++;
      }
    if (r < 0) warnings.push("empty");
    else if (l < 2 || t < 2 || r >= w - 2 || b >= h - 2) warnings.push("edge");
    if (r >= 0 && (i === 14 || single) && t < h * 0.12)
      warnings.push("headroom");
    if (clear < w * h * 0.01) warnings.push("opaque");
    let image = sharp({
      create: { width: 512, height: 512, channels: 4, background: "#00000000" },
    });
    if (r >= 0) {
      const crop = await sharp(data, { raw: info })
        .extract({ left: l, top: t, width: r - l + 1, height: b - t + 1 })
        .resize({ width: 360, height: 360, fit: "inside", kernel: "lanczos3" })
        .png()
        .toBuffer();
      const m = await sharp(crop).metadata();
      image = image.composite([
        {
          input: crop,
          left: Math.floor((512 - m.width) / 2),
          top: 436 - m.height,
        },
      ]);
    }
    tiles.push({
      originalImage,
      image:
        "data:image/png;base64," +
        (await image.png().toBuffer()).toString("base64"),
      warnings,
    });
  }
  return { cells: tiles, adjusted };
}
