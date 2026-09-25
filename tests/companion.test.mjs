import { test, expect } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Studio } from "../core/studio.mjs";
import { loadPetPack } from "../core/pet-pack.mjs";
import { PetModel } from "../core/pet.mjs";
import { cellNames } from "../src/SheetReview.jsx";

test("greeting pack survives import/reopen and uses the intended two cells", async () => {
  const dir = await mkdtemp(join(tmpdir(), "companion-"));
  try {
    const studio = await Studio.open({ dir, getKey: () => "" });
    const item = await studio.importPetSheet({ name: "친구의 강아지", sheetFormat: "companion-v1",
      file: { name: "sheet.png", bytes: await readFile(new URL("../assets/nerburi-lift-sheet.png", import.meta.url)) } });
    const reopened = await Studio.open({ dir, getKey: () => "" });
    expect((await reopened.state()).artworks.find(a => a.id === item.id).sheetFormat).toBe("companion-v1");
    const pack = await loadPetPack(dir, item.id);
    const model = new PetModel({ displays: [{id:1, workArea:{x:0,y:0,width:1280,height:800}}], greetingEnabled: pack.manifest.sheetFormat === "companion-v1" });
    model.act("pet");
    expect(model.frame()).toBe(8);
    for (let i=0;i<3;i++) model.tick(100);
    expect(model.frame()).toBe(9);
    model.act("eat");
    expect(model.state).toBe("happy");
    for (let i=0;i<20;i++) model.tick(100);
    expect(model.state).toBe("idle");
    model.greetingEnabled = false;
    model.act("pet");
    expect(model.frame()).toBe(5);
    model.act("eat");
    expect(model.frame()).toBe(8);
  } finally { await rm(dir, { recursive:true, force:true }); }
});

test("fixed-style greeting prompt and review labels agree without changing legacy eating sheets", () => {
  const studio = new Studio({dir:"."});
  for (const style of ["cartoon", "realistic", "pixel", "storybook"]) {
    const prompt = studio.chatPrompt({name:"초코", features:"강아지, 짧은 꼬리와 접힌 귀", style, sheetFormat:"companion-v1"});
    expect(prompt).toContain("Name: 초코.");
    expect(prompt).toContain("짧은 꼬리와 접힌 귀");
    // Cell numbers follow the 1-16 labels of the downloadable layout reference.
    expect(prompt).toContain("13: sitting in three-quarter view");
    expect(prompt).toContain("tail length");
    expect(prompt).not.toContain("eating from small bowl");
    expect(prompt).toContain("15: gently lifted UPRIGHT");
    expect(prompt).toContain("not a standing or seated pet");
    expect(prompt).toContain("dashed box");
    // The lifted pose keeps the idle body size instead of being drawn smaller.
    expect(prompt).toContain("Same size as cell 9");
    expect(prompt).not.toMatch(/may be smaller/);
    expect(prompt.length).toBeLessThan(4000);
  }
  expect(cellNames("companion-v1").slice(12,14)).toEqual(["반겨주기 1", "반겨주기 2"]);
  expect(cellNames("lift-v2").slice(12,14)).toEqual(["먹기 1", "먹기 2"]);
  expect(studio.chatPrompt({name:"초코", features:"", style:"cartoon", sheetFormat:"lift-v2"})).toContain("eating from small bowl");
});
