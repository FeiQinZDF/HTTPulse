/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/ban-types
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// Tauri API 类型定义
interface Window {
  __TAURI_IPC__?: (args: any) => Promise<any>;
  __TAURI__?: {
    invoke: (cmd: string, args?: any) => Promise<any>;
    convertFileSrc: (filePath: string, protocol?: string) => string;
  };
}
