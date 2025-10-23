import { defineComponent, onBeforeMount, ref } from "vue";
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
} from "naive-ui";
import { storeToRefs } from "pinia";

import { closeSplashscreen } from "./commands/window";
import { useSettingStore } from "./stores/setting";
import { useEnvironmentsStore } from "./stores/environments";
import App from "./App";
import ExLoading from "./components/ExLoading";
import { useAppStore } from "./stores/app";
import { getLocale } from "./i18n";
import { formatError } from "./helpers/util";

export default defineComponent({
  name: "RootView",
  setup() {
    const settingStore = useSettingStore();
    const appStore = useAppStore();
    const environmentsStore = useEnvironmentsStore();
    const { isDark } = storeToRefs(settingStore);
    const processing = ref(true);

    // 避免发布版本可以reload页面
    if (window.location.protocol.includes("tauri")) {
      document.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    const startedAt = Date.now();
    onBeforeMount(async () => {
      try {
        await appStore.fetch();
        await settingStore.fetch();
        // 初始化环境系统
        await environmentsStore.initialize();
        await settingStore.resize();
      } catch (err) {
        const errorMsg = formatError(err);
        console.error('[Root] Initialization error:', errorMsg);
        
        // 只在 Tauri 模式下显示弹窗
        if (window.__TAURI_IPC__) {
          try {
            const { message } = await import("@tauri-apps/api/dialog");
            message(errorMsg, "Error");
          } catch (dialogErr) {
            console.error('[Root] Failed to show dialog:', dialogErr);
          }
        }
      } finally {
        processing.value = false;
        // splashscreen最多300ms
        const delay = 300 - (Date.now() - startedAt);
        setTimeout(closeSplashscreen, delay);
      }
    });

    return {
      processing,
      isDark,
    };
  },
  render() {
    const { processing, isDark } = this;
    if (processing) {
      return <ExLoading />;
    }
    return (
      <NConfigProvider theme={isDark ? darkTheme : null} locale={getLocale()}>
        <NGlobalStyle />
        <NLoadingBarProvider>
          <NMessageProvider>
            <NNotificationProvider>
              <NDialogProvider>
                <App />
              </NDialogProvider>
            </NNotificationProvider>
          </NMessageProvider>
        </NLoadingBarProvider>
      </NConfigProvider>
    );
  },
});
