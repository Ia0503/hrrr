<!--
  仪表盘首页组件
  显示欢迎信息和当前用户角色/权限列表

  功能说明：
    - 展示当前登录用户的基本信息（昵称、角色、权限）
    - 显示当前时间（考虑北京时间 Asia/Shanghai 时区）

  使用场景：
    - 用户登录后的默认首页
    - 验证动态路由和权限配置是否正确生效

  扩展方向：
    - 添加数据统计卡片（图表、数字面板）
    - 添加快捷操作入口（常用功能链接）
    - 添加最近活动记录（操作日志）
    - 添加通知公告列表
-->
<script setup lang="ts">
/**
 * @file 仪表盘首页组件
 * @module views/dashboard
 * @description 显示欢迎信息和当前用户角色/权限列表的仪表盘页面，包含实时时钟功能（北京时间 Asia/Shanghai 时区）。
 *             用户登录后的默认首页，用于验证动态路由和权限配置是否正确生效。
 *
 * 依赖关系：
 *   - 被引用于: 路由配置 /router/index.ts（仪表盘路由）
 *   - 依赖于: stores/user.ts, vue
 */
/**
 * Dashboard 组件
 * Vue 3 Composition API + TypeScript 实现
 *
 * 核心功能：
 *   - 从 Pinia Store 获取当前用户信息
 *   - 展示角色和权限列表
 *
 * 依赖模块：
 *   - @/stores/user: 用户状态管理 Store（获取 userInfo、roles、permissions）
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useUserStore } from "@/stores/user";

// ==================== Store 实例获取 ====================

/**
 * 用户 Store 实例
 * 用于访问当前登录用户的信息、角色和权限
 */
const userStore = useUserStore();

// ==================== 响应式数据定义 ====================

/**
 * 当前时间显示字符串
 * 格式："YYYY-MM-DD HH:mm:ss"（24小时制）
 * 每秒更新一次，展示实时时钟效果
 */
const currentTime = ref<string>("");

/**
 * 定时器 ID
 * 用于存储 setInterval 返回的定时器标识
 * 组件卸载时需清除定时器以防止内存泄漏
 */
let timerId: ReturnType<typeof setInterval> | null = null;

// ==================== 计算属性 ====================

/**
 * 当前用户昵称（计算属性）
 * 从 userInfo 中提取并格式化显示名称
 *
 * 降级策略：
 *   - 有昵称 → 显示 nickname
 *   - 无昵称但用户名存在 → 显示 "用户 {username}"
 *   - 都不存在 → 显示 "未知用户"
 */
const displayName = computed((): string => {
  if (userStore.userInfo?.nickname) {
    return userStore.userInfo.nickname;
  }

  if (userStore.userInfo?.username) {
    return `用户 ${userStore.userInfo.username}`;
  }

  return "未知用户";
});

/**
 * 当前用户角色描述文本
 * 将 roles 数组转换为易读的中文字符串
 */
const roleDescription = computed((): string => {
  const roles = userStore.roles;

  if (roles.includes("admin")) {
    return "管理员（拥有所有权限）";
  }

  if (roles.includes("user")) {
    return "普通用户（受限权限）";
  }

  console.warn("[dashboard] 未识别的角色:", roles);
  return roles.length > 0 ? roles.join(", ") : "无角色";
});

// ==================== 方法定义 ====================

/**
 * 更新当前时间
 * 获取北京时间并格式化为可读字符串
 * 时间格式：YYYY-MM-DD HH:mm:ss
 */
function updateCurrentTime(): void {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", // 北京时区
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // 24 小时制
    });

    const parts = formatter.formatToParts(now);
    const timeString = parts
      .map((part) => part.value)
      .join("")
      .replace(/\//g, "-");

    currentTime.value = timeString;
  } catch (error: unknown) {
    console.error("[dashboard] 时间格式化失败:", error);
    /* 降级方案：Intl.DateTimeFormat 不可用时回退到原生方法 */
    const now = new Date();
    currentTime.value = now.toLocaleString("zh-CN", {
      hour12: false,
    });
  }
}

/**
 * 启动实时时钟
 * 设置每秒更新一次时间的定时器
 */
function startClock(): void {
  updateCurrentTime();
  timerId = setInterval(updateCurrentTime, 1000);

  console.log("[dashboard] [INFO] 实时时钟已启动");
}

/**
 * 停止实时时钟
 * 清除定时器释放资源
 */
function stopClock(): void {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
    console.log("[dashboard] [INFO] 实时时钟已停止");
  }
}

// ==================== 生命周期钩子 ====================

onMounted(() => {
  console.log("[dashboard] [INFO] Dashboard 组件已挂载");
  startClock();
});

onUnmounted(() => {
  console.log("[dashboard] [INFO] Dashboard 组件即将卸载");
  stopClock();
});
</script>

