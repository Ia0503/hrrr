/**
 * @file 用户状态管理 Store
 * @module stores/user
 * @description 使用 Pinia Setup Store 风格管理用户登录状态、Token（访问令牌和刷新令牌）、用户基本信息、角色权限
 *             以及动态菜单路由。提供登录、获取用户信息、登出等核心操作方法。
 *
 * 依赖关系：
 *   - 被引用于: views/login/index.vue, 路由守卫, 全局需要用户状态的模块
 *   - 依赖于: utils/request.ts, vue-router, pinia, vue
 */

/**
 * 用户状态管理 Store
 * 使用 Pinia Setup Store 风格管理用户登录状态、权限和动态菜单
 *
 * 功能说明：
 *   - 管理用户 Token（访问令牌和刷新令牌）
 *   - 存储用户基本信息、角色和权限
 *   - 控制动态路由的添加状态
 *   - 提供登录、获取信息、登出等操作
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";
import router from "@/router";
import request from "@/utils/request";
import { AuditModule, AuditAction } from "@/types/log";

// ==================== 类型定义 ====================

/**
 * 菜单项接口
 * 用于描述动态路由中的每个菜单节点
 *
 * @property name - 路由名称（唯一标识）
 * @property path - 路由路径
 * @property component - 组件路径字符串（如 "views/dashboard/index"），父级为 null
 * @property redirect - 重定向路径（可选，父级菜单常用）
 * @property meta - 菜单元数据（标题、图标、是否隐藏等）
 * @property children - 子菜单数组（递归结构）
 */
export interface MenuListItem {
  name: string;
  path: string;
  component: string | null;
  redirect?: string | null;
  meta: {
    title: string;
    icon?: string;
    hidden?: boolean;
    [key: string]: unknown; // 允许扩展其他元数据字段
  };
  children?: MenuListItem[];
}

/**
 * 用户信息接口
 * 包含从后端获取的用户完整信息
 *
 * @property id - 用户 ID（数字类型）
 * @property username - 用户名（登录账号）
 * @property nickname - 用户昵称（显示名称）
 * @property avatar - 头像 URL 地址
 * @property email - 电子邮箱地址
 * @property roles - 角色标识数组（如 ["admin"] 或 ["user"]）
 * @property permissions - 权限码数组（如 ["*"] 或 ["user:read"]）
 * @property menuList - 动态菜单树（用于生成前端路由）
 */
export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  email: string;
  roles: string[];
  permissions: string[];
  menuList: MenuListItem[];
}

/**
 * 登录表单接口
 * 定义登录请求所需的字段
 *
 * @property username - 用户名（⚠️ 实际使用时需填写真实账号）
 * @property password - 密码（⚠️ 实际使用时需填写真实密码）
 */
interface LoginForm {
  username: string;
  password: string;
}

// ==================== 常量定义 ====================

/** Token 在 localStorage 中的存储键名（访问令牌） */
const TOKEN_KEY = "wf_token";

/** 刷新令牌在 localStorage 中的存储键名 */
const REFRESH_TOKEN_KEY = "wf_refresh_token";

// ==================== Store 定义 ====================

/**
 * 用户状态管理 Store
 * Store ID: 'user'
 *
 * 使用 Setup Store 风格（defineStore('id', () => { ... })）
 * 相比 Options Store 更灵活，支持组合式 API 特性
 */
