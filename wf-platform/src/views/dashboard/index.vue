<!--
  仪表盘首页组件
  显示欢迎信息和当前用户角色/权限列表
  包含 v-permission 指令测试按钮（用于验证权限控制功能）

  功能说明：
    - 展示当前登录用户的基本信息（昵称、角色、权限）
    - 提供多个测试按钮，演示 v-permission 指令的显隐效果
    - 根据不同角色的权限自动显示/隐藏对应按钮
    - 显示当前时间（考虑北京时间 Asia/Shanghai 时区）

  使用场景：
    - 用户登录后的默认首页
    - 验证动态路由和权限配置是否正确生效
    - 开发调试时快速确认当前用户的权限范围

  权限按钮说明：
    - 管理员专属按钮：v-permission="['*']" → 仅 admin 角色可见
    - 仪表盘查看按钮：v-permission="['dashboard:view']" → admin 和 user 均可见
    - 创建任务按钮：v-permission="['task:create']" → 当前无人拥有此权限（用于测试隐藏效果）
    - 公开按钮：无 v-permission → 所有用户可见

  扩展方向：
    - 添加数据统计卡片（图表、数字面板）
    - 添加快捷操作入口（常用功能链接）
    - 添加最近活动记录（操作日志）
    - 添加通知公告列表
-->
<script setup lang="ts">
/**
 * Dashboard 组件
 * Vue 3 Composition API + TypeScript 实现
 *
 * 核心功能：
 *   - 从 Pinia Store 获取当前用户信息
 *   - 展示角色和权限列表
 *   - 测试 v-permission 自定义指令的效果
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
 *
 * useUserStore() 说明：
 *   - Pinia 的组合式 API Hook
 *   - 返回 stores/user.ts 中定义的所有响应式状态和方法
 *   - 在组件中通过 .value 访问 ref 状态，直接访问 getter 和 action
 */
const userStore = useUserStore();

// ==================== 响应式数据定义 ====================

/**
 * 当前时间显示字符串
 * 格式："YYYY-MM-DD HH:mm:ss"（24小时制）
 * 每秒更新一次，展示实时时钟效果
 *
 * ref<string> 说明：
 *   - Vue 3 的响应式引用类型
 *   - 通过 currentTime.value 读写值
 *   - 值变化时自动触发视图重新渲染
 */
const currentTime = ref<string>("");

/**
 * 定时器 ID
 * 用于存储 setInterval 返回的定时器标识
 * 组件卸载时需清除定时器以防止内存泄漏
 *
 * 类型说明：
 *   - number | null: 可能是定时器 ID（数字）或空值（未启动时）
 *   - NodeJS.Timer 是 Node.js 环境的类型定义（兼容性处理）
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
 *
 * computed() 说明：
 *   - Vue 3 的计算属性函数
 *   - 自动缓存结果，依赖项不变时不重新计算
 *   - 适合用于派生数据（从现有状态计算出新的显示值）
 */
const displayName = computed((): string => {
  // 优先使用昵称
  if (userStore.userInfo?.nickname) {
    return userStore.userInfo.nickname;
  }

  // 降级到用户名
  if (userStore.userInfo?.username) {
    return `用户 ${userStore.userInfo.username}`;
  }

  // 最终降级
  return "未知用户";
});

/**
 * 当前用户角色描述文本
 * 将 roles 数组转换为易读的中文字符串
 *
 * 映射规则：
 *   - ["admin"] → "管理员"
 *   - ["user"] → "普通用户"
 *   - 其他 → 直接拼接数组元素
 */
const roleDescription = computed((): string => {
  const roles = userStore.roles;

  if (roles.includes("admin")) {
    return "管理员（拥有所有权限）";
  }

  if (roles.includes("user")) {
    return "普通用户（受限权限）";
  }

  // 未知角色（防御性编程）
  console.warn("[dashboard] 未识别的角色:", roles);
  return roles.length > 0 ? roles.join(", ") : "无角色";
});

// ==================== 方法定义 ====================

