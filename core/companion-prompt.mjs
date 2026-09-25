// ChatGPT prompt for the default "companion-v1" sheet. Cell numbers are
// 1-16 to match the downloadable layout reference (SheetReview
// downloadTemplate), whose dashed boxes carry the exact margins; the app
// cuts, scales and baseline-aligns the cells itself, so the prompt only
// states what the model must draw.
const oneLine = (value) => value.replace(/\s+/g, " ").trim();

export function companionSheetPrompt({ name, features }) {
  const notes = oneLine(features || "") || "none; follow the photos";
  return `Create ONE square PNG with a real transparent background: a 4×4 sprite sheet (16 equal cells, read left to right, top to bottom) of the SAME pet as in the attached photos, for a desktop pet app.

PET
Name: ${oneLine(name)}. Owner's notes (must follow): ${notes}.
Match the photos exactly: species, face shape, eye size and spacing, muzzle, ear shape, body proportions, tail length, fur colors and markings. Do not make it cuter (no bigger eyes, rounder head or shorter muzzle). Draw the same character in every cell, never the photos themselves. Natural expression: cats keep a relaxed closed mouth; dogs get no forced tongue or human smile.

STYLE
Warm 2D cartoon: thin brown outlines, soft cream highlights, light shading, neatly simplified fur. No pixel art, photorealism or 3D.

LAYOUT
If a layout reference is attached, use it only for cell positions and action order. Never reproduce its text, numbers, lines or dashed boxes.
Divide the full square canvas into exactly 4 columns and 4 rows of equal square cells. These boundaries are invisible and must not be drawn. Do not crop the canvas to the artwork.
• One complete pet per cell, centered inside the cell's dashed box, leaving about 15% empty space on every side. This includes every ear tip, paw, whisker and the entire tail.
• Scale the whole pet proportionally to fit. Never crop, shorten or bend body parts to fit.
• Keep the pet the same size in every cell (same head size). Within each animation keep the same camera and ground-contact baseline, choosing the scale from its largest pose.
• Generous empty space takes priority over making the sprites large.

CELLS
1–8: one seamless walking cycle in strict right-facing side view, eight distinct leg phases, head and body steady.
9: sitting, facing front, eyes open.
10: identical to 9 with the eyes closed (blink).
11: curled up asleep, eyes closed.
12: identical to 11 with the chest slightly raised (breathing).
13: sitting in three-quarter view, both front paws on the ground (greeting).
14: identical to 13 with one small natural change: dogs move the tail to the other side; cats slow-blink and move the tail tip. No raised paw.
15: gently lifted UPRIGHT in midair, facing front. The chest and abdomen face the viewer vertically, with the pelvis directly below the chest. Both front legs hang loosely alongside the upper abdomen, elbows softly bent and front paws around waist level. Both hind legs dangle below the pelvis, with hind paws clearly LOWER than the front paws. Show the abdomen between the two tiers of paws. All four limbs are distinguishable and relaxed, with no weight-bearing paws. Keep the mouth closed and the entire natural tail visible.
This must read as a suspended pet with dangling legs, not a standing or seated pet.
Same size as cell 9 (same head size): do not shrink it. The upright pose is taller, so use the cell's taller, narrower dashed box, keep the head centered horizontally, and leave at least 12% empty space above the highest ear tip and below the lowest paw or tail tip. Preserve full natural ear length and shape.
No hands, people, harness, strings or collar tension.
16: landing gently on all four paws in three-quarter view, knees slightly bent.

AVOID
Text, numbers, grid lines, borders, checkerboard, background color, shadows, props, motion lines, stray pixels.

Use the largest native square resolution available (ideally 4096×4096) without upscaling. Generate one image, then stop.`;
}
