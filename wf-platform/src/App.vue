<script setup lang="ts">
/**
 * 根组件
 * 作为路由出口的顶层容器
 * 使用 DefaultLayout 包裹所有页面内容
 */
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