<template>
  <div class="wf-dashboard">
    <!-- ==================== 欢迎区域 ==================== -->
    <div class="wf-dashboard__welcome">
      <h1 class="wf-dashboard__title">
        欢迎回来，{{ displayName }} 👋
      </h1>
      <p class="wf-dashboard__time">
        <span class="wf-dashboard__time-icon">🕐</span>
        北京时间：{{ currentTime }}
      </p>
    </div>

    <!-- ==================== 用户信息卡片区域 ==================== -->
    <div class="wf-dashboard__info-cards">
      <!-- ====== 角色信息卡片 ====== -->
      <div class="wf-dashboard__card wf-dashboard__card--role">
        <h2 class="wf-dashboard__card-title">📌 当前角色</h2>
        <div class="wf-dashboard__card-content">
          <p class="wf-dashboard__role-tags">
            <span
              v-for="(role, index) in userStore.roles"
              :key="index"
              class="wf-dashboard__tag"
              :class="{
                'wf-dashboard__tag--admin': role === 'admin',
                'wf-dashboard__tag--user': role === 'user',
              }"
            >
              {{ role }}
            </span>
          </p>
          <p class="wf-dashboard__role-desc">{{ roleDescription }}</p>
        </div>
      </div>

      <!-- ====== 权限列表卡片 ====== -->
      <div class="wf-dashboard__card wf-dashboard__card--permissions">
        <h2 class="wf-dashboard__card-title">🔐 权限列表</h2>
        <div class="wf-dashboard__card-content">
          <ul v-if="userStore.permissions.length > 0" class="wf-dashboard__permission-list">
            <li
              v-for="(perm, index) in userStore.permissions"
              :key="index"
              class="wf-dashboard__permission-item"
              :class="{ 'wf-dashboard__permission-item--all': perm === '*' }"
            >
              <code class="wf-dashboard__permission-code">{{ perm }}</code>
              <span v-if="perm === '*'" class="wf-dashboard__permission-badge">
                全部权限
              </span>
            </li>
          </ul>
          <p v-else class="wf-dashboard__empty-hint">暂无权限信息</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 仪表盘整体布局 ==================== */

.wf-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
  transition: var(--wf-transition-theme);
}

/* ==================== 欢迎区域样式 ==================== */

.wf-dashboard__welcome {
  padding: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: #ffffff;
}

.wf-dashboard__title {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: bold;
  line-height: 1.4;
}

.wf-dashboard__time {
  margin: 0;
  font-size: 16px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  gap: 8px;
}

.wf-dashboard__time-icon {
  font-size: 18px;
}

/* ==================== 信息卡片区域样式 ==================== */

.wf-dashboard__info-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.wf-dashboard__card {
  padding: 24px;
  background-color: var(--wf-bg-surface);
  border-radius: 8px;
  box-shadow: var(--wf-shadow-md);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

.wf-dashboard__card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.wf-dashboard__card-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--wf-text-primary);
  padding-bottom: 12px;
  border-bottom: 2px solid var(--wf-border-light);
}

.wf-dashboard__card-content {
  font-size: 14px;
  color: var(--wf-text-secondary);
}

/* ==================== 角色信息样式 ==================== */

.wf-dashboard__role-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.wf-dashboard__tag {
  display: inline-block;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  background-color: var(--wf-bg-surface-alt);
  color: var(--wf-text-secondary);
}

.wf-dashboard__tag--admin {
  background-color: #fff1f0;
  color: #cf1322;
  border: 1px solid #ffa39e;
}

.wf-dashboard__tag--user {
  background-color: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

.wf-dashboard__role-desc {
  margin: 0;
  font-size: 13px;
  color: var(--wf-text-muted);
  font-style: italic;
}

/* ==================== 权限列表样式 ==================== */

.wf-dashboard__permission-list {
  margin: 0;
  padding-left: 20px;
}

.wf-dashboard__permission-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--wf-border-light);
}

.wf-dashboard__permission-item:last-child {
  border-bottom: none;
}

/** 管理员全部权限高亮行 */
.wf-dashboard__permission-item--all {
  background-color: var(--wf-bg-surface-alt); /* 使用主题变量替代硬编码 #fffbe6 */
  padding: 6px 10px;
  border-radius: 4px;
  border-bottom: none;
}

/**
 * 权限码代码样式
 * 亮色模式：蓝字 + 浅灰底（保持原有风格）
 * 暗色模式：稍柔和的蓝 + 暗底
 */
.wf-dashboard__permission-code {
  display: inline-block;
  padding: 2px 8px;
  font-family: "Courier New", Consolas, monospace;
  font-size: 13px;
  color: var(--color-brand-500); /* 使用主题变量替代硬编码 #1890ff */
  background-color: var(--wf-bg-surface-alt);
  border-radius: 3px;
}

/** 全部权限徽章 */
.wf-dashboard__permission-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: bold;
  color: var(--wf-text-inverse); /* 使用主题变量替代硬编码 #fff */
  background-color: var(--wf-color-warning); /* 使用主题变量替代硬编码 #faad14 */
  border-radius: 10px;
}

.wf-dashboard__empty-hint {
  margin: 0;
  color: var(--wf-text-muted);
  text-align: center;
  padding: 20px 0;
}

/* ==================== 响应式设计 ==================== */

@media screen and (max-width: 1023px) {
  .wf-dashboard {
    gap: 16px;
  }

  .wf-dashboard__welcome {
    padding: 24px;
  }

  .wf-dashboard__title {
    font-size: 22px;
  }

  .wf-dashboard__time {
    font-size: 14px;
  }

  .wf-dashboard__info-cards {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .wf-dashboard__card {
    padding: 18px;
  }

  .wf-dashboard__card-title {
    font-size: 16px;
  }
}

@media screen and (max-width: 639px) {
  .wf-dashboard {
    gap: 12px;
  }

  .wf-dashboard__welcome {
    padding: 18px;
  }

  .wf-dashboard__title {
    font-size: 18px;
  }

  .wf-dashboard__time {
    font-size: 13px;
  }

  .wf-dashboard__card-title {
    font-size: 14px;
  }

  .wf-dashboard__card-content {
    font-size: 13px;
  }
}
</style>
