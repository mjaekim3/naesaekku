import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { normalize, thumbnail, pixelate, animate } from "./images.mjs";
import { createRenderer, publicError, IMAGE_MODEL } from "./provider.mjs";

const text = (v, max, required = false) =>
  typeof v === "string" &&
  v.length <= max &&
  (!required || v.trim().length > 0);
export function buildPrompt(r) {
  const style =
    r.style === "pixel"
      ? "Refined pixel-art character with deliberate square pixels, readable shapes and a restrained palette; no blurry pixel filter."
      : "Warm hand-drawn storybook character, soft shapes and restrained warm colors.";
  const identity = `The reference photographs show the SAME beloved pet. Preserve its identity, exact fur markings, ear shape, proportions and distinctive features. Pet name: ${r.name}. Owner-identified traits: ${r.features}. Never invent text, accessories, halos or wings.`;
  if (r.mode === "blink")
    return `The FIRST image is the approved master character. Produce ONE alternate frame. Change ONLY both eyes to a gentle happy blink. Keep the canvas, position, silhouette, fur, mouth, palette and every other feature exactly aligned. Transparent background. No text.`;
  if (r.mode === "refine")
    return `The FIRST image is the approved character to edit; later photos are identity references. Preserve composition and identity. ${identity} Requested change: ${r.instruction}. Keep all unrelated details unchanged. Transparent background.`;
  return `${identity} ${style} Full body, seated facing the viewer, a gentle cheerful smile and a small pink tongue tip. Center the entire character on a transparent square background with 12% clear padding on all sides. No scenery, no shadow, no writing. This is a tender keepsake.`;
}
export class Studio {
  static async open(options) {
    const s = new Studio(options);
    await mkdir(join(s.dir, "assets"), { recursive: true });
    try {
      s.data = JSON.parse(await readFile(join(s.dir, "library.json"), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new Error(
          "보관함 파일을 읽지 못했습니다. 원본을 보존한 채 지원을 요청해주세요.",
        );
    }
    return s;
  }
  constructor({
    dir,
    render = createRenderer(),
    getKey = () => process.env.OPENAI_API_KEY || "",
  }) {
    this.dir = dir;
    this.render = render;
    this.getKey = getKey;
    this.data = { photos: [], artworks: [], attempts: [] };
    this.jobs = new Map();
    this.saving = Promise.resolve();
    this.active = null;
  }
  async save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.saving = this.saving.then(async () => {
      await writeFile(join(this.dir, "library.tmp"), snapshot, { mode: 0o600 });
      await rename(
        join(this.dir, "library.tmp"),
        join(this.dir, "library.json"),
      );
    });
    return this.saving;
  }
  find(id) {
    const item = [...this.data.photos, ...this.data.artworks].find(
      (x) => x.id === id,
    );
    if (!item) throw new Error("저장된 이미지를 찾지 못했습니다.");
    return item;
  }
  async bytes(id) {
    this.find(id);
    return readFile(join(this.dir, "assets", `${id}.png`));
  }
  async asset(id) {
    return { mime: "image/png", buffer: await this.bytes(id) };
  }
  async put(buffer, info, kind) {
    const id = randomUUID();
    await writeFile(join(this.dir, "assets", `${id}.png`), buffer);
    const thumb = await thumbnail(buffer);
    const item = {
      id,
      ...info,
      createdAt: new Date().toISOString(),
      thumbnail: `data:image/png;base64,${thumb.toString("base64")}`,
    };
    this.data[kind].unshift(item);
    return item;
  }
  validateFile(f) {
    if (
      !f ||
      !text(f.name, 250, true) ||
      !/^.+\.(png|jpe?g|webp)$/i.test(f.name) ||
      !f.bytes ||
      f.bytes.length > 20 * 1024 * 1024 ||
      f.bytes.length < 1
    )
      throw new Error(
        "사진은 JPG·PNG·WebP 형식으로, 한 장당 20MB 이하로 선택해주세요.",
      );
  }
  async importPhotos(files) {
    if (!Array.isArray(files) || !files.length || files.length > 5)
      throw new Error("한 번에 사진 1~5장을 선택해주세요.");
    const normalized = [];
    for (const f of files) {
      this.validateFile(f);
      normalized.push([await normalize(Buffer.from(f.bytes)), f.name]);
    }
    const out = [];
    for (const [b, name] of normalized)
      out.push(await this.put(b, { name }, "photos"));
    await this.save();
    return out;
  }
  async importArtwork(f) {
    this.validateFile(f);
    const item = await this.put(
      await normalize(Buffer.from(f.bytes)),
      {
        name: f.name,
        source: "imported",
        mode: "import",
        parentId: null,
        usage: null,
      },
      "artworks",
    );
    await this.save();
    return item;
  }
  async state() {
    return {
      photos: this.data.photos,
      artworks: this.data.artworks,
      jobs: [...this.jobs.values()].map(({ controller, ...j }) => j),
      hasKey: !!(await this.getKey()),
      model: IMAGE_MODEL,
    };
  }
  validate(r) {
    if (
      !r ||
      !text(r.name, 40, true) ||
      !text(r.features, 2000) ||
      !["pixel", "storybook"].includes(r.style) ||
      !["low", "medium", "high"].includes(r.quality) ||
      !["generate", "refine", "blink"].includes(r.mode)
    )
      throw new Error("이름, 특징과 생성 옵션을 확인해주세요.");
    if (r.consent !== true)
      throw new Error("선택한 사진을 OpenAI로 전송하는 데 동의해주세요.");
    if (
      !Array.isArray(r.photoIds) ||
      r.photoIds.length > 5 ||
      new Set(r.photoIds).size !== r.photoIds.length
    )
      throw new Error("사진은 최대 5장까지 선택할 수 있어요.");
    for (const id of r.photoIds)
      if (!this.data.photos.some((p) => p.id === id))
        throw new Error("선택한 사진을 찾을 수 없습니다.");
    if (r.mode === "generate" && !r.photoIds.length)
      throw new Error("참고 사진을 먼저 선택해주세요.");
    if (
      r.mode !== "generate" &&
      !this.data.artworks.some((a) => a.id === r.baseId)
    )
      throw new Error("기준 그림을 먼저 선택해주세요.");
    if (r.mode === "refine" && !text(r.instruction, 1000, true))
      throw new Error("수정할 내용을 적어주세요.");
  }
  async start(r) {
    this.validate(r);
    if (this.active)
      throw new Error(
        "이미 진행 중인 생성이 있어요. 완료 후 다시 시도해주세요.",
      );
    this.active = "starting";
    try {
      const apiKey = await this.getKey();
      if (!apiKey) throw new Error("설정에서 OpenAI API 키를 연결해주세요.");
      const today = new Date().toISOString().slice(0, 10);
      this.data.attempts = this.data.attempts.filter((t) =>
        t.startsWith(today),
      );
      if (this.data.attempts.length >= 20)
        throw new Error("오늘의 생성 한도 20회에 도달했습니다.");
      this.data.attempts.push(new Date().toISOString());
      await this.save();
      const id = randomUUID();
      const job = {
        id,
        status: "running",
        mode: r.mode,
        startedAt: Date.now(),
        controller: new AbortController(),
      };
      this.jobs.set(id, job);
      this.active = id;
      void this.run(job, r, apiKey);
      return this.job(id);
    } catch (e) {
      this.active = null;
      throw e;
    }
  }
  job(id) {
    const j = this.jobs.get(id);
    if (!j) return null;
    const { controller, ...publicJob } = j;
    return publicJob;
  }
  cancel(id) {
    const j = this.jobs.get(id);
    if (j?.status === "running") {
      j.controller.abort();
      j.status = "canceled";
    }
  }
  async run(j, r, apiKey) {
    try {
      const ids =
        r.mode === "generate" ? r.photoIds : [r.baseId, ...r.photoIds];
      const images = await Promise.all(ids.map((id) => this.bytes(id)));
      if (j.controller.signal.aborted) return;
      const result = await this.render({
        images,
        prompt: buildPrompt(r),
        quality: r.quality,
        apiKey,
        signal: j.controller.signal,
      });
      if (j.controller.signal.aborted) return;
      const buffer = await normalize(result.buffer);
      if (j.controller.signal.aborted) return;
      const artwork = await this.put(
        buffer,
        {
          name: `${r.name} · ${r.mode === "blink" ? "눈 깜빡임" : r.mode === "refine" ? "수정한 모습" : "새로운 모습"}`,
          petName: r.name,
          features: r.features,
          style: r.style,
          quality: r.quality,
          source: "generated",
          mode: r.mode,
          parentId: r.baseId || null,
          usage: result.usage || null,
          model: IMAGE_MODEL,
        },
        "artworks",
      );
      await this.save();
      j.artworkId = artwork.id;
      j.status = "complete";
    } catch (e) {
      j.status = j.controller.signal.aborted ? "canceled" : "error";
      j.error = publicError(e);
    } finally {
      if (this.active === j.id) this.active = null;
      j.finishedAt = Date.now();
    }
  }
  async export(id, format, blinkId) {
    const base = await this.bytes(id);
    if (format === "png")
      return { buffer: base, mime: "image/png", ext: "png" };
    if (format === "pixel")
      return {
        buffer: await pixelate(base, 128),
        mime: "image/png",
        ext: "png",
      };
    if (format === "gif") {
      const frame = this.find(blinkId);
      if (frame.parentId !== id || frame.mode !== "blink")
        throw new Error("이 그림에서 만든 눈 깜빡임 프레임을 선택해주세요.");
      return {
        buffer: await animate(base, await this.bytes(blinkId)),
        mime: "image/gif",
        ext: "gif",
      };
    }
    throw new Error("지원하지 않는 내보내기 형식입니다.");
  }
}
