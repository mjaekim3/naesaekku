import { test, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createRegistration } from '../desktop/registration.mjs';

test('registration reuses its window, protects IPC and keeps uploads available after closing', async () => {
  let handler;
  const windows = [];
  class Window extends EventEmitter {
    constructor() {
      super(); windows.push(this);
      this.webContents = new EventEmitter();
      this.webContents.mainFrame = { url: 'app://ongi/index.html' };
      this.webContents.setWindowOpenHandler = vi.fn();
      this.show = vi.fn(); this.hide = vi.fn(); this.focus = vi.fn();
    }
    async loadURL() {}
    isMinimized() { return false; }
  }
  const studio = { state: () => ({ hasKey: false }), importPhotos: vi.fn(async () => [{ id:'photo' }]) };
  const r = createRegistration({
    electron: { BrowserWindow: Window, ipcMain: { handle: (_name, fn) => { handler = fn; } }, safeStorage: { isEncryptionAvailable: () => false }, dialog: {} },
    dir: '.', preload: 'preload', icon: 'icon',
    openStudio: async () => studio,
  });
  await Promise.all([r.open(), r.open()]);
  expect(windows).toHaveLength(1);
  const w = windows[0];
  const trusted = { sender: w.webContents, senderFrame: w.webContents.mainFrame };
  expect((await handler(trusted, 'importPhotos', [])).data).toEqual([{ id:'photo' }]);
  expect((await handler({ sender: {}, senderFrame: w.webContents.mainFrame }, 'state')).ok).toBe(false);
  expect((await handler(trusted, 'arbitraryRead')).ok).toBe(false);
  const event = { preventDefault: vi.fn() };
  w.emit('close', event);
  expect(event.preventDefault).toHaveBeenCalled();
  expect(w.hide).toHaveBeenCalled();
  await r.open();
  expect(windows).toHaveLength(1);
  expect((await handler(trusted, 'state')).data).toEqual({ hasKey:false });
});
