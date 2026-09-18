export function createUpdates({ updater, enabled, changed = () => {} }) {
  let status = { state: enabled ? "idle" : "unconfigured" };
  const set = (state, extra = {}) => {
    status = { state, ...extra };
    changed(status);
  };
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.on("update-available", (info) =>
    set("available", { version: info.version }),
  );
  updater.on("update-not-available", () => set("current"));
  updater.on("download-progress", (info) =>
    set("downloading", { percent: Math.round(info.percent) }),
  );
  updater.on("update-downloaded", () => set("ready"));
  updater.on("error", () => set("error"));
  return {
    get status() {
      return status;
    },
    async check() {
      if (
        !enabled ||
        ["checking", "downloading", "ready"].includes(status.state)
      )
        return;
      set("checking");
      try {
        await updater.checkForUpdates();
      } catch {
        set("error");
      }
    },
    async download() {
      if (status.state !== "available") return;
      set("downloading", { percent: 0 });
      try {
        await updater.downloadUpdate();
      } catch {
        set("error");
      }
    },
    install() {
      if (status.state === "ready") updater.quitAndInstall(false, true);
    },
  };
}
