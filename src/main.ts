import { createApp } from "vue";
import { create } from "naive-ui";
import { createPinia } from "pinia";

import Debug from "debug";
import router, { goTo } from "./router";
import Root from "./root";
import { isWebMode } from "./helpers/util";
import { changeI18nLocale, LANG } from "./i18n";
import { getAppLatestRoute } from "./stores/setting";
import { getLang } from "./stores/local";
import { handleDatabaseCompatible } from "./commands/database";
import { showSplashscreen } from "./commands/window";
import { initWindowEvent } from "./event";
import "./userWorker";

// Suppress passive event listener warnings in development
if (isWebMode()) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('passive event listener')) {
      return; // Suppress passive event listener warnings
    }
    originalWarn.apply(console, args);
  };
}

// web mode enable debug:*
if (isWebMode()) {
  Debug.enable("*");
}

const app = createApp(Root);

async function init() {
  initWindowEvent();
  // 只在首次加载时显示启动屏幕，刷新时不显示
  // 通过检查 sessionStorage 来判断是否是刷新
  if (!sessionStorage.getItem('app_initialized')) {
    sessionStorage.setItem('app_initialized', 'true');
    showSplashscreen();
  }
  // TODO 校验数据库版本
  // 判断是否需要升级级别
  await handleDatabaseCompatible();
  let lang = (await getLang()) || LANG.zh;
  // 验证语言设置是否有效，如果无效则默认为中文
  if (lang !== LANG.zh && lang !== LANG.en) {
    console.log(`检测到无效的语言设置: ${lang}，重置为中文`);
    lang = LANG.zh;
    // 更新存储的语言设置
    const { setLang } = await import("./stores/local");
    await setLang(lang);
  }
  changeI18nLocale(lang);
  app.use(router);
  // 非浏览器模式打开上次打开的页面
  if (!isWebMode()) {
    const route = await getAppLatestRoute();
    if (route && route.name) {
      goTo(route.name, {
        query: route.query,
      });
    }
  }
}

const naive = create();
init()
  // 初始化失败是否弹窗
  .catch(console.error)
  .finally(() => {
    // TODO 确认客户是否允许提交此类出错信息至服务
    // 便于后续优化
    const unknown = "unknown";
    app.config.errorHandler = async (err, instance, info) => {
      const name = instance?.$options.name || unknown;
      const msg = (err as Error).message || unknown;
      const content = `${name}(${msg}): ${info}`;
      if (isWebMode()) {
        console.error(content);
        throw err;
      } else {
        const { message } = await import("@tauri-apps/api/dialog");
        message(content);
      }
    };
    app.use(naive).use(createPinia()).mount("#app");
  });
