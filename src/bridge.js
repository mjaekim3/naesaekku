async function request(method, args) {
  const response = await fetch("/bridge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ongi-Request": "studio" },
    body: JSON.stringify({ method, args }),
  });
  const value = await response.json();
  if (!value.ok) throw new Error(value.error);
  return value.data;
}
export const bridge =
  typeof window !== "undefined" && window.ongi
    ? window.ongi
    : {
        state: () => request("state"),
        permanentlyDeleteArtwork: (r) => request("permanentlyDeleteArtwork", r),
        setArtworkDeleted: (r) => request("setArtworkDeleted", r),
        motionPrompt: (r) => request("motionPrompt", r),
        copyMotionPrompt: async (r) => {
          await navigator.clipboard.writeText(await request("motionPrompt", r));
          return { copied: true };
        },
        prepareMotion: (r) => request("prepareMotion", r),
        saveMotion: (r) => request("saveMotion", r),
        localStatus: () => request("localStatus"),
        startLocal: (r) => request("startLocal", r),
        chatPrompt: (r) => request("chatPrompt", r),
        copyChatPrompt: async (r) => {
          await navigator.clipboard.writeText(await request("chatPrompt", r));
          return { copied: true };
        },
        openChatGPT: async () => {
          window.open("https://chatgpt.com/", "_blank", "noopener,noreferrer");
        },
        reviewPetSheet: (r) => request("reviewPetSheet", r),
        importPetSheet: (r) => request("importPetSheet", r),
        petFrames: (id) => request("petFrames", id),
        activatePet: (id) => request("activatePet", id),
        importPhotos: (files) => request("importPhotos", files),
        importArtwork: (f) => request("importArtwork", f),
        asset: (id) => request("asset", id),
        start: (r) => request("start", r),
        job: (id) => request("job", id),
        cancel: (id) => request("cancel", id),
        saveKey: (r) => request("saveKey", r),
        pixelPreview: (id) => request("pixelPreview", id),
        export: async (r) => {
          const out = await request("export", r);
          const link = document.createElement("a");
          link.href = `data:${out.mime};base64,${out.base64}`;
          link.download = `ongi-${r.format}.${out.ext}`;
          link.click();
          return { saved: true };
        },
      };
