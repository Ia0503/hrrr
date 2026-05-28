<!--
  登录页面组件
  提供用户名/密码表单，调用后端登录接口进行身份验证

  功能说明：
    - 表单字段：用户名（username）、密码（password）
    - 基础表单验证：非空校验、长度限制
    - 登录成功后跳转到首页（或之前访问的页面）
    - 错误提示：登录失败时显示友好的错误信息
    - 加载状态：提交时禁用按钮并显示加载动画

  使用场景：
    - 用户首次访问系统时的身份认证入口
    - Token 过期后的重新登录页面
    - 主动退出登录后的跳转目标

  扩展方向：
    - 添加"记住密码"功能（localStorage / Cookie）
    - 添加图形验证码（防暴力破解）
    - 支持第三方登录（微信、GitHub OAuth 等）
    - 添加注册/忘记密码链接
-->
<script setup lang="ts">
/**
 * Login 组件
 * 使用 Vue 3 Composition API + TypeScript
 *
 * 核心依赖：
 *   - vue-router: 编程式导航（登录成功后跳转）
 *   - pinia: 用户状态管理（调用 login 方法）
 *   - ref/reactive: 响应式数据管理
 */
import { reactive, ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useUserStore } from "@/stores/user";

// ==================== 路由实例获取 ====================

/**
 * Router 实例
 * 用于编程式导航（登录成功后跳转到首页）
 *
 * useRouter() 说明：
 *   - Vue Router 提供的组合式 API 函数
 *   - 必须在 <script setup> 或 setup() 函数中调用
 *   - 返回路由实例对象，包含 push/replace/go 等方法
 */
const router = useRouter();

/**
 * 当前路由对象
 * 用于获取查询参数（如 redirect 回跳地址）
 *
 * useRoute() 说明：
 *   - 返回当前路由的位置信息（path、query、params 等）
 *   - 常用于读取 URL 参数或判断当前路径
 */
const route = useRoute();

// ==================== Store 实例获取 ====================

/**
 * 用户 Store 实例
 * 调用 login() 方法执行登录逻辑
 *
 * useUserStore() 说明：
 *   - Pinia 提供的 Hook 函数，用于获取 Store 实例
 *   - 返回 stores/user.ts 中定义的所有状态和方法
 *   - 在组件中可直接访问 token、userInfo、login() 等
 */
const userStore = useUserStore();

// ==================== 响应式数据定义 ====================

/**
 * 登录表单数据对象
 * 包含用户名和密码两个字段
 *
 * reactive() 说明：
 *   - Vue 3 的响应式 API，用于创建深层响应式对象
 *   - 适合用于复杂对象（如表单数据）
 *   - 与 ref() 的区别：reactive 解包后无需 .value
 *
 * 字段说明：
 *   - username: 用户名（⚠️ 实际使用时需填写真实账号）
 *   - password: 密码（⚠️ 实际使用时需填写真实密码，注意保密）
 */
const loginForm = reactive({
  username: "", // ⚠️ 默认为空，用户手动输入
  password: "", // ⚠️ 默认为空，用户手动输入（不要硬编码！）
});

/**
 * 表单字段交互状态
 * 用于跟踪用户是否已经与某个字段进行过交互（输入或失去焦点）
 *
 * 设计说明：
 *   - 初始值均为 false（未交互）
 *   - 用户输入或离开输入框时设为 true（已交互）
 *   - 只有在已交互的状态下才显示错误提示（避免未操作就报错）
 */
const fieldTouched = reactive({
  username: false, // 用户名是否已被交互
  password: false, // 密码是否已被交互
});

/**
 * 表单验证规则标识
 * 用于标记哪些字段已通过验证
 *
 * ref() 说明：
 *   - Vue 3 的响应式 API，用于创建单个响应式变量
 *   - 需要通过 .value 访问和修改值
 *   - 适合用于基本类型（string、number、boolean）
 */
const formValidated = reactive({
  username: false, // 用户名是否已验证通过
  password: false, // 密码是否已验证通过
});

/**
 * 表单提交加载状态
 * true = 正在提交中（按钮禁用+loading 动画）
 * false = 空闲状态（按钮可点击）
 */
const isLoading = ref<boolean>(false);

/**
 * 错误提示信息
 * 分为两类：
 *   - fieldErrors: 字段级验证错误（每个字段独立，互不影响）
 *   - submitError: 提交/API 返回的全局错误（如账号密码错误）
 */
