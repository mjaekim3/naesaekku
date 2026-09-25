const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("petDesktop", {
  ready: () => ipcRenderer.invoke("pet:ready"),
  painted: (data) => ipcRenderer.send("pet:painted", data),
  dragStart: () => ipcRenderer.send("pet:drag-start"),
  dragEnd: () => ipcRenderer.send("pet:drag-end"),
  menu: () => ipcRenderer.send("pet:menu"),
  hover: (value) => ipcRenderer.send("pet:hover", value === true),
  place: (value) => ipcRenderer.send("pet:place", value),
  onCursor: (callback) =>
    ipcRenderer.on("pet:cursor", (_event, value) => callback(value)),
  onCommand: (callback) =>
    ipcRenderer.on("pet:command", (_event, value) => callback(value)),
  onView: (callback) =>
    ipcRenderer.on("pet:view", (_event, value) => callback(value)),
  onMessage: (callback) =>
    ipcRenderer.on("pet:message", (_event, value) => callback(value)),
});
