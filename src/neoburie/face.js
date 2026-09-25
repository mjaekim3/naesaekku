// Ported from FirstEduKitSeries src/app/login/neoburieFace.ts.
// Coordinates belong to the original 543 × 724 sprite frame, before mirroring.
import { createCarePainter } from "./care.js";

const STALK_EYES = [
  { cx: 420, cy: 487, rx: 20, ry: 21 },
  { cx: 486, cy: 486, rx: 17, ry: 20 },
];
const STALK_FACE_SPARKLE_MASKS = [
  { cx: 379, cy: 487, rx: 20, ry: 31 },
  { cx: 529, cy: 486, rx: 14, ry: 30 },
];
export const HELD_SHEET = "neoburie-held-v4-hand-4f.png";
const STALK_SHEET = "neoburie-stalk-v15-clean.png";
const DIZZY_SHEET = "neoburie-dizzy-v10-held-rotating-spirals-8f.png";
const SWAT_SHEET = "neoburie-swat-v4.png";

const heldFrameAt = (time) => Math.floor(Math.max(0, time) / 135) % 4;
const dizzyFrameAt = (time) => Math.floor(Math.max(0, time) / 150) % 8;
const stalkFrameAt = (phase) => Math.min(5, Math.floor(Math.max(0, phase) * 6));

function swatFrameAt(phase) {
  if (phase < .12) return 0;
  if (phase < .24) return 1;
  if (phase < .38) return 2;
  if (phase < .5) return 5;
  if (phase < .6) return 4;
  if (phase < .7) return 5;
  if (phase < .8) return 4;
  if (phase < .89) return 2;
  if (phase < .97) return 1;
  return 0;
}

function mapStalkEyePixel(eye, x, y, focus, lookX, lookY) {
  const dx = x - eye.cx;
  const dy = y - eye.cy;
  const radius = Math.hypot(dx / eye.rx, dy / eye.ry);
  const weight = Math.max(0, 1 - radius * radius);
  const scale = 1 + focus * .75 * weight;
  return {
    x: Math.round(eye.cx + (dx - lookX * weight) / scale),
    y: Math.round(eye.cy + (dy - lookY * weight) / scale),
  };
}

function getStalkPupilCovers(phase, lookX, lookY) {
  if (phase < .6) return [];
  return STALK_EYES.map((eye) => ({
    cx: eye.cx + lookX, cy: eye.cy + lookY,
    rx: eye.rx * .7, ry: eye.ry * .8,
    color: "#0b1511", clip: eye,
  }));
}

function getStalkEyeGlints(phase, lookX = 0, lookY = 0) {
  if (phase < .6) return [];
  const rise = Math.min(1, Math.max(0, (phase - .6) / .22));
  const easedRise = rise * rise * (3 - 2 * rise);
  const verticalRadius = 9 + 4 * easedRise;
  const alpha = .78 + .22 * easedRise;
  return STALK_EYES.map((eye) => ({
    cx: eye.cx + lookX, cy: eye.cy + lookY,
    horizontalRadius: Math.max(eye.rx * .38, verticalRadius * .6),
    verticalRadius, alpha, color: "#ffffff", clip: eye,
  }));
}

function clipToStalkEye(context, eye) {
  context.beginPath();
  context.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2);
  context.clip();
}

function paintDiamond(context, glint) {
  const { cx, cy, horizontalRadius: x, verticalRadius: y } = glint;
  context.beginPath();
  context.moveTo(cx, cy - y);
  context.lineTo(cx + x, cy);
  context.lineTo(cx, cy + y);
  context.lineTo(cx - x, cy);
  context.closePath();
  context.fill();
}

