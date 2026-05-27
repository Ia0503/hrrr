/**
 * 应用入口文件
 * 负责初始化 Vue 实例、注册全局插件和指令
 *
 * 注册顺序（严格依赖）：
 *   1. Pinia（状态管理）→ Router 依赖 Store
 *   2. Router（路由）→ Guards 依赖 Router 实例
 *   3. Element Plus（UI 组件库）→ 布局组件依赖
 *   4. 路由守卫 → 必须在 app.use(router) 之后
 *   5. 自定义指令 → v-permission 权限控制
 */

import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import App from "./App.vue";
import router from "./router";

// 路由守卫（必须在 router 创建后、app.use(router) 前设置）
import { setupRouterGuards } from "./router/guards";

// v-permission 权限指令
import permissionDirective from "./directives/permission";

// 全局样式（含 Tailwind CSS V4 导入）
import "./style.css";

// ==================== 创建 Vue 应用实例 ====================
const app = createApp(App);

// ==================== 注册 Pinia 状态管理 ====================
/**
 * Pinia 必须在 Router 之前注册
 * 因为路由守卫中会使用到 useUserStore()
 */
const pinia = createPinia();
app.use(pinia);

// ==================== 注册 Vue Router ====================
app.use(router);

// ==================== 注册 Element Plus UI 组件库 ====================
/**
 * Element Plus: Vue3 企业级 UI 组件库
 * 全量注册所有组件和图标，开发阶段优先保证可用性
 * 生产环境可按需引入以减小包体积（使用 unplugin-vue-components + unplugin-auto-import）
 */
app.use(ElementPlus, {
  /** 设置 Element Plus 组件的默认尺寸 */
  size: "default",
  /** 设置 Element Plus 的语言为中文简体 */
  locale: undefined, // ⚠️ 如需完整中文国际化，需安装 element-plus/es/locale/lang/zh-cn
});

/** 批量注册 Element Plus 图标组件（全局可用） */
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

console.log(
  `[main] ✅ Element Plus 已注册，共 ${Object.keys(ElementPlusIconsVue).length} 个图标组件`,
);

// ==================== 设置路由守卫 ====================
setupRouterGuards(router);

// ==================== 注册全局自定义指令 ====================
app.directive("permission", permissionDirective);

// ==================== 挂载应用 ====================
app.mount("#app");