const fieldErrors = reactive({
  username: "", // 用户名字段的具体错误信息
  password: "", // 密码字段的具体错误信息
});
const submitError = ref<string>(""); // API 返回的全局错误（账号密码错误等）

// ==================== 表单验证方法 ====================

/**
 * 用户名字段验证函数
 * 校验规则：非空 + 最小长度 2 位
 *
 * @returns boolean - 验证是否通过（true=通过，false=不通过）
 *
 * 触发时机：
 *   - 输入框输入时（@input 事件）→ 实时验证
 *   - 输入框失去焦点时（@blur 事件）→ 确认验证
 *   - 表单提交前统一校验
 */
function validateUsername(): boolean {
  /* 标记该字段已被用户交互 */
  fieldTouched.username = true;

  const username = loginForm.username.trim(); // 去除首尾空格

  // 规则1：非空检查
  if (!username) {
    fieldErrors.username = "请输入用户名";
    formValidated.username = false;
    console.warn("[login] 用户名验证失败：不能为空");
    return false;
  }

  // 规则2：最小长度检查
  if (username.length < 2) {
    fieldErrors.username = "用户名至少需要 2 个字符";
    formValidated.username = false;
    console.warn("[login] 用户名验证失败：长度不足");
    return false;
  }

  // 验证通过（清空该字段的错误提示）
  fieldErrors.username = "";
  formValidated.username = true;
  console.log(`[login] ✅ 用户名验证通过: ${username}`);
  return true;
}

/**
 * 密码字段验证函数
 * 校验规则：非空 + 最小长度 6 位
 *
 * @returns boolean - 验证是否通过
 *
 * 安全提示：
 *   - 不要在前端输出完整密码到日志（即使开发环境）
 *   - 仅记录密码长度或掩码（如 "****"）用于调试
 */
function validatePassword(): boolean {
  /* 标记该字段已被用户交互 */
  fieldTouched.password = true;

  const password = loginForm.password;

  // 规则1：非空检查
  if (!password) {
    fieldErrors.password = "请输入密码";
    formValidated.password = false;
    console.warn("[login] 密码验证失败：不能为空");
    return false;
  }

  // 规则2：最小长度检查
  if (password.length < 6) {
    fieldErrors.password = "密码至少需要 6 个字符";
    formValidated.password = false;
    console.warn(
      `[login] 密码验证失败：长度不足（当前 ${password.length} 位）`,
    );
    return false;
  }

  // 验证通过（⚠️ 不要输出密码内容到日志）
  fieldErrors.password = "";
  formValidated.password = true;
  console.log("[login] ✅ 密码验证通过");
  return true;
}

/**
 * 用户名输入事件处理
 * 在用户每次按键/输入时触发实时验证
 *
 * 设计说明：
 *   - 实时反馈：用户边输入边看到验证结果
 *   - 性能优化：Vue 的响应式系统已做节流，无需手动防抖
 *   - 体验提升：避免用户填完所有内容才发现错误
 *
 * 使用场景：
 *   - 用户输入 "a" → 显示"至少需要 2 个字符"
 *   - 用户继续输入 "ad" → 错误提示消失（验证通过）
 *   - 用户输入 "admin" → 保持通过状态
 */
function handleUsernameInput(): void {
  /* 只有在用户已经交互过的情况下才进行实时验证 */
  if (fieldTouched.username || loginForm.username.length > 0) {
    validateUsername();
  }
}

/**
 * 密码输入事件处理
 * 在用户每次按键/输入时触发实时验证
 *
 * 与 handleUsernameInput 设计保持一致：
 *   - 输入过程中实时更新验证状态
 *   - 达到要求后立即清除错误提示
 */
function handlePasswordInput(): void {
  /* 只有在用户已经交互过的情况下才进行实时验证 */
  if (fieldTouched.password || loginForm.password.length > 0) {
    validatePassword();
  }
}

// ==================== 表单提交方法 ====================

/**
 * 表单提交处理函数
 * 执行完整的登录流程：验证 → 提交 → 跳转
 *
 * @returns Promise<void> - 异步操作，无返回值
 *
 * 执行流程：
 *   1. 清空之前的错误信息
 *   2. 依次验证所有表单字段
 *   3. 所有字段验证通过后设置加载状态
 *   4. 调用 userStore.login() 发送登录请求
 *   5. 成功后跳转到首页或回跳地址
 *   6. 失败时显示错误提示
 *
 * 错误处理策略：
 *   - 网络异常：显示"网络连接失败，请稍后重试"
 *   - 账号密码错误：显示后端返回的错误消息
 *   - 其他未知错误：显示通用错误提示
 */
