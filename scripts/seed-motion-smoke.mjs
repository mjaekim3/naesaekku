import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
const dir = path.resolve(process.argv[2] || "test-results/motion-flow");
await fs.mkdir(dir, { recursive: true });
// Existing bundled art is used only as a deterministic import/UI fixture.
for (const [action, ids] of Object.entries({
  walk: [12, 13, 14, 15, 16, 17, 18, 19],
  idle: [4, 5],
  sleep: [6, 7],
  eat: [8, 9],
})) {
  const columns = action === "walk" ? 4 : 2,
    rows = action === "walk" ? 2 : 1;
  await sharp({
    create: {
      width: columns * 192,
      height: rows * 192,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(
      await Promise.all(
        ids.map(async (id, i) => ({
          input: await fs.readFile(`public/pet/${id}.png`),
          left: (i % columns) * 192,
          top: Math.floor(i / columns) * 192,
        })),
      ),
    )
    .png()
    .toFile(path.join(dir, action + ".png"));
}
console.log(dir);
