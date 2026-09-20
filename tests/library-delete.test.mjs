import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Studio } from "../core/studio.mjs";
test("library removal is persistent and reversible without deleting pet files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "library-trash-"));
  try {
    const s = await Studio.open({ dir });
    s.data.artworks = [
      { id: "pet-one", name: "너부리" },
      { id: "pet-two", name: "다른 아이" },
    ];
    await s.setArtworkDeleted({ id: "pet-one", deleted: true });
    expect((await s.state()).artworks.map((a) => a.id)).toEqual(["pet-two"]);
    const reopened = await Studio.open({ dir });
    expect((await reopened.state()).trash.map((a) => a.id)).toEqual([
      "pet-one",
    ]);
    await reopened.setArtworkDeleted({ id: "pet-one", deleted: false });
    expect((await reopened.state()).artworks).toHaveLength(2);
    await expect(
      reopened.setArtworkDeleted({ id: "../outside", deleted: true }),
    ).rejects.toThrow();
    await expect(
      reopened.setArtworkDeleted({ id: "pet-one", deleted: "yes" }),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
import { writeFile, mkdir, access } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
test('permanent deletion requires trash and confirmation, removes only its files and persists', async()=>{
 const dir=await mkdtemp(join(tmpdir(),'permanent-'));const id=randomUUID(),other=randomUUID();
 try{
 const s=await Studio.open({dir});s.data.artworks=[{id,name:'삭제할 아이'},{id:other,name:'남길 아이'}];
 await mkdir(join(dir,'pets',id),{recursive:true});await writeFile(join(dir,'pets',id,'0.png'),'frame');
 await writeFile(join(dir,'assets',id+'.png'),'image');await writeFile(join(dir,'assets',other+'.png'),'keep');
 const beforeDelete=vi.fn();
 await expect(s.permanentlyDeleteArtwork({id,confirmed:true},beforeDelete)).rejects.toThrow();
 await s.setArtworkDeleted({id,deleted:true});
 await expect(s.permanentlyDeleteArtwork({id,confirmed:false},beforeDelete)).rejects.toThrow();
 await expect(s.permanentlyDeleteArtwork({id:'../outside',confirmed:true},beforeDelete)).rejects.toThrow();
 expect(beforeDelete).not.toHaveBeenCalled();
 await s.permanentlyDeleteArtwork({id,confirmed:true},beforeDelete);
 expect(beforeDelete).toHaveBeenCalledWith(id);
 await expect(access(join(dir,'assets',id+'.png'))).rejects.toThrow();
 await expect(access(join(dir,'pets',id))).rejects.toThrow();
 await access(join(dir,'assets',other+'.png'));
 expect((await (await Studio.open({dir})).state()).trash).toHaveLength(0);
 expect(s.data.artworks.map(a=>a.id)).toEqual([other]);
 }finally{await rm(dir,{recursive:true,force:true});}
});
