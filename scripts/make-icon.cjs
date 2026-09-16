'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
async function main() {
  const root = path.join(__dirname, '..');
  const source = PNG.sync.read(fs.readFileSync(path.join(root, 'assets', 'touch.png')));
  // Pad for ICO's square canvas; preserve the original artwork and aspect ratio.
  const side = Math.max(source.width, source.height);
  const square = new PNG({ width: side, height: side });
  PNG.bitblt(source, square, 0, 0, source.width, source.height,
    Math.floor((side - source.width) / 2), Math.floor((side - source.height) / 2));
  const { default: pngToIco } = await import('png-to-ico');
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), await pngToIco(PNG.sync.write(square)));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
