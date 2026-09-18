export function createActions({ studio, setKey, saveFile, activatePet, copyText, openChatGPT }) {
  return {
    state: () => studio.state(),
    chatPrompt: r => studio.chatPrompt(r),
    copyChatPrompt: async r => {const text=studio.chatPrompt(r);if(!copyText)throw Error('프롬프트를 직접 복사해주세요.');await copyText(text);return {copied:true};},
    openChatGPT: async () => {if(!openChatGPT)throw Error('브라우저에서 chatgpt.com을 열어주세요.');await openChatGPT();return {opened:true};},
    importPetSheet: r => studio.importPetSheet(r),
    petFrames: (id) => studio.petFrames(id),
    activatePet: async (id) => {
      if (!studio.find(id).hasMotion)
        throw Error("먼저 움직임을 만들어주세요.");
      if (!activatePet) throw Error("데스크톱 앱에서 사용할 수 있어요.");
      await activatePet(id);
      return { activated: true };
    },
    importPhotos: (files) => studio.importPhotos(files),
    importArtwork: (file) => studio.importArtwork(file),
    asset: async (id) => {
      const a = await studio.asset(id);
      return `data:${a.mime};base64,${a.buffer.toString("base64")}`;
    },
    pixelPreview: async (id) => {
      const a = await studio.export(id, "pixel");
      return `data:${a.mime};base64,${a.buffer.toString("base64")}`;
    },
    start: (r) => studio.start(r),
    job: (id) => studio.job(id),
    cancel: (id) => studio.cancel(id),
    saveKey: async (r) => {
      if (
        !r ||
        typeof r.key !== "string" ||
        r.key.length > 512 ||
        (r.key !== "" && r.key.length < 12) ||
        typeof r.remember !== "boolean"
      )
        throw Error("유효한 API 키를 입력해주세요.");
      await setKey(r);
      return { ok: true };
    },
    export: async (r) => {
      const result = await studio.export(r.id, r.format, r.blinkId);
      return saveFile(result, r);
    },
  };
}
