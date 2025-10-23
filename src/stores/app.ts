import { defineStore } from "pinia";

import { isWebMode } from "../helpers/util";
import { getUserAgent } from "../commands/http_request";

export const useAppStore = defineStore("app", {
  state: () => {
    return {
      version: "--",
      tauriVersion: "--",
      arch: "--",
      platform: "--",
      os: "--",
      osVersion: "--",
      dir: "--",
      userAgent: "--",
    };
  },
  actions: {
    async fetch() {
      if (!isWebMode()) {
        const { getVersion, getTauriVersion } = await import("@tauri-apps/api/app");
        const { arch, platform, type, version } = await import("@tauri-apps/api/os");
        const { appDataDir } = await import("@tauri-apps/api/path");
        
        this.version = await getVersion();
        this.tauriVersion = await getTauriVersion();
        this.arch = await arch();
        this.platform = await platform();
        this.os = await type();
        this.osVersion = await version();
        this.dir = await appDataDir();
        this.userAgent = await getUserAgent();
      }
    },
  },
});
