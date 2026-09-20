import { test, expect, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { Studio } from "../core/studio.mjs";
test("ChatGPT workflow creates a personalized prompt and imports animation without API credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "manual-pet-"));
  try {
    const render = vi.fn();
    const studio = await Studio.open({ dir, getKey: () => "", render });
    const prompt = studio.chatPrompt({
      name: "터치",
      features: "흰 하트",
      style: "pixel",
    });
    expect(prompt).toContain("터치");
    expect(prompt).toContain("흰 하트");
    expect(prompt).toContain("4 columns");
    const tile = await sharp({
      create: { width: 32, height: 40, channels: 4, background: "#222" },
    })
      .png()
      .toBuffer();
    const bytes = await sharp({
      create: { width: 256, height: 256, channels: 4, background: "#00000000" },
    })
      .composite(
        Array.from({ length: 16 }, (_, i) => ({
          input: tile,
          left: (i % 4) * 64 + 16,
          top: Math.floor(i / 4) * 64 + 12,
        })),
      )
      .png()
      .toBuffer();
    const pet = await studio.importPetSheet({
      name: "터치",
      file: { name: "sheet.png", bytes },
    });
    expect(pet.hasMotion).toBe(true);
    expect(pet.source).toBe("imported");
    expect(pet.sheetFormat).toBe("legacy");
    const lifted = await studio.importPetSheet({
      name: "너부리",
      sheetFormat: "lift-v2",
      file: { name: "sheet.png", bytes },
    });
    expect(lifted.sheetFormat).toBe("lift-v2");
    expect(
      JSON.parse(
        await readFile(join(dir, "pets", lifted.id, "manifest.json"), "utf8"),
      ).sheetFormat,
    ).toBe("lift-v2");
    expect(
      studio.chatPrompt({
        name: "너부리",
        features: "",
        style: "pixel",
        sheetFormat: "lift-v2",
      }),
    ).toContain("Cell 14: lifted");
    await expect(
      studio.importPetSheet({
        name: "너부리",
        sheetFormat: "unknown",
        file: { name: "sheet.png", bytes },
      }),
    ).rejects.toThrow();
    expect(await studio.petFrames(pet.id)).toHaveLength(20);
    expect(render).not.toHaveBeenCalled();
    expect((await studio.state()).hasKey).toBe(false);
    await expect(
      studio.importPetSheet({ name: "", file: { name: "sheet.png", bytes } }),
    ).rejects.toThrow();
    await expect(
      studio.importPetSheet({
        name: "터치",
        file: { name: "photo.jpg", bytes },
      }),
    ).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