async function handleLogin(): Promise<void> {
  try {
    console.log("[login] 开始处理登录请求...");

    // 步骤1：清空之前的错误提示（只清全局提交错误，保留字段级错误）
    submitError.value = "";

    // 步骤2：表单字段验证（全部通过后才提交）
    const isUsernameValid = validateUsername();
    const isPasswordValid = validatePassword();

    if (!isUsernameValid || !isPasswordValid) {
      console.warn("[login] 表单验证未通过，取消提交");
      return; // 验证失败，终止提交流程
    }

    console.log("[login] ✅ 表单验证通过，准备提交...");

    // 步骤3：设置加载状态（防止重复提交）
    isLoading.value = true;

    // 步骤4：调用 Store 的 login 方法发送请求
    await userStore.login({
      username: loginForm.username,
      password: loginForm.password,
    });

    console.log("[login] ✅ 登录成功，准备跳转...");

    // 步骤5：确定跳转目标地址
    /**
     * 所有用户登录后统一跳转到仪表盘 "/dashboard"
     *
     * 设计说明：
     *   - 不再使用 URL 查询参数中的 redirect（避免跳转到之前的页面）
     *   - 确保所有角色（admin/user）登录后都有统一的入口体验
     *   - 用户可以从侧边栏自行导航到其他功能模块
     */
    const redirectPath = "/dashboard";

    console.log(`[login] 🔄 跳转到目标地址: ${redirectPath}`);

    // 步骤6：编程式导航跳转
    router.push(redirectPath);
  } catch (error: unknown) {
    // 统一错误处理
    console.error("[login] ❌ 登录失败:", error);

    /**
     * 错误类型判断与友好提示
     * 根据不同的错误类型给出对应的中文提示
     *
     * error 对象可能的结构：
     *   - AxiosError: { response: { data: { message } } }
     *   - Error: { message }
     *   - 其他未知类型
     */

    // 尝试提取后端返回的错误消息
    let errorMsg = "登录失败，请检查用户名和密码"; // 默认错误提示

    if (error instanceof Error) {
      // 标准 Error 对象
      errorMsg = error.message || errorMsg;
    } else if (
      typeof error === "object" &&
      error !== null &&
      "response" in error
    ) {
      // Axios 错误对象（从 HTTP 响应中提取 message）
      const axiosError = error as { response?: { data?: { message?: string } } };
      errorMsg =
        axiosError.response?.data?.message ||
        "服务器返回异常，请稍后重试";
    }

    // 显示错误提示给用户（仅设置全局提交错误，不影响字段级验证状态）
    submitError.value = errorMsg;
  } finally {
    // 无论成功还是失败，都重置加载状态
    isLoading.value = false;
  }
}

/**
 * 输入框按键事件处理
 * 监听 Enter 键，触发表单提交（提升用户体验）
 *
 * @param event - 键盘事件对象（KeyboardEvent）
 *
 * 使用场景：
 *   - 用户在密码框按 Enter 直接登录（无需点击按钮）
 *   - 符合大多数登录页面的交互习惯
 */
function handleKeyPress(event: KeyboardEvent): void {
  // 判断按下的是否为 Enter 键（keyCode 13 或 key "Enter"）
  if (event.key === "Enter") {
    handleLogin(); // 触发登录提交
  }
}
</script>

