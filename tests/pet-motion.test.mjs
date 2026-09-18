import { test, expect } from "vitest";
import { PetModel } from "../core/pet.mjs";
const displays = [
  { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
];
test("petting keeps the aligned seated closed-eye pose for the whole gesture", () => {
  const p = new PetModel({ displays });
  p.act("pet");
  const frames = new Set();
  for (let i = 0; i < 20; i++) {
    frames.add(p.frame());
    p.tick(100);
  }
  expect([...frames]).toEqual([5]);
});
test("a slightly shaky click does not reposition the pet or change pose on pointer-down", () => {
  const p = new PetModel({ displays, x: 500, y: 500 });
  p.act("walk");
  p.direction = -1;
  const pose = p.view();
  p.beginDrag({ x: 550, y: 550 });
  p.dragTo({ x: 553, y: 548 });
  expect(p.x).toBe(500);
  expect(p.y).toBe(500);
  expect(p.view()).toMatchObject({
    frame: pose.frame,
    mirrored: pose.mirrored,
  });
  p.endDrag();
  expect(p.x).toBe(500);
  expect(p.y).toBe(500);
});
test("walking traverses eight ordered keyframes per loop", () => {
  const p = new PetModel({ displays });
  p.act("walk");
  const frames = [];
  for (let i = 0; i < 8; i++) {
    frames.push(p.frame());
    p.tick(100);
  }
  expect(frames).toEqual([12, 13, 14, 15, 16, 17, 18, 19]);
  expect(p.frame()).toBe(12);
});