export const useUserStore = defineStore("user", () => {
  // ==================== State（响应式状态）====================

  /** 访问令牌（JWT Token），用于身份验证（从 localStorage 恢复以支持刷新持久化）
   *  使用 try-catch 防止沙箱 iframe / 隐身模式等受限环境下 localStorage 访问被拒绝导致 Store 初始化崩溃 */
  let tokenValue = "";
  try {
    tokenValue = localStorage.getItem(TOKEN_KEY) || "";
  } catch (_storageError) {
    console.warn("[user-store] [WARN] localStorage 不可用，Token 将不持久化");
  }
  const token = ref<string>(tokenValue);

  /** 用户详细信息对象，包含角色、权限、菜单等 */
  const userInfo = ref<UserInfo | null>(null);

  /** 角色标识数组，如 ["admin"] 或 ["user"] */
  const roles = ref<string[]>([]);

  /** 权限码数组，如 ["*"] 或 ["user:read", "dashboard:view"] */
  const permissions = ref<string[]>([]);

  /**
   * 动态路由是否已添加标志位
   * 用于避免重复添加路由导致警告或错误
   * true = 已添加动态路由，false = 尚未添加
   */
  const isDynamicRoutesAdded = ref<boolean>(false);

  // ==================== Getters（计算属性）====================

  /**
   * 权限判断函数
   * 检查当前用户是否拥有指定的权限码
   *
   * 使用方式：
   * ```ts
   * const userStore = useUserStore();
   * if (userStore.hasPermission('dashboard:view')) {
   *   // 有权限执行的操作
   * }
   * ```
   *
   * @param permission - 待检查的权限码字符串（如 "task:create"）
   * @returns boolean - 是否拥有该权限（true=有权限，false=无权限）
   *
   * 判断逻辑：
   *   1. 如果用户拥有 "*" 权限（管理员），直接返回 true
   *   2. 否则检查 permissions 数组是否包含目标权限码
   */
  const hasPermission = computed(() => {
    return (permission: string): boolean => {
      // 管理员拥有所有权限（通配符 "*" 表示全部权限）
      if (permissions.value.includes("*")) {
        console.log(
          `[user-store] 权限检查通过: ${permission} (管理员通配符)`,
        );
        return true;
      }

      // 检查具体权限码是否存在
      const hasPerm = permissions.value.includes(permission);
      if (!hasPerm) {
        console.warn(
          `[user-store] 权限检查失败: 当前用户缺少权限 "${permission}"`,
        );
      }
      return hasPerm;
    };
  });

  // ==================== Actions（操作方法）====================

  /**
   * 用户登录方法
   * 调用后端登录接口，获取并存储 Token
   *
   * @param loginForm - 登录表单数据 { username, password }
   * @returns Promise<void> - 登录成功后自动更新状态
   *
   * 执行流程：
   *   1. 发送 POST /api/login 请求到后端
   *   2. 从响应中提取 accessToken 和 refreshToken
   *   3. 将 Token 存储到 localStorage（持久化）
   *   4. 更新 store 中的 token 状态
   *
   * 错误处理：
   *   - 登录失败时抛出异常，由调用方处理
   *   - 控制台输出详细错误日志
   */
  async function login(loginForm: LoginForm): Promise<void> {
    try {
      console.log("[user-store] 开始登录流程...");

      // 调用登录接口（POST /api/login）
      // ⚠️ 注意：request.ts 响应拦截器已将 { code, data, message } 解包为内层 data
      // 因此 response 直接就是 { accessToken, refreshToken, expiresIn, userInfo }
      const response = await request.post("/api/login", loginForm);

      // 校验返回数据结构
      if (!response?.accessToken || !response?.refreshToken) {
        throw new Error("登录响应数据格式异常：缺少 Token 字段");
      }

      // 存储 Token 到 localStorage（实现页面刷新后的持久化）
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);

      // 更新响应式状态
      token.value = response.accessToken;

      console.log(
        `[user-store] [INFO] 登录成功: token=${response.accessToken.substring(0, 12)}...`,
      );

      // ====== 审计日志：记录登录行为 ======
      try {
        const { useAuditLog } = await import("@/composables/useAuditLog");
        const { addLog } = useAuditLog();
        await addLog({
          module: AuditModule.AUTH,
          action: AuditAction.LOGIN,
          method: "POST",
          url: "/api/login",
          params: { username: loginForm.username },
          status: "success",
          username: loginForm.username,
          userId: userInfo.value?.id ?? null,
        });
      } catch (_logError) {
        /* 日志记录失败不影响登录流程 */
        console.error("[user-store] [ERROR] 登录审计日志记录失败:", _logError);
      }
    } catch (error: unknown) {
      // 记录详细的错误信息
      console.error("[user-store] [ERROR] 登录失败:", error);

      // 清理可能残留的无效 Token
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      token.value = "";

      // 向上抛出异常，让组件处理 UI 反馈
      throw error;
    }
  }

  /**
   * 获取用户信息方法
   * 调用后端接口获取当前用户的完整信息、角色和权限
   *
   * @returns Promise<void> - 成功后更新 userInfo/roles/permissions 状态
   *
   * 执行流程：
   *   1. 发送 GET /api/getUserInfo 请求（需携带 Authorization 头）
   *   2. 解析响应数据，更新用户信息、角色、权限
   *   3. 同时更新 menuList（用于后续动态路由生成）
   *
   * 注意事项：
   *   - 必须在 login() 之后调用（需要有效 Token）
   *   - 通常在路由守卫中自动触发
   */
  async function getUserInfo(): Promise<void> {
    try {
      console.log("[user-store] 正在获取用户信息...");

      // 调用获取用户信息接口（GET /api/getUserInfo）
      // ⚠️ 注意：response 已被响应拦截器解包，直接就是 { userInfo, roles, permissions, menuList }
      const response = await request.get("/api/getUserInfo");

      // 校验返回数据完整性
      if (
        !response ||
        !Array.isArray(response.roles) ||
        !Array.isArray(response.permissions)
      ) {
        console.error(
          "[user-store] 用户信息数据格式异常:",
          JSON.stringify(response),
        );
        throw new Error("用户信息数据格式异常");
      }

      // 更新响应式状态
      userInfo.value = response as UserInfo;
      roles.value = response.roles;
      permissions.value = response.permissions;

      console.log(
        `[user-store] [INFO] 用户信息获取成功: username=${response.username}, roles=[${response.roles.join(", ")}], permissions=[${permissions.value.join(", ")}]`,
      );
    } catch (error: unknown) {
      // 记录错误日志
      console.error("[user-store] [ERROR] 获取用户信息失败:", error);

      // 清空可能不完整的用户数据
      userInfo.value = null;
      roles.value = [];
      permissions.value = [];

      // 向上抛出异常
      throw error;
    }
  }

  /**
   * 用户登出方法
   * 清除所有用户相关状态和本地存储
   *
   * @returns void
   *
   * 执行流程：
   *   1. 清除 localStorage 中的 Token（wf_token 和 wf_refresh_token）
   *   2. 重置所有响应式状态为初始值（token, userInfo, roles, permissions）
   *   3. 重置动态路由添加标志位
   *   4. 编程式导航跳转到登录页（router.push('/login')）
   *
   * 使用场景：
   *   - 用户主动点击退出按钮
   *   - Token 过期且刷新失败时的被动登出
   */
  function logout(): void {
    console.log("[user-store] 开始登出流程...");

    // 清除 localStorage 中的 Token
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);

    // 重置所有响应式状态为初始值
    token.value = "";
    userInfo.value = null;
    roles.value = [];
    permissions.value = [];
    isDynamicRoutesAdded.value = false;

    console.log("[user-store] [INFO] 登出完成，已清除所有用户状态");

    // ====== 审计日志：记录登出行为（非阻塞，fire-and-forget）=====
    /* 注意：此时 Token 和 userInfo 已清除，需在清除前缓存用户名
     * logout() 是同步函数，不能使用 await，改用 .then().catch() 链式调用 */
    const logoutUsername = userInfo.value?.username ?? "unknown";
    const logoutUserId = userInfo.value?.id ?? null;
    import("@/composables/useAuditLog")
      .then(({ useAuditLog }) => {
        const { addLog } = useAuditLog();
        return addLog({
          module: AuditModule.AUTH,
          action: AuditAction.LOGOUT,
          method: "GET",
          url: "/api/logout",
          params: {},
          status: "success",
          username: logoutUsername,
          userId: logoutUserId,
        });
      })
      .catch((_logError) => {
        /* 日志记录失败不影响登出流程 */
        console.error("[user-store] [ERROR] 登出审计日志记录失败:", _logError);
      });

    // 跳转到登录页（使用 replace 避免浏览器后退问题）
    router.push("/login");

    /* 降级方案：如果 router.push 失败，可尝试以下方式
     * window.location.href = '/login'; // 强制刷新页面
     * 适用于路由实例异常或需要完全重置应用状态的场景
     */
  }

  // ==================== 返回公共接口 ====================

  /**
   * Store 公共接口
   * 按照规范导出所有需要暴露的状态和方法
   */
  return {
    // State（响应式状态）
    token,
    userInfo,
    roles,
    permissions,
    isDynamicRoutesAdded,

    // Getters（计算属性）
    hasPermission,

    // Actions（操作方法）
    login,
    getUserInfo,
    logout,
  };
});
