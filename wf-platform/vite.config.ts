import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { viteMockServe } from "vite-plugin-mock";
import tailwindcssVite from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  /**
   * 路径别名配置
   * @/ 映射到 src/ 目录，方便导入时使用绝对路径
   * 同时需要在 tsconfig.json 中配置 paths 保持一致
   */
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    vue(),
    /**
     * Tailwind CSS V4 Vite 插件
     * 无需 postcss.config.js / tailwind.config.js
     * 配置通过 CSS 中的 @theme 指令完成
     */
    tailwindcssVite(),
    /**
     * Vite Mock 插件配置
     * 开发环境下拦截匹配的 HTTP 请求，返回 Mock 数据
     * 生产构建时自动禁用，不影响正式接口调用
     *
     * Mock 文件存放位置：src/mock/*.ts
     * 文件内导出的 default 数组即为 Mock 规则集合
     */
    viteMockServe({
      /** Mock 文件所在目录 */
      mockPath: "src/mock",
      /** 是否启用本地 Mock（生产环境自动关闭） */
      localEnabled: true,
      /** 是否启用生产环境 Mock（通常关闭，仅调试时开启） */
      prodEnabled: false,
      /** 是否注入代码到每个模块顶部以支持 HMR 热更新 */
      injectCode: `
        import { setupProdMockServer } from './mock/index';
        setupProdMockServer();
      `,
      /** 日志级别：'info' 显示拦截记录，关闭设为 false */
      logger: false,
    }),
  ],
});
