import { test, expect } from "vitest";
import { PetModel } from "../core/pet.mjs";
const displays = [
  { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } },
];
test("lift sheets hang at the cursor with bounded sway then land; clicks and legacy keep their pose", () => {
  const p = new PetModel({ displays, x:500, y:500, liftEnabled:true });
  p.beginDrag({x:550,y:550});
  p.dragTo({x:552,y:551});
  expect(p.frame()).toBe(4);
  p.endDrag(); expect(p.state).toBe("idle");
  p.beginDrag({x:550,y:550});
  p.dragTo({x:600,y:560}); p.tick(33);
  expect(p.frame()).toBe(10);
  expect(p.x + 110).toBe(600);
  expect(p.y + 90).toBe(560);
  expect(Math.abs(p.view().rotation)).toBeGreaterThan(0);
  expect(Math.abs(p.view().rotation)).toBeLessThanOrEqual(8);
  p.endDrag(); expect(p.frame()).toBe(11);
  expect(p.view().rotation).toBe(0);
  for(let i=0;i<6;i++)p.tick(100);
  expect(p.state).toBe("idle");
  const old = new PetModel({ displays }); old.beginDrag({x:old.x,y:old.y});
  old.dragTo({x:600,y:560}); expect(old.frame()).toBe(4);
  old.endDrag(); expect(old.state).toBe("idle");
});
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
