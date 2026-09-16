`touch.png` is a pixel-art conversion (Retro Diffusion, rd_pro__pixelate) of the original illustration, made on 2026-09-16.
It is 256 × 213 pixels, transparent background, with the head on the right. Used as the idle pose.
The original illustration is kept at `drafts/touch-original-illustration.png`.
`icon.ico` is generated from the same artwork, with transparent padding to preserve its aspect ratio.
Regenerate it with `node scripts/make-icon.cjs` after replacing the image.

`walk/frame-01.png` … `frame-10.png` are the walking sprite cycle (640 × 498 each, transparent, same
smooth-illustration style as the original artwork — not yet pixel-art converted, since that needs
Retro Diffusion balance). `src/pet.js` cycles through them while the pet is walking. Source frames
(1422 × 1106) are in `drafts/walk_frames_raw/`; frame 5 had a baked-in checkerboard background instead
of real alpha and was background-removed before resizing. Once there's enough Retro Diffusion balance,
re-run all 10 through the same rd_pro__pixelate pipeline as `touch.png` for a consistent look.