<template>
  <!--
    登录页面根容器
    全屏居中布局，浅灰色背景
  -->
  <div class="wf-login">
    <!-- ==================== 登录卡片容器 ==================== -->
    <!--
      卡片式设计
      白色背景 + 圆角 + 阴影，突出视觉焦点

      BEM 命名规范：
        Block: .wf-login（登录页面块）
        Element: __card（卡片子元素）、__title（标题）、__form（表单区域）
    -->
    <div class="wf-login__card">
      <!-- 页面标题 -->
      <h1 class="wf-login__title">WF Platform</h1>
      <p class="wf-login__subtitle">欢迎回来，请登录您的账号</p>

      <!-- ==================== 登录表单区域 ==================== -->
      <!--
        表单元素
        @submit.prevent 阻止默认提交行为（避免页面刷新）

        表单结构：
          - 用户名输入框（带图标前缀）
          - 密码输入框（带图标前缀，支持密码可见切换）
          - 错误提示区域（条件渲染）
          - 登录提交按钮（带 loading 状态）
      -->
      <form
        class="wf-login__form"
        novalidate
        @submit.prevent="handleLogin"
        @keypress="handleKeyPress"
      >
        <!-- ==================== 用户名输入框 ==================== -->
        <!--
          输入框组：标签 + 输入框

          v-model 双向绑定：
            - 输入框内容变化 → 自动更新 loginForm.username
            - 代码修改 loginForm.username → 自动刷新输入框显示

          @input 输入事件：
            - 用户每次按键/粘贴时触发实时验证
            - 即时反馈验证结果，提升用户体验

          @blur 失去焦点事件：
            - 用户离开输入框时触发确认验证
            - 作为实时验证的补充（确保最终状态正确）
        -->
        <div class="wf-login__form-group">
          <label for="username" class="wf-login__label">用户名</label>
          <input
            id="username"
            v-model="loginForm.username"
            type="text"
            class="wf-login__input"
            :class="{ 'wf-login__input--error': fieldTouched.username && !formValidated.username }"
            placeholder="请输入用户名"
            autocomplete="username"
            @input="handleUsernameInput"
            @blur="validateUsername"
          />
          <!-- 验证失败的视觉提示（仅在用户交互过且未通过时显示） -->
          <span
            v-if="fieldTouched.username && !formValidated.username"
            class="wf-login__error-hint"
          >
            {{ fieldErrors.username || "用户名格式不正确" }}
          </span>
        </div>

        <!-- ==================== 密码输入框 ==================== -->
        <!--
          密码输入框
          type="password" 自动掩码显示（显示为圆点或星号）

          autocomplete 属性：
            - "current-password": 浏览器自动填充建议
            - 有助于用户体验（记住密码功能）
        -->
        <div class="wf-login__form-group">
          <label for="password" class="wf-login__label">密码</label>
          <input
            id="password"
            v-model="loginForm.password"
            type="password"
            class="wf-login__input"
            :class="{ 'wf-login__input--error': fieldTouched.password && !formValidated.password }"
            placeholder="请输入密码"
            autocomplete="current-password"
            @input="handlePasswordInput"
            @blur="validatePassword"
          />
          <!-- 验证失败的视觉提示（仅在用户交互过且未通过时显示） -->
          <span
            v-if="fieldTouched.password && !formValidated.password"
            class="wf-login__error-hint"
          >
            {{ fieldErrors.password || "密码至少需要 6 个字符" }}
          </span>
        </div>

        <!-- ==================== 全局错误提示区域 ==================== -->
        <!--
          全局/提交级错误提示
          使用固定高度容器防止布局跳变

          设计说明：
            - 字段级错误显示在输入框下方（小字红色）
            - 提交级错误显示在表单底部（醒目红底白字）
            - 两者互不干扰，各自独立管理
        -->
        <div class="wf-login__error-message" :class="{ 'wf-login__error-message--visible': submitError }">
          {{ submitError || "\u00A0" }} <!-- 不换行空格占位，保持容器高度 -->
        </div>

        <!-- ==================== 登录按钮 ==================== -->
        <!--
          提交按钮

          :disabled 动态绑定禁用状态：
            - isLoading=true 时禁用（防止重复提交）
            - 视觉上变灰且不可点击

          :class 动态绑定样式类：
            - isLoading=true 时添加 loading 类（显示加载动画）
        -->
        <button
          type="submit"
          class="wf-login__button"
          :class="{ 'wf-login__button--loading': isLoading }"
          :disabled="isLoading"
        >
          <!-- Loading 状态文字切换 -->
          <span v-if="isLoading">登录中...</span>
          <span v-else>登 录</span>
        </button>
      </form>

      <!-- 底部辅助链接（预留位置） -->
      <div class="wf-login__footer">
        <!-- 示例：忘记密码链接（后续可接入真实功能） -->
        <!-- <a href="#" class="wf-login__link">忘记密码？</a> -->
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==================== 登录页面整体布局 ==================== */

/**
 * 登录页根容器
 * 全屏居中对齐，使用 Flexbox 实现
 *
 * 布局特点：
 *   - height: 100vh 占满整个视口高度
 *   - background-color 浅灰色背景（#f0f2f5）
 *   - 内容垂直水平居中（align-items + justify-content）
 */
