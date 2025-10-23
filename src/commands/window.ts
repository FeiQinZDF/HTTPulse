import { run } from "./invoke";
import { isWebMode } from "../helpers/util";

export function closeSplashscreen() {
  run("close_splashscreen");
}

export async function showSplashscreen() {
  if (isWebMode()) {
    return;
  }
  const { getAll } = await import("@tauri-apps/api/window");
  getAll().forEach((item) => {
    if (item.label === "splashscreen") {
      item.show();
    }
  });
}

export async function setWindowSize(width: number, height: number) {
  if (isWebMode()) {
    return;
  }
  const { appWindow, LogicalSize } = await import("@tauri-apps/api/window");
  // 如果有设置小于0，则最大化
  if (width < 0 || height < 0) {
    await appWindow.maximize();
  } else if (width > 0 && height > 0) {
    await appWindow.setSize(new LogicalSize(width, height));
  }
}
