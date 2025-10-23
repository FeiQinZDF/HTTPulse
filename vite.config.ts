import { resolve } from 'path'
import { defineConfig } from "vite";
import { visualizer } from "rollup-plugin-visualizer";
import vue from "@vitejs/plugin-vue";
import vueJsx from "@vitejs/plugin-vue-jsx";
import VitePluginLinaria from "vite-plugin-linaria";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 3000,
    watch: {
      // 强制监视文件变化
      usePolling: true,
    },
  },
  // 禁用缓存，确保开发时总是使用最新文件
  cacheDir: '.vite-cache',
  plugins: [
    vue(),
    vueJsx(),
    VitePluginLinaria(),
    visualizer(),
  ],
  // 排除 Tauri API，支持 Web 模式
  optimizeDeps: {
    exclude: ['@tauri-apps/api'],
  },
  build: {
    chunkSizeWarningLimit: 1024 * 1024,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        splashscreen: resolve(__dirname, "splashscreen.html"),
      },
      output: {
        manualChunks: {
          common: [
            "dayjs",
            "localforage",
            "debug",
            "lodash-es",
            "pretty-bytes",
            "ulid",
            "bluebird",
            "js-base64",
            "pretty-bytes",
            "crypto-js",
            "form-data-encoder"
          ],
          editor: [
            "monaco-editor",
          ],
          ui: [
            "vue",
            "vue-router",
            "vue-i18n",
            "pinia",
          ],
          naive: [
            "naive-ui",
          ]
        },
      },
    },
  },
});
