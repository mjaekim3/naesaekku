import { test, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Studio } from '../core/studio.mjs';
import { LocalAI, removeChroma, fluxWorkflow } from '../core/local-ai.mjs';

test('local vision sends photos only to loopback, uses no credentials and unloads model', async () => {
  const calls = [];
  const local = new LocalAI({fetch: async (url, options) => {
    calls.push([url, options]);
    return Response.json({message:{content:'White heart forehead, black ears.'}});
  }});
  expect(await local.analyze([Buffer.from('photo')], 'pink lips')).toContain('heart');
  expect(calls[0][0]).toBe('http://127.0.0.1:11434/api/chat');
  const body = JSON.parse(calls[0][1].body);
  expect(body.messages[1].images).toEqual([Buffer.from('photo').toString('base64')]);
  expect(body.keep_alive).toBe(0);
  expect(body.stream).toBe(false);
  expect(calls[0][1].redirect).toBe('error');
});

test('Comfy workflow keeps image reference conditioning and removes only magenta background', async () => {
  const workflow = fluxWorkflow('ref.png', 'pet prompt', 123);
  expect(Object.values(workflow).find(n=>n.class_type==='LoadImage').inputs.image).toBe('ref.png');
  expect(Object.values(workflow).some(n=>n.class_type==='ReferenceLatent')).toBe(true);
  const input = await sharp({create:{width:64,height:64,channels:3,background:'#ff00ff'}})
    .composite([{input:await sharp({create:{width:20,height:20,channels:3,background:'#ffffff'}}).png().toBuffer(),left:22,top:22}]).png().toBuffer();
  const output = await removeChroma(input);
  const raw = await sharp(output).raw().toBuffer();
  expect(raw[3]).toBe(0);
  expect(raw[(32*64+32)*4+3]).toBe(255);
});

test('local connection errors and missing vision results are actionable', async () => {
  const down = new LocalAI({fetch:async()=>{throw Error('down');}});
  expect((await down.status()).ready).toBe(false);
  await expect(down.analyze([Buffer.from('a')], '')).rejects.toThrow('Ollama');
  const empty = new LocalAI({fetch:async()=>Response.json({})});
  await expect(empty.analyze([Buffer.from('a')], '')).rejects.toThrow('분석');
});

test('local photo to motion uses no API key or paid renderer and persists animation', async () => {
  const dir=await mkdtemp(join(tmpdir(),'local-pet-'));
  try {
    const tile=await sharp({create:{width:30,height:36,channels:4,background:'#222'}}).png().toBuffer();
    const sheet=await sharp({create:{width:256,height:256,channels:4,background:'#00000000'}})
      .composite(Array.from({length:16},(_,i)=>({input:tile,left:(i%4)*64+17,top:Math.floor(i/4)*64+14}))).png().toBuffer();
    const cloud=vi.fn();
    const local={status:async()=>({ready:true}),analyze:vi.fn(async()=> 'white heart'),render:vi.fn(async()=>({buffer:sheet}))};
    const studio=await Studio.open({dir,render:cloud,getKey:()=>'',local});
    const [photo]=await studio.importPhotos([{name:'pet.png',bytes:sheet}]);
    const request={name:'터치',features:'pink lips',style:'pixel',photoIds:[photo.id]};
    await expect(studio.startLocal({...request,photoIds:['missing']})).rejects.toThrow();
    const job=await studio.startLocal(request);
    await expect(studio.startLocal(request)).rejects.toThrow();
    while(studio.active) await new Promise(r=>setTimeout(r,10));
    expect(studio.job(job.id).status).toBe('complete');
    expect(cloud).not.toHaveBeenCalled();
    expect(local.analyze).toHaveBeenCalledTimes(1);
    expect(local.render).toHaveBeenCalledTimes(2);
    expect(studio.data.attempts).toHaveLength(0);
    const state=await studio.state();
    expect(state.artworks[0].source).toBe('local');
    expect(await studio.petFrames(state.artworks[0].id)).toHaveLength(20);
    const reopened=await Studio.open({dir});
    expect((await reopened.state()).artworks[0].hasMotion).toBe(true);
  } finally {await rm(dir,{recursive:true,force:true});}
});
