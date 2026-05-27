<script setup lang="ts">
/**
 * 404 页面组件
 * 当用户访问不存在的路由路径时显示此页面
 *
 * 功能说明：
 *   - 显示友好的 404 错误提示
 *   - 提供返回首页和返回上一步的导航按钮
 *   - 作为路由兜底，防止白屏问题
 *
 * 使用场景：
 *   - 用户手动输入错误的 URL 路径
 *   - 动态路由中配置的页面组件文件不存在（降级显示）
 *   - 已删除的页面被旧链接引用
 */

import { useRouter } from "vue-router";

/** Vue Router 实例 */
const router = useRouter();

/**
 * 返回首页操作
 * 导航到根路径 / ，由路由守卫处理后续逻辑
 */
const goHome = (): void => {
  router.push("/");
};

/**
 * 返回上一步操作
 * 使用浏览器历史记录返回上一页
 * 如果没有上一页则返回首页作为降级方案
 */
const goBack = (): void => {
  if (window.history.length > 1) {
    router.go(-1);
  } else {
    console.warn("[404] 无历史记录可回退，跳转首页");
    router.push("/");
  }
};
</script>

<template>
  <div class="wf-error-404">
    <!-- 错误码展示区域 -->
    <div class="wf-error-404__code">404</div>

    <!-- 错误提示信息 -->
    <h1 class="wf-error-404__title">页面未找到</h1>
    <p class="wf-error-404__desc">
      抱歉，您访问的页面不存在或已被移除
    </p>

    <!-- 操作按钮区域 -->
    <div class="wf-error-404__actions">
      <button class="wf-error-404__btn wf-error-404__btn--primary" type="button" @click="goHome">
        返回首页
      </button>
      <button class="wf-error-404__btn wf-error-404__btn--default" type="button" @click="goBack">
        返回上一步
      </button>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 404 页面布局样式 ==================== */

.wf-error-404 {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 40px 20px;
  background-color: #f5f7fa;
  text-align: center;
}

/* 错误码：超大字号，视觉焦点 */
.wf-error-404__code {
  font-size: 120px;
  font-weight: 700;
  color: #d0d5dd;
  line-height: 1;
  margin-bottom: 16px;
  letter-spacing: 8px;
}

/* 标题文字 */
.wf-error-404__title {
  font-size: 24px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 12px;
}

/* 描述文字 */
.wf-error-404__desc {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 32px;
  max-width: 360px;
  line-height: 1.6;
}

/* 按钮容器：水平排列 */
.wf-error-404__actions {
  display: flex;
  gap: 12px;
}

/* 按钮基础样式 */
.wf-error-404__btn {
  padding: 10px 24px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    color 0.2s ease;
}

/* 主要按钮：品牌色填充 */
.wf-error-404__btn--primary {
  background-color: #4f46e5;
  color: #ffffff;
  border-color: #4f46e5;
}

.wf-error-404__btn--primary:hover {
  background-color: #4338ca;
  border-color: #4338ca;
}

/* 默认按钮：白色背景 + 边框 */
.wf-error-404__btn--default {
  background-color: #ffffff;
  color: #374151;
  border-color: #d1d5db;
}

.wf-error-404__btn--default:hover {
  background-color: #f9fafb;
  border-color: #9ca3af;
}
</style>
