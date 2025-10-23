/**
 * Tauri API Polyfill for Web Mode
 * 
 * 在 Web 模式下，提供 Tauri API 的空实现，避免报错
 */

// 直接检查是否为 Web 模式，避免循环依赖
const isWebMode = !window.__TAURI_IPC__;

// 只在 Web 模式下注入 polyfill
if (isWebMode) {
  // 提供空的 __TAURI_IPC__ 函数
  window.__TAURI_IPC__ = async () => {
    return null;
  };

  // 提供空的 __TAURI__ 对象
  window.__TAURI__ = {
    invoke: async () => {
      return null;
    },
    convertFileSrc: (filePath: string) => filePath,
  };
}

export {};
