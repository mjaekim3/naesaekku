import sharp from "sharp";
import { removeChroma } from "./local-ai.mjs";
export const MOTIONS = {
  walk: { columns: 4, rows: 2, count: 8 },
  idle: { columns: 2, rows: 1, count: 2 },
  sleep: { columns: 2, rows: 1, count: 2 },
  eat: { columns: 2, rows: 1, count: 2 },
};
const invalid = () =>
  Error(
    "동작 시트 규격을 확인해주세요. 걷기는 4×2칸, 나머지는 2×1칸이며 각 칸은 정사각형이어야 해요. 투명 여백과 빈 칸도 확인해주세요.",
  );
export function motionGroupPrompt(r) {
  if (
    !r ||
    typeof r.name !== "string" ||
    !r.name.trim() ||
    r.name.length > 40 ||
    typeof r.features !== "string" ||
    r.features.length > 2000 ||
    !["pixel", "storybook"].includes(r.style) ||
    !["master", ...Object.keys(MOTIONS)].includes(r.action)
  )
    throw Error("이름·특징과 동작을 확인해주세요.");
  const identity = `Pet: ${r.name}. Essential owner traits: ${r.features}. Preserve the SAME animal's identity, exact markings, ears, face and proportions. Style: ${r.style === "pixel" ? "crisp deliberate pixel art, no blurry pixel filter" : "warm storybook illustration"}.`;
  if (r.action === "master")
    return `${identity}\n첨부한 반려동물 원본 사진을 참고해서 기준 캐릭터 한 마리를 그려주세요. 전신, 정면으로 앉은 모습, 살짝 웃는 입과 작은 분홍 혀. 사진 속 귀와 털 무늬를 유지해주세요. 배경은 실제 투명 PNG, 정사각형 1024×1024, 모든 방향에 15% 여백. 글자·장식·그림자 없음. 동작은 아직 만들지 말고 기준 모습만 그려주세요.`;
  const poses = {
    walk: "All 8 frames face RIGHT in strict side profile; nose on the RIGHT, tail on the LEFT. Never turn the head or camera. Natural 8-frame quadruped walk: contact, down, passing, up, opposite contact, down, passing, up. Alternate front and hind leg support. Keep head, torso, nose and tail-root at the SAME pixel coordinates. Move paws and joints, not the whole animal. First and last frames must connect smoothly.",
    idle: "Frame 1: front-facing seated, eyes open, gentle smile. Frame 2: exactly the same drawing with ONLY the eyelids closed in a gentle blink. Keep head and body pixel-aligned.",
    sleep:
      "Both frames show the same curled-up sleeping pet with eyes closed and head on paws. Frame 2 changes ONLY the chest slightly for breathing. Same face, camera and position.",
    eat: "Both frames show the same pet and small bowl in the same three-quarter right view. Frame 1 head slightly lowered to food; frame 2 slightly raised chewing. Keep body, bowl, camera, scale and paws fixed.",
  };
  const spec = MOTIONS[r.action];
  return `${identity}\n첨부할 이미지는 이미 확정한 기준 캐릭터입니다. 이 캐릭터를 그대로 사용해 아래 한 가지 동작만 완성해주세요.\nEXACTLY ${spec.columns} columns and ${spec.rows} rows, ${spec.count} frames read left-to-right then top-to-bottom. Output ${spec.columns * 512}×${spec.rows * 512} PNG. Every cell is 512×512. ${poses[r.action]}\nUse the SAME scale and anchor across frames. Feet touch the same baseline. One complete animal per cell, 15% clear margin in each cell. No labels, grid lines, shadows or scenery. Real transparent alpha, NEVER draw a checkerboard. If transparency is impossible, use a perfectly flat magenta #FF00FF background and no magenta on the pet. Make the final downloadable image; do not return code.`;
}
export async function splitMotion(buffer, action, background = "alpha") {
  const spec = MOTIONS[action];
  if (!spec || !["alpha", "magenta"].includes(background)) throw invalid();
  if (background === "magenta") buffer = await removeChroma(buffer);
  const meta = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  if (
    !meta.hasAlpha ||
    meta.width < spec.columns * 32 ||
    meta.height < spec.rows * 32 ||
    Math.abs(meta.width / meta.height - spec.columns / spec.rows) > 0.02
  )
    throw invalid();
  const tiles = [];
  for (let i = 0; i < spec.count; i++) {
    const left = Math.round(((i % spec.columns) * meta.width) / spec.columns),
      top = Math.round(
        (Math.floor(i / spec.columns) * meta.height) / spec.rows,
      );
    const width =
        Math.round((((i % spec.columns) + 1) * meta.width) / spec.columns) -
        left,
      height =
        Math.round(
          ((Math.floor(i / spec.columns) + 1) * meta.height) / spec.rows,
        ) - top;
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
      throw invalid();
    tiles.push({ data, info, l, t, r, b });
  }
  const l = Math.min(...tiles.map((t) => t.l)),
    r = Math.max(...tiles.map((t) => t.r));
  const scale = Math.min(
    176 / (r - l + 1),
    168 / Math.max(...tiles.map((t) => t.b - t.t + 1)),
  );
  // Shared horizontal crop preserves the reference's torso anchor instead of
  // re-centering each frame whenever a paw/tail changes the silhouette width.
  return Promise.all(
    tiles.map(async (t) => {
      const width = Math.max(1, Math.round((r - l + 1) * scale)),
        height = Math.max(1, Math.round((t.b - t.t + 1) * scale));
      const tile = await sharp(t.data, { raw: t.info })
        .extract({ left: l, top: t.t, width: r - l + 1, height: t.b - t.t + 1 })
        .resize(width, height, { kernel: "nearest" })
        .png()
        .toBuffer();
      return sharp({
        create: {
          width: 192,
          height: 192,
          channels: 4,
          background: "#00000000",
        },
      })
        .composite([
          {
            input: tile,
            left: Math.floor((192 - width) / 2),
            top: 184 - height,
          },
        ])
        .png()
        .toBuffer();
    }),
  );
}
export async function assembleMotion(groups) {
  const normalized = [];
  for (const [action, spec] of Object.entries(MOTIONS)) {
    if (
      !Array.isArray(groups?.[action]) ||
      groups[action].length !== spec.count
    )
      throw Error("걷기·대기·수면·먹기 동작을 모두 가져와주세요.");
    for (const frame of groups[action]) {
      if (
        typeof frame?.image !== "string" ||
        frame.image.length > 1_000_000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(frame.image) ||
        typeof frame.flip !== "boolean"
      )
        throw Error("잘못된 동작 프레임이에요. PNG를 다시 가져와주세요.");
      const image = sharp(Buffer.from(frame.image.split(",")[1], "base64"), {
        limitInputPixels: 192 * 192,
      });
      const meta = await image.metadata();
      if (meta.width !== 192 || meta.height !== 192 || !meta.hasAlpha)
        throw Error("프레임은 192×192 투명 PNG여야 해요.");
      normalized.push(await image.flop(frame.flip).png().toBuffer());
    }
  }
  normalized.push(normalized[9], normalized[9]);
  const map = [
    0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15, 0, 1, 2, 3, 4, 5, 6, 7,
  ];
  const frames = map.map((i) => normalized[i]);
  const alpha = Buffer.concat(
    await Promise.all(
      frames.map((f) => sharp(f).extractChannel(3).raw().toBuffer()),
    ),
  );
  const sheet = await sharp({
    create: { width: 768, height: 768, channels: 4, background: "#00000000" },
  })
    .composite(
      normalized.map((input, i) => ({
        input,
        left: (i % 4) * 192,
        top: Math.floor(i / 4) * 192,
      })),
    )
    .png()
    .toBuffer();
  return { frames, alpha, sheet };
}