/**
 * 更新当前时间
 * 获取北京时间并格式化为可读字符串
 *
 * 时间格式：YYYY-MM-DD HH:mm:ss
 * 示例输出："2024-01-15 14:30:25"
 *
 * ⚠️ 时区注意事项：
 *   - 使用 Intl.DateTimeFormat 或 toLocaleString 指定时区为 Asia/Shanghai
 *   - 避免使用 new Date() 直接格式化（会使用浏览器本地时区）
 *   - 北京时间 = UTC+8（东八区），与 Hong Kong 时区一致
 *
 * Intl.DateTimeFormat 参数说明：
 *   - timeZone: 'Asia/Shanghai' 强制使用北京时间
 *   - year/month/day/hour/minute/second: 数值格式的日期时间部分
 *   - hour12: false 使用 24 小时制（避免 AM/PM 歧义）
 */
function updateCurrentTime(): void {
  try {
    /**
     * 创建 Date 对象并格式化
     * Intl.DateTimeFormat 是国际化 API，支持多语言和多时区
     *
     * 为什么不使用 moment.js 或 dayjs？
     *   - 原生 API 已满足需求（无需引入额外依赖）
     *   - 包体积更小（Tree Shaking 友好）
     *   - 性能更好（原生实现优化）
     */
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai", // ⚠️ 关键：指定北京时区
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // 24 小时制
    });

    // 格式化日期时间为字符串数组并拼接
    const parts = formatter.formatToParts(now);
    const timeString = parts
      .map((part) => part.value)
      .join("")
      .replace(/\//g, "-"); // 将 "/" 替换为 "-"（统一分隔符）

    // 更新响应式状态
    currentTime.value = timeString;
  } catch (error: unknown) {
    // 格式化失败时的降级方案
    console.error("[dashboard] 时间格式化失败:", error);

    /* 降级逻辑：
     * 当 Intl.DateTimeFormat 不可用时（极老旧浏览器），
     * 回退到 Date 对象的原生方法
     * 注意：此方法不会强制使用北京时间！
     */
    const now = new Date();
    currentTime.value = now.toLocaleString("zh-CN", {
      hour12: false,
    });
  }
}

/**
 * 启动实时时钟
 * 设置每秒更新一次时间的定时器
 *
 * setInterval 说明：
 *   - JavaScript 定时器 API，每隔固定毫秒数执行回调
   *   返回定时器 ID（数字），用于后续 clearInterval 清除
   *   注意：即使标签页不可见，定时器仍会执行（现代浏览器优化后可能降低频率）
 */
function startClock(): void {
  // 立即执行一次（避免首秒空白）
  updateCurrentTime();

  // 设置每 1000ms（1 秒）执行一次
  timerId = setInterval(updateCurrentTime, 1000);

  console.log("[dashboard] ✅ 实时时钟已启动");
}

/**
 * 停止实时时钟
 * 清除定时器释放资源
 *
 * ⚠️ 重要：必须在 onUnmounted 生命周期中调用
 * 否则会导致内存泄漏（组件销毁后定时器仍在运行）
 */
function stopClock(): void {
  if (timerId !== null) {
    clearInterval(timerId); // 清除定时器
    timerId = null; // 重置引用（便于垃圾回收）

    console.log("[dashboard] ✅ 实时时钟已停止");
  }
}

// ==================== 生命周期钩子 ====================

/**
 * 组件挂载完成后调用
 * 在此启动实时时钟等副作用操作
 *
 * onMounted 说明：
 *   - Vue 3 的生命周期钩子（组合式 API 版本）
 *   - 组件 DOM 渲染完成后触发
 *   - 适合初始化需要 DOM 的操作（如定时器、事件监听、API 请求等）
 */
onMounted(() => {
  console.log("[dashboard] 📊 Dashboard 组件已挂载");

  // 输出当前用户信息到控制台（开发调试用）
  console.log("[dashboard] 当前用户信息:", {
    username: userStore.userInfo?.username,
    roles: userStore.roles,
    permissions: userStore.permissions,
  });

  // 启动实时时钟
  startClock();
});

/**
 * 组件卸载前调用
 * 在此清理副作用（定时器、事件监听等）
 *
 * onUnmounted 说明：
 *   - Vue 3 的生命周期钩子
 *   - 组件销毁前触发（DOM 尚未移除）
 *   - 必须清理所有在 onMounted 中创建的资源
 *   - 未清理会导致内存泄漏和意外行为
 */
