import sharp from "sharp";
import * as gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc.GIFEncoder
  ? gifenc
  : gifenc.default;
export async function normalize(bytes) {
  const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
  const meta = await image.metadata();
  if (!["jpeg", "png", "webp"].includes(meta.format) || meta.pages > 1)
    throw new Error("JPG, PNG, WebP 정지 이미지를 선택해주세요.");
  return image
    .rotate()
    .resize({
      width: 1536,
      height: 1536,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
}
export async function thumbnail(bytes) {
  return sharp(bytes)
    .resize(320, 320, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}
export async function pixelate(bytes, size = 128) {
  if (![64, 128, 192, 256].includes(size))
    throw new Error("지원하지 않는 픽셀 크기입니다.");
  return sharp(bytes)
    .resize(size, size, {
      fit: "contain",
      background: "#00000000",
      kernel: "nearest",
    })
    .png({ palette: true, colours: 48, dither: 0 })
    .toBuffer();
}
export async function animate(open, closed) {
  const encoder = GIFEncoder();
  for (const [buffer, delay] of [
    [open, 2000],
    [closed, 180],
    [open, 800],
  ]) {
    const rgba = await sharp(buffer)
      .resize(384, 384, {
        fit: "contain",
        background: "#00000000",
        kernel: "nearest",
      })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const palette = quantize(rgba, 255, {
      format: "rgba4444",
      oneBitAlpha: true,
    });
    const index = applyPalette(rgba, palette, "rgba4444");
    const transparentIndex = palette.findIndex((c) => c[3] === 0);
    encoder.writeFrame(index, 384, 384, {
      palette,
      delay,
      repeat: 0,
      dispose: 2,
      transparent: transparentIndex >= 0,
      transparentIndex: Math.max(0, transparentIndex),
    });
  }
  encoder.finish();
  return Buffer.from(encoder.bytes());
}
