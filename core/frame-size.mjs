import sharp from "sharp";

// Pet frames are stored at 3x the on-screen 192 px so the pet window can
// draw them crisply on scaled displays (the built-in Nerburi uses 543 x 724
// source frames for a 150 x 200 box). Hit-test masks stay at 192 x 192:
// click precision does not need more, and packs saved before the change
// (192 px frames, same masks) keep loading.
export const FRAME_SIZE = 576;
export const MASK_SIZE = 192;
export const PACK_FRAME_SIZES = [MASK_SIZE, FRAME_SIZE];
const unit = FRAME_SIZE / 192;
// Same layout as the original 192 px frames: 176 x 168 fit box, feet on 184.
export const FIT_WIDTH = 176 * unit;
export const FIT_HEIGHT = 168 * unit;
export const BASELINE = 184 * unit;
// The lifted pose may reach up to 8/192 of the frame below its top edge.
export const LIFT_MAX_HEIGHT = BASELINE - 8 * unit;

// Scale an extracted sprite with a smooth filter and place it bottom-centred
// on a transparent FRAME_SIZE canvas.
export async function placeSprite(input, width, height) {
  const tile = await sharp(input.data, { raw: input.info })
    .extract(input.region)
    .resize(width, height, { kernel: "lanczos3" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: FRAME_SIZE, height: FRAME_SIZE, channels: 4, background: "#00000000" },
  })
    .composite([{ input: tile, left: Math.floor((FRAME_SIZE - width) / 2), top: Math.round(BASELINE) - height }])
    .png()
    .toBuffer();
}

// 20 hit-test masks (MASK_SIZE x MASK_SIZE alpha each) for the pet window.
export async function frameMasks(frames) {
  return Buffer.concat(
    await Promise.all(
      frames.map((frame) =>
        sharp(frame).resize(MASK_SIZE, MASK_SIZE, { kernel: "lanczos3" }).extractChannel(3).raw().toBuffer(),
      ),
    ),
  );
}