onUnmounted(() => {
  console.log("[dashboard] 📊 Dashboard 组件即将卸载");

  // 停止实时时钟（释放定时器资源）
  stopClock();
});
</script>

<template>
  <!--
    仪表盘页面根容器
    BEM 命名规范：wf-dashboard（块）

    内容结构：
      - 欢迎区域（标题 + 时间）
      - 用户信息卡片（角色、权限列表）
      - 权限测试按钮组（验证 v-permission 效果）
  -->
  <div class="wf-dashboard">
    <!-- ==================== 欢迎区域 ==================== -->
    <!--
      页面标题和时间显示区

      设计特点：
        - 大标题突出显示
        - 实时时钟提供即时反馈
        - 渐变背景增强视觉效果
    -->
    <div class="wf-dashboard__welcome">
      <h1 class="wf-dashboard__title">
        欢迎回来，{{ displayName }} 👋
      </h1>
      <p class="wf-dashboard__time">
        <!-- 时钟图标（Unicode 字符，无需图标库） -->
        <span class="wf-dashboard__time-icon">🕐</span>
        北京时间：{{ currentTime }}
        <!-- ⚠️ 已考虑 Asia/Shanghai 时区 -->
      </p>
    </div>

    <!-- ==================== 用户信息卡片区域 ==================== -->
    <!--
      信息展示卡片
      采用网格布局（Grid）排列多个信息块

      卡片内容：
        - 角色信息：当前用户的角色标识和中文描述
        - 权限列表：用户拥有的所有权限码（数组形式展示）
    -->
    <div class="wf-dashboard__info-cards">
      <!-- ====== 角色信息卡片 ====== -->
      <div class="wf-dashboard__card wf-dashboard__card--role">
        <h2 class="wf-dashboard__card-title">📌 当前角色</h2>
        <div class="wf-dashboard__card-content">
          <!-- 角色标识（原始值） -->
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
          <!-- 角色描述（易读文本） -->
          <p class="wf-dashboard__role-desc">{{ roleDescription }}</p>
        </div>
      </div>

      <!-- ====== 权限列表卡片 ====== -->
      <div class="wf-dashboard__card wf-dashboard__card--permissions">
        <h2 class="wf-dashboard__card-title">🔐 权限列表</h2>
        <div class="wf-dashboard__card-content">
          <!--
            权限码列表
            使用 v-for 遍历 permissions 数组

            特殊情况处理：
              - permissions 为空时显示提示文字
              - 包含 "*" 时高亮显示（管理员通配符）
          -->
          <ul v-if="userStore.permissions.length > 0" class="wf-dashboard__permission-list">
            <li
              v-for="(perm, index) in userStore.permissions"
              :key="index"
              class="wf-dashboard__permission-item"
              :class="{ 'wf-dashboard__permission-item--all': perm === '*' }"
            >
              <!-- 权限码文本 -->
              <code class="wf-dashboard__permission-code">{{ perm }}</code>
              <!-- 管理员标记（仅 "*" 权限显示） -->
              <span v-if="perm === '*'" class="wf-dashboard__permission-badge">
                全部权限
              </span>
            </li>
          </ul>
          <!-- 无权限时的降级提示 -->
          <p v-else class="wf-dashboard__empty-hint">暂无权限信息</p>
        </div>
      </div>
    </div>

    <!-- ==================== 权限测试按钮组 ==================== -->
    <!--
      v-permission 指令测试区域
      用于验证自定义指令是否正确工作

      按钮分类：
        1. 管理员专属：仅 admin 角色（permissions=["*"]）可见
        2. 仪表盘查看：admin 和 user 角色均可见
        3. 创建任务：当前 Mock 数据中无人拥有（用于测试隐藏效果）
        4. 公开按钮：无权限限制，所有人可见

      预期效果（基于当前 Mock 数据）：
        - admin 用户：看到按钮 1、2、4（按钮 3 隐藏）
        - user 用户：看到按钮 2、4（按钮 1、3 隐藏）

      如何验证：
        1. 分别使用 admin 和 user 账号登录
        2. 观察哪些按钮显示或隐藏
        3. 打开浏览器开发者工具检查被移除的元素
        4. 查看控制台的 [permission-directive] 日志
    -->
    <div class="wf-dashboard__test-section">
      <h2 class="wf-dashboard__test-title">
        🔒 权限指令测试（v-permission）
      </h2>
      <p class="wf-dashboard__test-description">
        以下按钮根据当前用户权限自动显示或隐藏，
        可用于验证权限控制功能是否正常工作。
      </p>

      <!-- 按钮容器（Flexbox 水平排列） -->
      <div class="wf-dashboard__button-group">

        <!-- 按钮 1：管理员专属按钮 -->
        <!--
          v-permission="['*']"
          需要 "*" 通配符权限（仅管理员拥有）

          预期行为：
            - admin 用户：显示此按钮
            - user 用户：移除此按钮（DOM 中完全删除）
        -->
        <button
          v-permission="['*']"
          class="wf-dashboard__btn wf-dashboard__btn--primary"
          type="button"
          @click="
            console.log('[dashboard-test] 管理员专属按钮点击')
          "
        >
          ⭐ 管理员专属按钮
          <small>(v-permission="['*']")</small>
        </button>

        <!-- 按钮 2：仪表盘查看按钮 -->
        <!--
          v-permission="['dashboard:view']"
          需要 "dashboard:view" 权限码

          预期行为：
            - admin 用户：拥有 "*" 权限 → 显示（通配符包含所有权限）
            - user 用户：拥有 "dashboard:view" 权限 → 显示
            - 其他无此权限的用户：隐藏
        -->
        <button
          v-permission="['dashboard:view']"
          class="wf-dashboard__btn wf-dashboard__btn--success"
          type="button"
          @click="
            console.log('[dashboard-test] 仪表盘查看按钮点击')
          "
        >
          📊 可查看仪表盘按钮
          <small>(v-permission="['dashboard:view']")</small>
        </button>

        <!-- 按钮 3：创建任务按钮 -->
        <!--
          v-permission="['task:create']"
          需要 "task:create" 权限码

          预期行为（基于当前 Mock 数据）：
            - admin 用户：虽然拥有 "*" 权限，但由于 Mock 配置问题可能不显示
                   （实际应根据 hasPermission 逻辑判断）
            - user 用户：不拥有此权限 → 隐藏
            - 控制台输出警告日志：缺少 "task:create" 权限

          ⚠️ 此按钮主要用于测试"无权限隐藏"场景
        -->
        <button
          v-permission="['task:create']"
          class="wf-dashboard__btn wf-dashboard__btn--warning"
          type="button"
          @click="
            console.log('[dashboard-test] 创建任务按钮点击')
          "
        >
          ➕ 创建任务按钮
          <small>(v-permission="['task:create']")</small>
        </button>

        <!-- 按钮 4：公开按钮（无权限限制） -->
        <!--
          无 v-permission 指令
          所有登录用户均可看到此按钮

          用途：
            - 作为对照组，证明其他按钮的隐藏是指令导致的
            - 提供基础交互功能（不受权限影响）
        -->
        <button
          class="wf-dashboard__btn wf-dashboard__btn--default"
          type="button"
          @click="
            console.log('[dashboard-test] 所有人可见按钮点击')
          "
        >
          👥 所有人可见按钮
          <small>(无 v-permission)</small>
        </button>
      </div>

      <!-- 测试结果说明 -->
      <div class="wf-dashboard__test-note">
        <p>💡 <strong>测试说明：</strong></p>
        <ul>
          <li>使用 <strong>admin</strong> 账号登录：应看到前两个按钮 + 公开按钮</li>
          <li>使用 <strong>user</strong> 账号登录：应看到第二个按钮 + 公开按钮</li>
          <li>按 <strong>F12</strong> 打开开发者工具查看控制台日志</li>
          <li>被隐藏的按钮会从 DOM 中完全移除（而非 CSS display:none）</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 仪表盘整体布局 ==================== */

