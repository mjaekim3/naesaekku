'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('touch', {
  getState: () => ipcRenderer.invoke('pet:get-state'),
  toggle: () => ipcRenderer.send('pet:toggle'),
  menu: () => ipcRenderer.send('pet:menu'),
  dragStart: () => ipcRenderer.send('pet:drag-start'),
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  onState: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('pet:state', listener);
    return () => ipcRenderer.removeListener('pet:state', listener);
  }
});
