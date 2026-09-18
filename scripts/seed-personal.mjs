// One-time personal setup; never bundled into the distributable app.
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Studio } from "../core/studio.mjs";
const dir = process.argv[2];
if (!dir) throw Error("Pass a personal app-data directory.");
const studio = await Studio.open({ dir: resolve(dir), getKey: () => "" });
if (studio.data.photos.length || studio.data.artworks.length) {
  console.log("Existing library preserved.");
  process.exit(0);
}
const photos = "C:/Users/mjaek/Downloads/터치";
await studio.importPhotos(
  await Promise.all(
    [
      "KakaoTalk_20260916_163059006_01.jpg",
      "KakaoTalk_20260916_213803994.jpg",
      "KakaoTalk_20260916_163059006_04.jpg",
    ].map(async (name) => ({
      name,
      bytes: await readFile(join(photos, name)),
    })),
  ),
);
const previous = "C:/MJ_Coding_Lab_Home/output/pet_memorial";
const base = await studio.importArtwork({
  name: "터치 · 이전 시안.png",
  bytes: await readFile(join(previous, "japanese_chin_open.png")),
});
const blink = await studio.importArtwork({
  name: "터치 · 이전 눈감기 시안.png",
  bytes: await readFile(join(previous, "japanese_chin_blink.png")),
});
Object.assign(blink, { mode: "blink", parentId: base.id });
// Keep the master first so the first launch opens a clear reference comparison.
studio.data.artworks = [base, blink];
await studio.save();
console.log(
  "3 original photos and 2 explicitly imported earlier drafts saved locally.",
);