/**
 * 仪表盘根容器
 * 垂直方向排列各内容区块
 *
 * 布局方式：
 *   - Flexbox 垂直布局（flex-direction: column）
 *   - 子元素间距 24px（gap 属性）
 *   - 内边距 0（由父级布局容器 DefaultLayout 提供 padding）
 */
.wf-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px; /* 各区块间距 */
}

/* ==================== 欢迎区域样式 ==================== */

/**
 * 欢迎横幅区域
 * 渐变背景 + 白色文字，视觉冲击力强
 *
 * 设计特点：
 *   - linear-gradient 线性渐变（蓝紫色调）
 *   - border-radius 圆角（8px）
 *   - padding 内边距充足（呼吸感）
 */
.wf-dashboard__welcome {
  padding: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 8px;
  color: #ffffff;
}

/** 页面主标题 */
.wf-dashboard__title {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: bold;
  line-height: 1.4;
}

/** 实时时钟显示 */
.wf-dashboard__time {
  margin: 0;
  font-size: 16px;
  opacity: 0.9; /* 半透明白色（次要信息） */
  display: flex;
  align-items: center;
  gap: 8px; /* 图标与文字间距 */
}

/** 时钟图标 */
.wf-dashboard__time-icon {
  font-size: 18px;
}

/* ==================== 信息卡片区域样式 ==================== */

