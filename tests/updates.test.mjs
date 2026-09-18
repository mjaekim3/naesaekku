import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createUpdates } from '../core/updates.mjs';

function setup(enabled = true) {
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn(async () => {});
  updater.downloadUpdate = vi.fn(async () => {});
  updater.quitAndInstall = vi.fn();
  const updates = createUpdates({ updater, enabled });
  return { updater, updates };
}
describe('desktop updates', () => {
  it('does not contact a server when this build has no release configuration', async () => {
    const { updater, updates } = setup(false);
    await updates.check();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updates.status.state).toBe('unconfigured');
  });
  it('downloads only on request and installs only when ready', async () => {
    const { updater, updates } = setup();
    updates.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await updates.check();
    updater.emit('update-available', { version: '0.4.0' });
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updates.status.state).toBe('available');
    await updates.download();
    updater.emit('download-progress', { percent: 55 });
    expect(updates.status.percent).toBe(55);
    updater.emit('update-downloaded');
    updates.install();
    expect(updater.quitAndInstall).toHaveBeenCalledOnce();
  });
  it('handles offline errors and can check again without duplicate checks', async () => {
    const { updater, updates } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
    await updates.check();
    expect(updates.status.state).toBe('error');
    await updates.check();
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    updater.emit('update-not-available');
    expect(updates.status.state).toBe('current');
    updater.emit('error', new Error('network'));
    expect(updates.status.state).toBe('error');
  });
  it('ignores unavailable downloads and recovers download failure', async () => {
    const { updater, updates } = setup();
    await updates.download();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    updater.emit('update-available', { version: '0.4.0' });
    updater.downloadUpdate.mockRejectedValueOnce(new Error('offline'));
    await updates.download();
    expect(updates.status.state).toBe('error');
  });
});
