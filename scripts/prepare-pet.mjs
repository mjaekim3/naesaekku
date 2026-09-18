// Mechanical sprite-sheet slicing; the artwork is generated separately.
import sharp from 'sharp';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';
const source=process.argv[2];
if(!source)throw Error('Pass a 4-column, 3-row transparent sprite sheet.');
await mkdir('public/pet',{recursive:true});
await copyFile(source,'assets/touch-sheet-source.png');
const {width,height}=await sharp(source).metadata();
const masks=[];
for(let i=0;i<12;i++){
 const left=Math.round(i%4*width/4),top=Math.round(Math.floor(i/4)*height/3);
 const right=Math.round((i%4+1)*width/4),bottom=Math.round((Math.floor(i/4)+1)*height/3);
 await sharp(source).extract({left,top,width:right-left,height:bottom-top}).resize(192,192,{fit:'contain',kernel:'nearest',background:'#00000000'}).png().toFile(`public/pet/${i}.png`);
 masks.push(await sharp(`public/pet/${i}.png`).ensureAlpha().extractChannel(3).raw().toBuffer());
}
await writeFile('public/pet/alpha.bin',Buffer.concat(masks));
await writeFile('public/pet/manifest.json',JSON.stringify({name:'터치',width:192,height:192,frames:12,source:'AI-generated animation sheet derived from the approved earlier character',animations:{walk:[0,1,2,3],idle:[4,5],sleep:[6,7],eat:[8,9],happy:[10,11]}},null,2));