/**
 * 信息卡片网格容器
 * 使用 CSS Grid 实现两列自适应布局

 * Grid 模板：
 *   - repeat(auto-fit, minmax(300px, 1fr))
 *   - auto-fit: 自动填充可用空间
 *   - minmax(300px, 1fr): 最小宽度 300px，最大宽度平分
 *   - 效果：大屏两列，小屏单列（响应式）
 */
.wf-dashboard__info-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px; /* 卡片间距 */
}

/**
 * 单个信息卡片
 * 白色背景 + 阴影 + 圆角
 */
.wf-dashboard__card {
  padding: 24px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
}

/** 卡片 hover 态（鼠标悬停） */
.wf-dashboard__card:hover {
  transform: translateY(-2px); /* 轻微上浮效果 */
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12); /* 加深阴影 */
}

/** 卡片标题 */
.wf-dashboard__card-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: #333333;
  padding-bottom: 12px;
  border-bottom: 2px solid #f0f0f0; /* 标题下分割线 */
}

/** 卡片内容区 */
.wf-dashboard__card-content {
  font-size: 14px;
  color: #666666;
}

/* ==================== 角色信息样式 ==================== */

/** 角色标签容器 */
.wf-dashboard__role-tags {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap; /* 允许换行 */
}

/**
 * 角色标签
 * 不同角色使用不同颜色区分
 *
 * BEM Modifier:
 *   --admin: 管理员（红色系）
 *   --user: 普通用户（蓝色系）
 */
.wf-dashboard__tag {
  display: inline-block;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 4px;
  background-color: #f0f0f0;
  color: #666666;
}

/** 管理员标签（红色强调） */
.wf-dashboard__tag--admin {
  background-color: #fff1f0;
  color: #cf1322;
  border: 1px solid #ffa39e;
}

/** 普通用户标签（蓝色默认） */
.wf-dashboard__tag--user {
  background-color: #e6f7ff;
  color: #1890ff;
  border: 1px solid #91d5ff;
}

/** 角色描述文本 */
.wf-dashboard__role-desc {
  margin: 0;
  font-size: 13px;
  color: #999999;
  font-style: italic; /* 斜体（次要信息） */
}

/* ==================== 权限列表样式 ==================== */

/** 权限码列表容器 */
.wf-dashboard__permission-list {
  margin: 0;
  padding-left: 20px; /* 左侧缩进（列表默认样式） */
}

/**
 * 单个权限码列表项
 * 使用 Flexbox 横向排列（代码 + 徽章）
 */
.wf-dashboard__permission-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed #f0f0f0; /* 虚线分割 */
}

/** 最后一个列表项去除底部分割线 */
.wf-dashboard__permission-item:last-child {
  border-bottom: none;
}

/** 管理员全部权限高亮 */
.wf-dashboard__permission-item--all {
  background-color: #fffbe6;
  padding: 6px 10px;
  border-radius: 4px;
  border-bottom: none;
}

/**
 * 权限码代码样式
 * 使用 <code> 标签的等宽字体样式
 */
.wf-dashboard__permission-code {
  display: inline-block;
  padding: 2px 8px;
  font-family: "Courier New", Consolas, monospace; /* 等宽字体 */
  font-size: 13px;
  color: #1890ff;
  background-color: #f5f5f5;
  border-radius: 3px;
}

