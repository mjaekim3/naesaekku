import fs from "node:fs/promises";
import path from "node:path";
import { Studio } from "../core/studio.mjs";

const photo = process.argv[2];
if (!photo) throw Error("Pass a local pet photograph path.");
const dir = path.resolve("test-results/local-live");
const studio = await Studio.open({ dir, getKey: () => "" });
const [item] = await studio.importPhotos([
  { name: path.basename(photo), bytes: await fs.readFile(photo) },
]);
const job = await studio.startLocal({
  name: "터치",
  photoIds: [item.id],
  style: "pixel",
  features:
    "Japanese Chin. White heart-shaped forehead marking, black floppy feathered ears, large round dark eyes, short flat muzzle with white fur and slightly pink lips, happy small pink tongue. White chest and legs, black patches on back. Owner traits take priority over uncertain photo analysis.",
});
let last = "";
while (studio.active) {
  const state = studio.job(job.id);
  if (last !== state.stage) {
    console.log(state.stage);
    last = state.stage;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
const result = studio.job(job.id);
await fs.writeFile(
  path.join(dir, "result.json"),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
if (result.status !== "complete") process.exitCode = 1;
