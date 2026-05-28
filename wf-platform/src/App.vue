<script setup lang="ts">
/**
 * @file 应用根组件
 * @module App
 * @description Vue 应用的根组件，作为路由出口的顶层容器，负责应用级初始化（主题模式恢复等）。
 *             所有页面内容通过 <router-view /> 在此渲染。
 *
 * 依赖关系：
 *   - 被引用于: main.ts（Vue 应用挂载入口）
 *   - 依赖于: stores/app.ts, vue-router, vue
 */
/**
 * 根组件
 * 作为路由出口的顶层容器
 * 负责应用级初始化（主题、全局状态等）
 */
import { onMounted } from "vue";
import { useAppStore } from "@/stores/app";

/* 获取 App Store 实例 */
const appStore = useAppStore();

/**
 * 应用挂载完成后执行全局初始化
 *
 * 初始化顺序：
 *   1. 主题模式（从 localStorage 或系统偏好恢复）
 *   2. （未来可扩展：国际化语言、全局配置等）
 */
onMounted(() => {
  console.log("[App] [INFO] 根组件已挂载，开始全局初始化");

  /* 初始化主题（必须在组件渲染前确定，但防闪烁由 index.html 处理）*/
  appStore.initTheme();
});
</script>

<template>
  <!-- 路由出口：所有页面内容在此渲染 -->
  <router-view />
</template>

<style>
/* 全局重置：确保根容器占满视口 */
#app {
  width: 100%;
  height: 100vh;
}
</style>
