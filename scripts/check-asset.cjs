'use strict';
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'assets', 'touch.png');
if (!fs.existsSync(file)) {
  console.error('Touch 원본 투명 PNG가 없습니다. assets/touch.png에 넣은 뒤 다시 빌드하세요.');
  process.exit(1);
}
const buffer = fs.readFileSync(file);
if (!buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
  throw new Error('assets/touch.png must be an actual PNG.');
}
