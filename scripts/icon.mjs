import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect x="8" y="8" width="240" height="240" rx="62" fill="#657b5b"/><path d="M128 190 68 133C23 90 80 40 128 85 176 40 233 90 188 133Z" fill="#f5f2df"/><circle cx="188" cy="57" r="11" fill="#bbcc9f"/></svg>';
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14);
head.writeUInt32LE(22, 18);
await mkdir("assets", { recursive: true });
await writeFile("assets/icon.ico", Buffer.concat([head, png]));
await writeFile("assets/icon.png", png);
