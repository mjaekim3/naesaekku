import { test, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Studio } from "../core/studio.mjs";
test("library removal is persistent and reversible without deleting pet files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "library-trash-"));
  try {
    const s = await Studio.open({ dir });
    s.data.artworks = [{id:"pet-one",name:"너부리"},{id:"pet-two",name:"다른 아이"}];
    await s.setArtworkDeleted({id:"pet-one",deleted:true});
    expect((await s.state()).artworks.map(a=>a.id)).toEqual(["pet-two"]);
    const reopened = await Studio.open({dir});
    expect((await reopened.state()).trash.map(a=>a.id)).toEqual(["pet-one"]);
    await reopened.setArtworkDeleted({id:"pet-one",deleted:false});
    expect((await reopened.state()).artworks).toHaveLength(2);
    await expect(reopened.setArtworkDeleted({id:"../outside",deleted:true})).rejects.toThrow();
    await expect(reopened.setArtworkDeleted({id:"pet-one",deleted:"yes"})).rejects.toThrow();
  } finally { await rm(dir,{recursive:true,force:true}); }
});
