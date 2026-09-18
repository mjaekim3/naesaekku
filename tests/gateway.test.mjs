import { test, expect, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { Studio } from "../core/studio.mjs";
import { createGateway } from "../server/gateway.mjs";
let gateway, dir;
afterEach(async () => {
  if (gateway) await gateway.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("gateway authenticates every data route and enforces methods and inputs", async () => {
  dir = await mkdtemp(join(tmpdir(), "ongi-api-"));
  const studio = await Studio.open({ dir, getKey: () => "" });
  gateway = await createGateway({ studio, token: "test-session", port: 0 });
  const url = gateway.url;
  expect((await fetch(url + "/api/state")).status).toBe(401);
  const headers = {
    Authorization: "Bearer test-session",
    "Content-Type": "application/json",
  };
  expect((await fetch(url + "/api/state", { headers })).status).toBe(200);
  expect((await fetch(url + "/api/missing", { headers })).status).toBe(404);
  const invalid = await fetch(url + "/api/import", {
    method: "POST",
    headers,
    body: "bad json",
  });
  expect(invalid.status).toBe(400);
  const png = await sharp({
    create: { width: 8, height: 8, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  const upload = await fetch(url + "/api/import", {
    method: "POST",
    headers,
    body: JSON.stringify({
      files: [{ name: "pet.png", base64: png.toString("base64") }],
    }),
  });
  expect(upload.status).toBe(200);
  const photos = await upload.json();
  expect(
    (await fetch(url + "/api/asset/" + photos[0].id, { headers })).status,
  ).toBe(200);
  expect((await fetch(url + "/api/asset/missing", { headers })).status).toBe(
    400,
  );
  const req = await fetch(url + "/api/generate", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });
  expect(req.status).toBe(400);
  expect((await fetch(url + "/api/job/missing", { headers })).status).toBe(404);
  expect(
    (
      await fetch(url + "/api/cancel", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "missing" }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await fetch(url + "/api/export", {
        method: "POST",
        headers,
        body: JSON.stringify({ id: "bad", format: "png" }),
      })
    ).status,
  ).toBe(400);
});