/** 全部权限徽章 */
.wf-dashboard__permission-badge {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: bold;
  color: #ffffff;
  background-color: #faad14;
  border-radius: 10px; /* 胶囊形状 */
}

/** 空状态提示 */
.wf-dashboard__empty-hint {
  margin: 0;
  color: #999999;
  text-align: center;
  padding: 20px 0;
}

/* ==================== 权限测试区域样式 ==================== */

/**
 * 测试区域容器
 * 浅灰背景区分于主内容区
 */
.wf-dashboard__test-section {
  padding: 24px;
  background-color: #fafafa;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
}

/** 测试区域标题 */
.wf-dashboard__test-title {
  margin: 0 0 12px;
  font-size: 18px;
  color: #333333;
}

/** 测试说明文字 */
.wf-dashboard__test-description {
  margin: 0 0 20px;
  font-size: 14px;
  color: #666666;
  line-height: 1.6;
}

/**
 * 按钮组容器
 * Flexbox 水平排列 + 自动换行
 */
.wf-dashboard__button-group {
  display: flex;
  flex-wrap: wrap; /* 允许换行（小屏幕适配） */
  gap: 12px; /* 按钮间距 */
  margin-bottom: 20px;
}

/**
 * 测试按钮基础样式
 * 统一的尺寸和圆角设计
 */
.wf-dashboard__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px; /* 图标与文字间距 */
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
  cursor: pointer;
  border: none;
  border-radius: 6px;
  transition: all 0.3s ease;
  white-space: nowrap; /* 文字不换行 */
}

/** 按钮内 small 标签（权限码说明） */
.wf-dashboard__btn small {
  opacity: 0.85;
  font-size: 12px;
  font-weight: normal;
}

/** 按钮 hover 态 */
.wf-dashboard__btn:hover:not(:disabled) {
  transform: translateY(-1px); /* 轻微上浮 */
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

/** 按钮 active 态 */
.wf-dashboard__btn:active:not(:disabled) {
  transform: translateY(0); /* 回到原位 */
}

/*
 * 按钮颜色变体（BEM Modifier）
 * 使用不同的背景色区分功能和权限级别
 */

/** 主要按钮（蓝色 - 管理员专属） */
.wf-dashboard__btn--primary {
  background-color: #1890ff;
}
.wf-dashboard__btn--primary:hover {
  background-color: #40a9ff;
}

/** 成功按钮（绿色 - 仪表盘查看） */
.wf-dashboard__btn--success {
  background-color: #52c41a;
}
.wf-dashboard__btn--success:hover {
  background-color: #73d13d;
}

/** 警告按钮（橙色 - 创建任务） */
.wf-dashboard__btn--warning {
  background-color: #faad14;
  color: #ffffff; /* 深色背景配白字 */
}
.wf-dashboard__btn--warning:hover {
  background-color: #ffc53d;
}

/** 默认按钮（灰色 - 公开按钮） */
.wf-dashboard__btn--default {
  background-color: #8c8c8c;
}
.wf-dashboard__btn--default:hover {
  background-color: #a6a6a6;
}

/* ==================== 测试说明区域样式 ==================== */

/** 测试说明容器 */
.wf-dashboard__test-note {
  padding: 16px;
  background-color: #e6f7ff;
  border-left: 4px solid #1890ff;
  border-radius: 4px;
  font-size: 13px;
  color: #555555;
  line-height: 1.8;
}

.wf-dashboard__test-note p {
  margin: 0 0 8px;
}

.wf-dashboard__test-note ul {
  margin: 0;
  padding-left: 20px;
}

.wf-dashboard__test-note li {
  margin-bottom: 4px;
}

/* ==================== 响应式设计 ==================== */

/**
 * 平板设备适配（≤ 768px）
 * 调整字号和间距
 */
@media screen and (max-width: 768px) {
  .wf-dashboard__welcome {
    padding: 24px;
  }

  .wf-dashboard__title {
    font-size: 22px;
  }

  .wf-dashboard__info-cards {
    grid-template-columns: 1fr; /* 单列布局 */
  }

  .wf-dashboard__button-group {
    flex-direction: column; /* 按钮垂直排列 */
  }

  .wf-dashboard__btn {
    width: 100%; /* 按钮占满宽度 */
    justify-content: center;
  }
}
</style>
