import {test,expect} from 'vitest';
import sharp from 'sharp';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {splitMotion,motionGroupPrompt} from '../core/motion-import.mjs';
import {Studio} from '../core/studio.mjs';
async function sheet(columns,rows) {
 const tile=await sharp({create:{width:24,height:32,channels:4,background:'#123456'}}).png().toBuffer();
 return sharp({create:{width:columns*64,height:rows*64,channels:4,background:'#00000000'}}).composite(Array.from({length:columns*rows},(_,i)=>({input:tile,left:i%columns*64+8,top:Math.floor(i/columns)*64+16}))).png().toBuffer();
}
test('separate sheets split with stable canvas and baseline, and reject bad layouts',async()=>{
 const frames=await splitMotion(await sheet(4,2),'walk','alpha');
 expect(frames).toHaveLength(8);
 const raw=await sharp(frames[0]).ensureAlpha().raw().toBuffer();
 const ys=[];for(let y=0;y<192;y++)for(let x=0;x<192;x++)if(raw[(y*192+x)*4+3])ys.push(y);
 expect(Math.max(...ys)).toBe(183);
 await expect(splitMotion(await sheet(2,1),'walk','alpha')).rejects.toThrow();
 await expect(splitMotion(await sheet(2,1),'unknown','alpha')).rejects.toThrow();
 const flat=await sharp({create:{width:256,height:128,channels:3,background:'#fff'}}).png().toBuffer();
 await expect(splitMotion(flat,'idle','alpha')).rejects.toThrow();
 expect(motionGroupPrompt({name:'터치',features:'흰 하트',style:'pixel',action:'walk'})).toContain('RIGHT');
 expect(motionGroupPrompt({name:'터치',features:'흰 하트',style:'pixel',action:'master'})).toContain('흰 하트');
});
test('reviewed motion assembles without AI, preserves flip/order and requires review',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'motion-import-'));
 try {
  const s=await Studio.open({dir,getKey:()=>''});
  const groups={};
  for(const action of ['walk','idle','sleep','eat']) {
   const prepared=await s.prepareMotion({action,background:'alpha',file:{name:'sheet.png',bytes:await sheet(action==='walk'?4:2,action==='walk'?2:1)}});
   groups[action]=prepared.map(image=>({image,flip:false}));
  }
  const r={name:'터치',groups,reviewed:false};
  await expect(s.saveMotion(r)).rejects.toThrow();
  r.reviewed=true;
  const original=await s.saveMotion(r);
  groups.walk[0].flip=true;
  const edited=await s.saveMotion(r);
  const a=await s.petFrames(original.id), b=await s.petFrames(edited.id);
  expect(a).toHaveLength(20);
  expect(a[12]).not.toBe(b[12]);
  expect(a[13]).toBe(b[13]);
  expect(s.data.attempts).toHaveLength(0);
  await expect(s.saveMotion({...r,groups:{...groups,walk:[]}})).rejects.toThrow();
  groups.walk[0].image='https://example.com/image.png';
  await expect(s.saveMotion(r)).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true});}
});