.wf-login {
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: center; /* 水平居中 */
  min-height: 100vh; /* 最小高度 100% 视口（兼容移动端滚动） */
  padding: 20px; /* 内边距（移动端适配） */
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  /* 渐变背景色（紫色系，现代感强） */
}

/* ==================== 登录卡片样式 ==================== */

/**
 * 登录卡片容器
 * 白色背景 + 圆角 + 阴影效果
 *
 * 尺寸设计：
 *   - width: 400px 固定宽度（适合桌面端）
 *   - max-width: 100% 移动端自适应
 *   - padding: 40px 内边距（留白舒适）
 */
.wf-login__card {
  width: 100%;
  max-width: 400px;
  padding: 40px;
  background-color: #ffffff;
  border-radius: 8px; /* 圆角半径 8px */
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.15),
    /* 主阴影 */ 0 6px 10px rgba(0, 0, 0, 0.1); /* 辅助阴影（层次感） */
}

/** 页面主标题 */
.wf-login__title {
  margin: 0 0 8px; /* 下边距 8px */
  font-size: 28px;
  font-weight: bold;
  color: #1890ff; /* 品牌蓝色 */
  text-align: center; /* 文字居中 */
}

/** 页面副标题 */
.wf-login__subtitle {
  margin: 0 0 32px; /* 下边距 32px（与表单间距） */
  font-size: 14px;
  color: #666666; /* 灰色次要文字 */
  text-align: center;
}

/* ==================== 表单区域样式 ==================== */

/** 表单容器 */
.wf-login__form {
  display: flex;
  flex-direction: column; /* 垂直排列子元素 */
  gap: 20px; /* 子元素间距 20px */
}

/**
 * 表单组容器
 * 包含 label + input + 错误提示
 *
 * 布局设计（防跳变）：
 *   - 使用 min-height 预留错误提示的空间
 *   - 错误提示出现/消失时不会导致高度变化
 *   - 保证视觉稳定性
 */
.wf-login__form-group {
  display: flex;
  flex-direction: column;
  gap: 8px; /* label 与 input 间距 */
  min-height: 80px; /* 预留 label(20) + input(44) + error(16) 的最小高度，防止错误提示出现时跳动 */
}

/** 表单标签文字 */
.wf-login__label {
  font-size: 14px;
  font-weight: 500;
  color: #333333; /* 深灰色主文字 */
}

/**
 * 输入框基础样式
 * 统一的输入框外观设计
 *
 * 尺寸：
 *   - height: 44px 高度（适合点击和触摸）
 *   - padding: 0 12px 左右内边距
 *
 * 边框：
 *   - 默认：浅灰色边框 (#d9d9d9)
 *   - 聚焦：品牌蓝色边框 (#1890ff) + 外发光
 *   - 错误：红色边框 (#ff4d4f)
 */
.wf-login__input {
  height: 44px;
  padding: 0 12px;
  font-size: 14px;
  color: #333333;
  background-color: #ffffff;
  border: 1px solid #d9d9d9;
  border-radius: 4px; /* 小圆角 */
  outline: none; /* 移除浏览器默认聚焦轮廓 */
  transition: all 0.3s ease; /* 过渡动画（聚焦时平滑变化） */
}

/** 输入框聚焦态样式（获得焦点时） */
.wf-login__input:focus {
  border-color: #1890ff; /* 蓝色边框 */
  box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.1); /* 外发光效果 */
}

/** 输入框占位符样式 */
.wf-login__input::placeholder {
  color: #bfbfbf; /* 浅灰色占位文字 */
}

/** 输入框错误状态（验证失败时） */
.wf-login__input--error {
  border-color: #ff4d4f; /* 红色边框 */
}

.wf-login__input--error:focus {
  box-shadow: 0 0 0 2px rgba(255, 77, 79, 0.1); /* 红色外发光 */
}

/** 字段级错误提示（输入框下方的小字） */
.wf-login__error-hint {
  font-size: 12px;
  color: #ff4d4f; /* 红色错误文字 */
}

/* ==================== 错误提示区域样式 ==================== */

