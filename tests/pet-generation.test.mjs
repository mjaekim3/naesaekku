import { test, expect } from 'vitest';
import sharp from 'sharp';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Studio } from '../core/studio.mjs';
import { preparePetSheet, loadPetPack } from '../core/pet-pack.mjs';

async function sheet() {
  const sprite = await sharp({create:{width:36,height:40,channels:4,background:'#333333'}}).png().toBuffer();
  return sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
    .composite(Array.from({length:16},(_,i)=>({input:sprite,left:(i%4)*64+14,top:Math.floor(i/4)*64+12}))).png().toBuffer();
}
test('sprite processing produces compatible frames and masks; rejects empty and opaque sheets', async () => {
  const pack = await preparePetSheet(await sheet());
  expect(pack.frames).toHaveLength(20);
  expect(pack.alpha.length).toBe(20*192*192);
  expect((await sharp(pack.frames[4]).metadata()).width).toBe(192);
  const opaque = await sharp({create:{width:256,height:256,channels:4,background:'#ffffff'}}).png().toBuffer();
  await expect(preparePetSheet(opaque)).rejects.toThrow();
  const blank = await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}}).png().toBuffer();
  await expect(preparePetSheet(blank)).rejects.toThrow();
});
test('photo to master to motion pack persists across restart with two explicit API requests', async () => {
  const dir = await mkdtemp(join(tmpdir(),'pet-generation-'));
  try {
    const picture = await sheet();
    const prompts=[];
    const studio = await Studio.open({dir,getKey:()=> 'test-only',render:async ({prompt})=>{prompts.push(prompt);return {buffer:picture};}});
    const photos = await studio.importPhotos([{name:'pet.png',bytes:picture}]);
    const job = await studio.start({name:'터치',features:'흰 하트',style:'pixel',quality:'low',mode:'pet',photoIds:photos.map(x=>x.id),consent:true});
    for(let i=0;i<300 && studio.job(job.id).status==='running';i++) await new Promise(r=>setTimeout(r,10));
    expect(studio.job(job.id).status).toBe('complete');
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain('4 columns');
    const id=studio.job(job.id).artworkId;
    const pack=await loadPetPack(dir,id);
    expect(pack.manifest.name).toBe('터치');
    expect(pack.alpha.length).toBe(20*192*192);
    const reopened=await Studio.open({dir});
    expect((await reopened.state()).artworks.find(x=>x.id===id).hasMotion).toBe(true);
    await expect(loadPetPack(dir,'../../bad')).rejects.toThrow();
    expect(JSON.parse(await readFile(join(dir,'library.json'),'utf8')).attempts).toHaveLength(2);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
