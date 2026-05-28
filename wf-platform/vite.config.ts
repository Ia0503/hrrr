import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteMockServe } from "vite-plugin-mock";
import tailwindcssVite from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5177,
    cors: true,
    /**
     * 关闭 HMR（热更新）
     *
     * HMR 的 WebSocket 连接在跨设备/网络不稳定时经常导致页面卡死在 "connecting..."。
     * 关闭后：
     *   - 页面加载不再依赖 WebSocket，秒开
     *   - 改代码后需手动 F5 刷新浏览器
     *   - 功能完全不受影响，只是少了一点开发便利性
     */
    hmr: false,
  },

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue(),
    tailwindcssVite(),
    viteMockServe({
      mockPath: "src/mock",
      localEnabled: true,
      prodEnabled: false,
      injectCode: `
        import { setupProdMockServer } from './mock/index';
        setupProdMockServer();
      `,
      logger: false,
    }),
  ],
});