/**
 * 全局/提交级错误提示
 * 表单底部显示的醒目错误信息
 *
 * 布局设计（防跳变）：
 *   - 使用 min-height 预留空间（即使无错误也占位）
 *   - 出现/消失时不会导致按钮位置跳动
 *   - 视觉上更稳定
 *
 * 设计特点：
 *   - 红色背景 + 白色文字（高对比度）
 *   - 圆角 + 内边距（美观舒适）
 *   - 左侧红色竖条（强调视觉效果）
 */
.wf-login__error-message {
  min-height: 38px; /* 预留一行文字的高度，防止出现/消失时跳动 */
  padding: 10px 12px;
  font-size: 13px;
  color: transparent; /* 默认透明（占位状态） */
  background-color: transparent; /* 默认透明背景 */
  border-radius: 4px;
  border-left: 3px solid transparent; /* 默认透明边框 */
  line-height: 1.5;
  box-sizing: border-box; /* 确保 padding 不影响总高度 */
  transition: all 0.2s ease; /* 平滑过渡效果 */
}

/** 错误提示可见状态 */
.wf-login__error-message--visible {
  color: #fff; /* 白色文字 */
  background-color: #ff4d4f; /* 红色背景 */
  border-left-color: #cf1322; /* 深红色竖条 */
}

/* ==================== 登录按钮样式 ==================== */

/**
 * 提交按钮
 * 主要操作按钮的视觉设计
 *
 * 尺寸：
 *   - height: 44px 与输入框等高（对齐美观）
 *   - width: 100% 占满整行宽度
 *
 * 状态变体：
 *   - 默认：品牌蓝背景 + 白色文字 + hover 变深
 *   - loading：禁用态 + 半透明 + 光标禁止
 *   - disabled：灰色背景 + 不可点击
 */
.wf-login__button {
  height: 44px;
  margin-top: 8px; /* 上边距（与表单间距） */
  font-size: 16px;
  font-weight: 500;
  color: #ffffff;
  cursor: pointer; /* 鼠标悬停显示手型 */
  background-color: #1890ff; /* 品牌蓝色背景 */
  border: none; /* 无边框 */
  border-radius: 4px;
  transition: all 0.3s ease; /* 过渡动画 */
}

/** 按钮 hover 态（鼠标悬停） */
.wf-login__button:hover:not(:disabled) {
  background-color: #40a9ff; /* 浅蓝色（hover 变亮） */
}

/** 按钮 active 态（鼠标按下） */
.wf-login__button:active:not(:disabled) {
  background-color: #096dd9; /* 深蓝色（按下变暗） */
}

/** 按钮 disabled 态（禁用状态） */
.wf-login__button:disabled {
  cursor: not-allowed; /* 禁止光标（斜杠圆圈） */
  opacity: 0.65; /* 半透明效果 */
  background-color: #1890ff; /* 保持原色但透明 */
}

/** 按钮 loading 态（正在提交） */
.wf-login__button--loading {
  position: relative; /* 为伪元素定位做准备 */
  cursor: wait; /* 等待光标（沙漏形状） */
}

/* 可选：Loading 动画效果（使用伪元素实现旋转圈） */
/*
.wf-login__button--loading::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  border: 2px solid #fff;
  border-top-color: transparent;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: translateY(-50%) rotate(360deg); }
}
*/

/* ==================== 底部辅助区域样式 ==================== */

/** 底部容器 */
.wf-login__footer {
  margin-top: 24px;
  text-align: center;
}

/** 辅助链接样式（预留） */
.wf-login__link {
  font-size: 13px;
  color: #1890ff;
  text-decoration: none; /* 去掉下划线 */
}

.wf-login__link:hover {
  text-decoration: underline; /* 悬停时显示下划线 */
}

/* ==================== 响应式设计（移动端适配） ==================== */

/**
 * 平板设备适配（屏幕宽度 ≤ 768px）
 * 缩小卡片尺寸和字体
 */
@media screen and (max-width: 768px) {
  .wf-login__card {
    padding: 30px; /* 减少内边距 */
  }

  .wf-login__title {
    font-size: 24px; /* 缩小标题字号 */
  }
}

/**
 * 手机设备适配（屏幕宽度 ≤ 480px）
 * 进一步优化小屏体验
 */
@media screen and (max-width: 480px) {
  .wf-login__card {
    padding: 20px; /* 更小的内边距 */
    border-radius: 4px; /* 更小的圆角 */
  }

  .wf-login__title {
    font-size: 20px; /* 更小的标题 */
  }

  .wf-login__subtitle {
    font-size: 13px; /* 缩小副标题 */
  }
}
</style>