function paintStalkEyes(output, stalk, original, eyeCanvas, eyeContext, focus, lookX, lookY) {
  eyeContext.clearRect(0, 0, 543, 724);
  for (const eye of STALK_EYES) {
    const left = eye.cx - eye.rx;
    const top = eye.cy - eye.ry;
    const width = eye.rx * 2;
    const height = eye.ry * 2;
    const patch = eyeContext.createImageData(width, height);
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const mapped = mapStalkEyePixel(eye, left + px, top + py, focus, lookX, lookY);
      const sourceIndex = (mapped.y * 543 + mapped.x) * 4;
      const destinationIndex = (py * width + px) * 4;
      for (let channel = 0; channel < 4; channel++) patch.data[destinationIndex + channel] = original[sourceIndex + channel];
    }
    eyeContext.putImageData(patch, left, top);
  }
  // Restore clean face artwork over the generated eye area and the two
  // decorative starbursts beside the cheeks.
  output.save();
  output.beginPath();
  for (const eye of STALK_EYES) output.ellipse(eye.cx, eye.cy, eye.rx + 10, eye.ry + 8, 0, 0, Math.PI * 2);
  for (const mask of STALK_FACE_SPARKLE_MASKS) output.ellipse(mask.cx, mask.cy, mask.rx, mask.ry, 0, 0, Math.PI * 2);
  output.clip();
  output.drawImage(stalk, 0, 0, 543, 724, 0, 0, 543, 724);
  output.restore();

  output.save();
  output.beginPath();
  for (const eye of STALK_EYES) output.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2);
  output.clip();
  output.drawImage(eyeCanvas, 0, 0);
  output.restore();
}

export function createFacePainter(canvas, base) {
  const output = canvas.getContext("2d");
  const paintCare = createCarePainter(canvas, base);
  output.imageSmoothingEnabled = false;
  const stalkSource = document.createElement("canvas");
  stalkSource.width = 543;
  stalkSource.height = 724;
  const stalkSourceContext = stalkSource.getContext("2d", { willReadFrequently: true });
  const stalkEyes = document.createElement("canvas");
  stalkEyes.width = 543;
  stalkEyes.height = 724;
  const stalkEyeContext = stalkEyes.getContext("2d");
  const load = (file) => { const image = new Image(); image.src = base + file; return image; };
  const dizzy = load(DIZZY_SHEET);
  const held = load(HELD_SHEET);
  const stalk = load(STALK_SHEET);
  const swat = load(SWAT_SHEET);
  const loaded = (image) => image.complete && image.naturalWidth;
  let stalkPixels;

  return (mode, time, focus, lookX, lookY, phase = 0, artScale = 1) => {
    output.clearRect(0, 0, 543, 724);
    canvas.style.transformOrigin = "";
    canvas.dataset.atlas = "false";
    if (!mode) return false;
    if (mode === "stalk") {
      if (!loaded(stalk)) return false;
      // Keep the body progression monotonic while only the pupils dilate.
      const frame = stalkFrameAt(phase);
      output.drawImage(stalk, frame * 543, 0, 543, 724, 0, 0, 543, 724);
      if (!stalkPixels) {
        stalkSourceContext.drawImage(stalk, 0, 0, 543, 724, 0, 0, 543, 724);
        stalkPixels = stalkSourceContext.getImageData(0, 0, 543, 724);
      }
      paintStalkEyes(output, stalk, stalkPixels.data, stalkEyes, stalkEyeContext, focus, lookX, lookY);
      for (const cover of getStalkPupilCovers(phase, lookX, lookY)) {
        output.save();
        clipToStalkEye(output, cover.clip);
        output.beginPath();
        output.ellipse(cover.cx, cover.cy, cover.rx, cover.ry, 0, 0, Math.PI * 2);
        output.fillStyle = cover.color;
        output.fill();
        output.restore();
      }
      for (const glint of getStalkEyeGlints(phase, lookX, lookY)) {
        output.save();
        clipToStalkEye(output, glint.clip);
        output.fillStyle = glint.color;
        output.globalAlpha = glint.alpha;
        output.shadowColor = glint.color;
        output.shadowBlur = 1.5;
        paintDiamond(output, glint);
        output.restore();
      }
      return true;
    }
    if (mode === "swat") {
      if (!loaded(swat)) return false;
      output.drawImage(swat, swatFrameAt(phase) * 543, 0, 543, 724, 0, 0, 543, 724);
      return true;
    }
    if (mode === "wake" || mode === "groom" || mode === "pounce" || mode === "settle" || mode === "land") {
      return paintCare(mode, time, phase, artScale);
    }
    if (mode === "held") {
      if (!loaded(held)) return false;
      canvas.dataset.atlas = "true";
      output.drawImage(held, heldFrameAt(time) * 543, 0, 543, 724, 0, 0, 543, 724);
      return true;
    }
    if (mode === "dizzy") {
      if (!loaded(dizzy)) return false;
      canvas.dataset.atlas = "true";
      output.drawImage(dizzy, dizzyFrameAt(time) * 543, 0, 543, 724, 0, 0, 543, 724);
      return true;
    }
    return false;
  };
}
