const { contextBridge, ipcRenderer } = require("electron");
const api = {};
for (const method of [
  "state",
  "setArtworkDeleted",
  "permanentlyDeleteArtwork",
  "motionPrompt",
  "copyMotionPrompt",
  "prepareMotion",
  "saveMotion",
  "localStatus",
  "startLocal",
  "chatPrompt",
  "copyChatPrompt",
  "openChatGPT",
  "reviewPetSheet",
  "importPetSheet",
  "petFrames",
  "activatePet",
  "importPhotos",
  "importArtwork",
  "asset",
  "pixelPreview",
  "start",
  "job",
  "cancel",
  "saveKey",
  "export",
])
  api[method] = async (args) => {
    const result = await ipcRenderer.invoke("ongi:call", method, args);
    if (!result.ok) throw new Error(result.error);
    return result.data;
  };
contextBridge.exposeInMainWorld("ongi", Object.freeze(api));
