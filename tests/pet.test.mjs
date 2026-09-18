import { test, expect } from "vitest";
import {
  PetModel,
  clampPosition,
  chooseDisplay,
  hitAlpha,
} from "../core/pet.mjs";
const displays = [
  { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } },
  { id: 2, workArea: { x: -1280, y: -200, width: 1280, height: 984 } },
];
test("drag across negative-coordinate monitor retains chosen height and stays there", () => {
  const pet = new PetModel({ displays, x: 1500, y: 500, random: () => 0.5 });
  pet.beginDrag({ x: 1550, y: 550 });
  pet.dragTo({ x: -600, y: 250 });
  pet.endDrag();
  expect(pet.displayId).toBe(2);
  expect(pet.x).toBe(-650);
  expect(pet.y).toBe(200);
  pet.act("walk");
  pet.tick(1000);
  expect(pet.x).toBeGreaterThan(-650);
  expect(pet.y).toBe(200);
});
test("work area clamp and monitor removal recover lost pets", () => {
  expect(
    clampPosition({ x: 9999, y: 9999 }, displays[1].workArea, 220, 230),
  ).toEqual({ x: -220, y: 554 });
  const p = new PetModel({ displays, x: -700, y: 50 });
  p.updateDisplays([displays[0]]);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.displayId).toBe(1);
  expect(chooseDisplay({ x: 9000, y: 20 }, displays).id).toBe(1);
});
test("walking reverses at edge; large elapsed time cannot teleport after sleep", () => {
  const p = new PetModel({ displays: [displays[0]], x: 1699, y: 700 });
  p.act("walk");
  p.tick(1000);
  expect(p.x).toBeLessThanOrEqual(1700);
  expect(p.direction).toBe(-1);
  const x = p.x;
  p.tick(3600000);
  expect(Math.abs(p.x - x)).toBeLessThanOrEqual(6);
});
test("sleep, feeding and petting complete without hunger penalties; drag has priority", () => {
  const p = new PetModel({ displays, random: () => 0.5 });
  p.act("sleep");
  p.tick(1000);
  expect(p.state).toBe("sleep");
  p.act("eat");
  expect(p.state).toBe("eat");
  for (let i = 0; i < 80; i++) p.tick(100);
  expect(p.state).toBe("idle");
  p.act("pet");
  expect(p.state).toBe("happy");
  p.beginDrag({ x: p.x + 10, y: p.y + 10 });
  p.act("eat");
  expect(p.state).toBe("drag");
  p.endDrag();
  expect(p.state).toBe("idle");
  p.act("pause");
  for (let i = 0; i < 200; i++) p.tick(100);
  expect(p.state).toBe("idle");
  expect(p.roaming).toBe(false);
  p.act("walk");
  expect(p.roaming).toBe(true);
});
test("alpha hit testing passes empty pixels through, including mirrored frames", () => {
  const a = Uint8Array.from([0, 255, 0, 0]);
  expect(hitAlpha(a, 2, 2, 1, 0, false)).toBe(true);
  expect(hitAlpha(a, 2, 2, 0, 0, false)).toBe(false);
  expect(hitAlpha(a, 2, 2, 0, 0, true)).toBe(true);
  expect(hitAlpha(a, 2, 2, -1, 0, false)).toBe(false);
  expect(hitAlpha(a, 2, 2, 2, 0, false)).toBe(false);
});
test("invalid saved positions fall back and snapshots only contain restorable data", () => {
  const p = new PetModel({ displays, x: NaN, y: Infinity });
  expect(Number.isFinite(p.x + p.y)).toBe(true);
  expect(p.snapshot()).toMatchObject({ displayId: 1, roaming: true });
  expect(p.snapshot()).not.toHaveProperty("random");
  p.act("wake");
  expect(p.state).toBe("idle");
});
test("each state selects the intended animation; idle blinks and wandering resumes", () => {
  const p = new PetModel({ displays, random: () => 0.5 });
  expect(p.view()).toMatchObject({ frame: 4, state: "idle", mirrored: false });
  for (let i = 0; i < 41; i++) p.tick(100);
  expect(p.frame()).toBe(5);
  for (let i = 0; i < 10; i++) p.tick(100);
  expect(p.state).toBe("walk");
  expect(p.frame()).toBeLessThan(4);
  p.direction = -1;
  expect(p.view().mirrored).toBe(true);
  for (const [action, low, high] of [
    ["sleep", 6, 7],
    ["eat", 8, 9],
    ["pet", 10, 11],
  ]) {
    p.act(action);
    expect(p.frame()).toBe(low);
    for (let i = 0; i < 13; i++) p.tick(100);
    expect(p.frame()).toBeGreaterThanOrEqual(low);
    expect(p.frame()).toBeLessThanOrEqual(high);
  }
  p.endDrag();
  p.dragTo({ x: 1, y: 1 });
  expect(p.state).toBe("happy");
});
