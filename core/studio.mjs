import { reviewSheet } from "./sheet-review.mjs";
import {
  readFile,
  writeFile,
  mkdir,
  rename,
  rm,
  realpath,
  lstat,
} from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { normalize, thumbnail, pixelate, animate } from "./images.mjs";
import { createRenderer, publicError, IMAGE_MODEL } from "./provider.mjs";
import {
  savePetPack,
  savePreparedPetPack,
  loadPetPack,
  motionPrompt,
} from "./pet-pack.mjs";
import {
  splitMotion,
  assembleMotion,
  motionGroupPrompt,
} from "./motion-import.mjs";
import { LocalAI } from "./local-ai.mjs";
import { NATURAL_APPEARANCE } from "./appearance-prompt.mjs";

const text = (v, max, required = false) =>
  typeof v === "string" &&
  v.length <= max &&
  (!required || v.trim().length > 0);
export function buildPrompt(r) {
  const style =
    r.style === "pixel"
      ? "Refined pixel-art character with deliberate square pixels, readable shapes and a restrained palette; no blurry pixel filter."
      : "Warm hand-drawn storybook character, soft shapes and restrained warm colors.";
  const identity = `The reference photographs show the SAME beloved pet. Preserve its identity, exact fur markings, ear shape, proportions and distinctive features. Pet name: ${r.name}. Owner-identified traits: ${r.features}. ${NATURAL_APPEARANCE} Never invent text, accessories, halos or wings.`;
  if (r.mode === "blink")
    return `The FIRST image is the approved master character. Produce ONE alternate frame. Change ONLY both eyes to a natural gentle blink. Keep the canvas, position, silhouette, fur, mouth, palette and every other feature exactly aligned. Do not add a smile or tongue. Transparent background. No text.`;
  if (r.mode === "refine")
    return `The FIRST image is the approved character to edit; later photos are identity references. Preserve composition and identity. ${identity} Requested change: ${r.instruction}. Keep all unrelated details unchanged. Transparent background.`;
  return `${identity} ${style} Full body facing the viewer, a natural resting pose and relaxed expression appropriate to the animal species. Center the entire character on a transparent square background with 12% clear padding on all sides. No scenery, no shadow, no writing. This is a tender keepsake.`;
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
    local = new LocalAI(),
  }) {
    this.dir = dir;
    this.render = render;
    this.getKey = getKey;
    this.local = local;
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
  chatPrompt(r) {
    if (
      !r ||
      !text(r.name, 40, true) ||
      !text(r.features, 2000) ||
      !["pixel", "storybook", "cartoon", "realistic"].includes(r.style)
    )
      throw Error("이름과 특징을 입력해주세요.");
    return `첨부한 반려동물 사진은 외형 참고입니다. 배치 참고 이미지가 있으면 4×4 칸 위치와 동작 순서만 참고하고 그 안의 글자, 테두리, 점선은 완성본에 그리지 마세요. 이미지 한 장을 생성하고 멈추세요. 코드 실행이나 자동 재생성을 요청하는 작업이 아닙니다. 먼저 사진에서 털 무늬, 얼굴, 귀, 체형을 파악하고 그 특징을 유지하여 데스크톱 펫용 동작 시트를 직접 생성해주세요. 이름: ${r.name}. 꼭 유지할 특징: ${r.features || "사진의 고유한 무늬와 체형"}. 스타일: ${["pixel", "cartoon"].includes(r.style) ? "만화 캐릭터 스타일: 깔끔한 선과 부드러운 음영의 귀여운 2D 캐릭터. 사진 속 고유한 얼굴과 무늬를 유지하고 픽셀화하지 마세요" : "실제와 비슷하게: 실제 반려동물의 얼굴 비율과 체형을 충실히 살린 섬세한 털 질감과 자연스러운 음영. 과장된 눈이나 만화 윤곽선 없이 표현하세요"}. 사진을 그대로 배치하지 말고 한 캐릭터로 그려주세요.\n\n${motionPrompt(r.name, r.sheetFormat).replace("in the FIRST reference (approved master)", "in the attached pet photographs")}\n\n최종 결과는 사용 가능한 최대 기본 생성 해상도의 정사각형 투명 PNG 한 장 (가능하면 4096×4096, 지원하지 않으면 가능한 가장 큰 정사각형 해상도)으로 주세요. 단순 확대나 샤프닝으로 고해상도를 흉내 내지 마세요. 각 칸은 정확히 동일한 크기이며 투명 여백을 두세요. 특히 4행 3열 들기는 귀 끝부터 발과 꼬리 끝까지 모두 보여야 합니다. 체크무늬를 배경에 그리지 마세요. 프레임 순서를 꼭 지키고 다운로드할 수 있는 이미지로 만들어주세요.`;
  }
  async reviewPetSheet(r) {
    this.validateFile(r?.file);
    return reviewSheet(Buffer.from(r.file.bytes), {
      single: r.single ?? false,
      autoSplit: r.autoSplit ?? true,
      removeBackground: r.removeBackground ?? false,
    });
  }
  async importPetSheet(r) {
    if (!r || !text(r.name, 40, true))
      throw Error("아이의 이름을 먼저 입력해주세요.");
    const sheetFormat = r.sheetFormat ?? "legacy";
    if (!["legacy", "lift-v2"].includes(sheetFormat))
      throw Error("시트 형식을 확인해주세요.");
    this.validateFile(r.file);
    if (!/\.png$/i.test(r.file.name))
      throw Error("투명 배경의 PNG 동작 시트를 선택해주세요.");
    if (this.active) throw Error("진행 중인 생성이 끝난 뒤 가져와주세요.");
    const id = randomUUID();
    try {
      await savePetPack(
        this.dir,
        id,
        r.name,
        Buffer.from(r.file.bytes),
        sheetFormat,
      );
    } catch (e) {
      if (e.message === "SPRITE_LAYOUT")
        throw Error(
          "4×4 정사각형 동작 시트가 필요해요. 투명 배경, 빈 칸, 캐릭터가 칸 경계에 닿는지 확인해주세요.",
        );
      throw e;
    }
    const idle = await readFile(join(this.dir, "pets", id, "4.png"));
    await writeFile(join(this.dir, "assets", id + ".png"), idle);
    const item = {
      id,
      name: r.name + " · 가져온 동작",
      petName: r.name,
      sheetFormat,
      source: "imported",
      mode: "pet",
      hasMotion: true,
      createdAt: new Date().toISOString(),
      thumbnail:
        "data:image/png;base64," + (await thumbnail(idle)).toString("base64"),
    };
    this.data.artworks.unshift(item);
    await this.save();
    return item;
  }
  motionPrompt(r) {
    return motionGroupPrompt(r);
  }
  async prepareMotion(r) {
    this.validateFile(r?.file);
    const frames = await splitMotion(
      Buffer.from(r.file.bytes),
      r.action,
      r.background,
    );
    return frames.map((f) => "data:image/png;base64," + f.toString("base64"));
  }
  async saveMotion(r) {
    if (!r || !text(r.name, 40, true) || r.reviewed !== true)
      throw Error("이름을 입력하고 걷기 방향·프레임 순서를 확인해주세요.");
    if (this.active) throw Error("진행 중인 생성을 먼저 마쳐주세요.");
    this.active = "assembling";
    try {
      const pack = await assembleMotion(r.groups);
      const id = randomUUID();
      await savePreparedPetPack(this.dir, id, r.name, pack, pack.sheet);
      await writeFile(join(this.dir, "assets", id + ".png"), pack.frames[4]);
      const item = {
        id,
        name: r.name + " · 확인한 동작",
        petName: r.name,
        source: "imported",
        mode: "pet",
        hasMotion: true,
        createdAt: new Date().toISOString(),
        thumbnail:
          "data:image/png;base64," +
          (await thumbnail(pack.frames[4])).toString("base64"),
      };
      this.data.artworks.unshift(item);
      await this.save();
      return item;
    } finally {
      this.active = null;
    }
  }
  async permanentlyDeleteArtwork(r, beforeDelete = async () => {}) {
    if (
      !r ||
      r.confirmed !== true ||
      typeof r.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(r.id)
    )
      throw Error("영구삭제할 항목과 확인 여부를 확인해주세요.");
    if (this.active || this.deleting)
      throw Error("진행 중인 작업이 끝난 뒤 다시 시도해주세요.");
    const item = this.data.artworks.find((a) => a.id === r.id && a.deletedAt);
    if (!item) throw Error("휴지통에 있는 항목만 영구삭제할 수 있어요.");
    this.deleting = true;
    try {
      // Resolve and inspect each target before recursively removing any directory.
      const root = await realpath(this.dir);
      const targets = [];
      for (const [folder, filename] of [
        ["assets", r.id + ".png"],
        ["pets", r.id],
      ]) {
        const parent = resolve(root, folder),
          target = resolve(parent, filename);
        if (dirname(target) !== parent) throw Error("잘못된 저장 경로입니다.");
        try {
          if ((await realpath(parent)) !== parent)
            throw Error("연결된 저장 폴더는 삭제할 수 없어요.");
          const stat = await lstat(target);
          if (stat.isSymbolicLink() || (await realpath(target)) !== target)
            throw Error("연결된 파일은 삭제할 수 없어요.");
          targets.push(target);
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
      }
      await beforeDelete(r.id);
      // Keep the trash record if disk cleanup fails, allowing the same deletion to be retried.
      for (const target of targets)
        await rm(target, { recursive: true, force: true });
      const previous = this.data.artworks;
      this.data.artworks = previous.filter((a) => a.id !== r.id);
      try {
        await this.save();
      } catch (e) {
        this.data.artworks = previous;
        throw e;
      }
      return { id: r.id, deleted: true };
    } finally {
      this.deleting = false;
    }
  }
  async setArtworkDeleted(r) {
    if (!r || typeof r.deleted !== "boolean" || typeof r.id !== "string")
      throw Error("항목을 확인해주세요.");
    if (this.active || this.deleting)
      throw Error("진행 중인 작업이 끝난 뒤 다시 시도해주세요.");
    const item = this.data.artworks.find((a) => a.id === r.id);
    if (!item) throw Error("보관함 항목을 찾지 못했어요.");
    const previous = item.deletedAt;
    if (r.deleted) item.deletedAt = new Date().toISOString();
    else delete item.deletedAt;
    try {
      await this.save();
    } catch (e) {
      if (previous) item.deletedAt = previous;
      else delete item.deletedAt;
      throw e;
    }
    return { id: item.id, deleted: r.deleted };
  }
  async state() {
    return {
      photos: this.data.photos,
      artworks: this.data.artworks.filter((a) => !a.deletedAt),
      trash: this.data.artworks.filter((a) => a.deletedAt),
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
      !["generate", "refine", "blink", "pet", "motion"].includes(r.mode)
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
    if (["generate", "pet"].includes(r.mode) && !r.photoIds.length)
      throw new Error("참고 사진을 먼저 선택해주세요.");
    if (
      !["generate", "pet"].includes(r.mode) &&
      !this.data.artworks.some((a) => a.id === r.baseId)
    )
      throw new Error("기준 그림을 먼저 선택해주세요.");
    if (r.mode === "refine" && !text(r.instruction, 1000, true))
      throw new Error("수정할 내용을 적어주세요.");
  }
  localStatus() {
    return this.local.status();
  }
  async startLocal(r) {
    // Reuse photo/name validation, with no network-consent or API credential requirement.
    this.validate({ ...r, mode: "pet", quality: "medium", consent: true });
    if (this.active) throw Error("이미 진행 중인 생성이 있어요.");
    const id = randomUUID();
    const job = {
      id,
      status: "running",
      mode: "local",
      startedAt: Date.now(),
      controller: new AbortController(),
      stage: "로컬 AI 연결 확인 중",
    };
    this.active = id;
    this.jobs.set(id, job);
    void this.runLocal(job, { ...r, mode: "pet" });
    return this.job(id);
  }
  async runLocal(j, r) {
    try {
      const status = await this.local.status();
      if (!status.ready) throw Error(status.message);
      const signal = j.controller.signal;
      signal.throwIfAborted();
      j.stage = "이 PC에서 사진 특징 분석 중 · Ollama";
      const images = await Promise.all(r.photoIds.map((id) => this.bytes(id)));
      const analysis = await this.local.analyze(images, r.features, signal);
      signal.throwIfAborted();
      await this.runPet(
        j,
        { ...r, features: r.features + "\nPhoto analysis: " + analysis },
        null,
        (options) => this.local.render(options),
        "local",
      );
    } catch (e) {
      j.status = j.controller.signal.aborted ? "canceled" : "error";
      j.error =
        e.message === "SPRITE_LAYOUT"
          ? "로컬 AI가 동작 칸을 정확하게 그리지 못했어요. 기본 모습은 보관함에 남겼어요. 사진이나 설명을 바꿔 다시 시도해주세요."
          : e.message;
    } finally {
      await this.local.release?.().catch(() => {});
      if (this.active === j.id) this.active = null;
      j.finishedAt = Date.now();
    }
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
      const requests = r.mode === "pet" ? 2 : 1;
      if (this.data.attempts.length + requests > 20)
        throw new Error("오늘의 생성 한도 20회에 도달했습니다.");
      this.data.attempts.push(new Date().toISOString());
      if (requests === 2) this.data.attempts.push(new Date().toISOString());
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
      if (["pet", "motion"].includes(r.mode)) {
        await this.runPet(j, r, apiKey);
        return;
      }
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
  async runPet(j, r, apiKey, render = this.render, source = "generated") {
    const signal = j.controller.signal;
    const photos = await Promise.all(r.photoIds.map((id) => this.bytes(id)));
    let master;
    if (r.mode === "pet") {
      j.stage = "캐릭터 모습 생성 중 · 1/3";
      const result = await render({
        images: photos,
        prompt: buildPrompt({ ...r, mode: "generate" }),
        quality: r.quality,
        apiKey,
        signal,
      });
      if (signal.aborted) return;
      master = await this.put(
        await normalize(result.buffer),
        {
          name: r.name + " · 기본 모습",
          petName: r.name,
          source,
          mode: "generate",
          style: r.style,
          usage: result.usage || null,
        },
        "artworks",
      );
      await this.save();
      j.masterId = master.id;
    } else master = this.find(r.baseId);
    j.stage = "걷기·대기·수면·간식 동작 생성 중 · 2/3";
    if (signal.aborted) return;
    const result = await render({
      images: [await this.bytes(master.id), ...photos],
      prompt: motionPrompt(r.name),
      motion: true,
      onProgress: (n) => {
        j.stage = `로컬 동작 생성 중 · ${n}/16 프레임`;
      },
      quality: r.quality,
      apiKey,
      signal,
    });
    if (signal.aborted) return;
    j.stage = "프레임 정렬 및 투명 영역 검사 중 · 3/3";
    const id = randomUUID();
    await savePetPack(this.dir, id, r.name, result.buffer);
    if (signal.aborted) return;
    const buffer = await this.bytes(master.id);
    await writeFile(join(this.dir, "assets", id + ".png"), buffer);
    const item = {
      id,
      name: r.name + " · 움직이는 내새꾸",
      petName: r.name,
      source,
      mode: "pet",
      hasMotion: true,
      parentId: master.id,
      style: r.style,
      createdAt: new Date().toISOString(),
      thumbnail: master.thumbnail,
    };
    this.data.artworks.unshift(item);
    await this.save();
    j.artworkId = id;
    j.status = "complete";
  }
  async petFrames(id) {
    if (!this.find(id).hasMotion) throw Error("먼저 움직임을 만들어주세요.");
    const pack = await loadPetPack(this.dir, id);
    return Promise.all(
      Array.from(
        { length: 20 },
        async (_, i) =>
          "data:image/png;base64," +
          (await readFile(join(pack.root, i + ".png"))).toString("base64"),
      ),
    );
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
