import { test, expect } from "vitest";
import { buildPrompt } from "../core/studio.mjs";
import { motionGroupPrompt } from "../core/motion-import.mjs";
import { motionPrompt } from "../core/pet-pack.mjs";
test("cat and generic pet prompts preserve species and natural mouth instead of prescribing a dog smile", () => {
  const r = {
    name: "너부리",
    features: "고양이, 원본 눈 모양 유지",
    style: "pixel",
    mode: "generate",
  };
  const prompts = [
    buildPrompt(r),
    motionGroupPrompt({ ...r, action: "master" }),
    motionGroupPrompt({ ...r, action: "idle" }),
    motionPrompt(r.name),
  ];
  for (const prompt of prompts) {
    expect(prompt).toContain("For cats");
    expect(prompt).toContain("closed mouth");
    expect(prompt).toContain("eye size");
    expect(prompt).not.toContain("small pink tongue");
    expect(prompt).not.toContain("gentle smile");
    expect(prompt).not.toContain("살짝 웃는 입");
  }
});
test("an explicit owner expression request is retained without changing other pets defaults", () => {
  const r = {
    name: "터치",
    features: "혀를 살짝 내밀고 웃는 표정",
    style: "pixel",
    mode: "generate",
  };
  expect(buildPrompt(r)).toContain(r.features);
  expect(motionGroupPrompt({ ...r, action: "master" })).toContain(r.features);
  expect(buildPrompt(r)).toContain("explicitly requests");
});
