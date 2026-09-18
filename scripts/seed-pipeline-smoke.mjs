// Offline integration fixture: uses existing artwork, never invokes an image API.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Studio } from "../core/studio.mjs";
const dir = resolve(process.argv[2]);
const order = [12, 13, 14, 15, 16, 17, 18, 19, 4, 5, 6, 7, 8, 9, 10, 11];
const sheet = await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: "#00000000" },
})
  .composite(
    await Promise.all(
      order.map(async (n, i) => ({
        input: await readFile(`public/pet/${n}.png`),
        left: (i % 4) * 256 + 32,
        top: Math.floor(i / 4) * 256 + 32,
      })),
    ),
  )
  .png()
  .toBuffer();
const master = await readFile("public/pet/4.png");
let calls = 0;
const studio = await Studio.open({
  dir,
  getKey: () => "offline-fixture",
  render: async () => ({ buffer: ++calls === 1 ? master : sheet }),
});
const photos = await studio.importPhotos([
  { name: "fixture.png", bytes: master },
]);
const job = await studio.start({
  name: "테스트 터치",
  features: "",
  style: "pixel",
  quality: "low",
  mode: "pet",
  consent: true,
  photoIds: [photos[0].id],
});
while (studio.job(job.id).status === "running")
  await new Promise((r) => setTimeout(r, 25));
const done = studio.job(job.id);
if (done.status !== "complete") throw Error(done.error);
await writeFile(join(dir, "fixture-id.txt"), done.artworkId);
console.log(
  JSON.stringify({ id: done.artworkId, apiCalls: 0, fixtureResponses: calls }),
);
