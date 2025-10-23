import { isMacOS } from "./helpers/util";

export async function initWindowEvent() {
  if (!(await isMacOS())) {
    return;
  }
  const { appWindow } = await import("@tauri-apps/api/window");
  const { hide } = await import("@tauri-apps/api/app");
  appWindow.onCloseRequested((e) => {
    e.preventDefault();
    hide();
  });
}
