/**
 * @file Axios HTTP 请求封装模块
 * @module utils/request
 * @description 基于 Axios 的统一 HTTP 请求封装，提供泛型响应结构、请求/响应拦截器、无感刷新 Token（Promise 队列+锁机制）、
 *             以及 GET/POST/PUT/DELETE 等便捷方法。所有业务请求均通过此模块发出。
 *
 * 依赖关系：
 *   - 被引用于: 全局（stores、views、composables 等所有需要 HTTP 请求的模块）
 *   - 依赖于: axios, localStorage（浏览器原生 API）
 */

/**
 * Axios 深度封装模块
 * 提供统一的 HTTP 请求能力，包含：
 *   - 泛型响应结构 ApiResponse<T>
 *   - 请求拦截器（自动注入 Token）
 *   - 响应拦截器（统一错误处理、无感刷新 Token）
 *   - 无感刷新 Token 的 Promise 队列 + 锁机制
 *   - 导出 GET / POST 等常用方法
 *
 * @module utils/request
 */

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from "axios";

// ==================== 类型定义 ====================

/**
 * 统一 API 响应结构（泛型）
 * 后端接口统一返回此格式，code 为业务状态码
 *
 * @template T - data 字段的具体数据类型
 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码，0 表示成功，非 0 表示业务错误 */
  code: number;
  /** 响应数据，成功时携带具体业务数据 */
  data: T;
  /** 响应消息，成功或错误的文字描述 */
  message: string;
}

/**
 * 刷新 Token 接口的响应类型
 * 用于无感刷新逻辑中的类型安全
 */
interface RefreshTokenResponse {
  /** 新的访问令牌 */
  accessToken: string;
  /** 新的刷新令牌 */
  refreshToken: string;
  /** Token 过期时间（秒） */
  expiresIn: number;
}

// ==================== 常量配置 ====================

/** Token 存储在 localStorage 中的 key（可自定义） */
const TOKEN_KEY = "wf_token";

/** 刷新 Token 存储在 localStorage 中的 key（可自定义） */
const REFRESH_TOKEN_KEY = "wf_refresh_token";

/**
 * 后端 API 基础地址
 * 开发环境使用相对路径（由 Vite proxy 或 Mock 处理）
 * 生产环境替换为实际后端地址，如 https://api.example.com
 *
 * ⚠️ 存疑：当前为 Mock 阶段，BASE_URL 设为空字符串。
 * 正式对接后端时需修改此处。
 */
const BASE_URL = "";

/** 请求超时时间（毫秒），30 秒 */
const REQUEST_TIMEOUT = 30000;

/**
 * 业务成功的 code 值
 * 根据后端约定调整，常见约定：0 或 200
 */
const SUCCESS_CODE = 0;

/** HTTP 401 未授权状态码 —— 触发 Token 刷新 */
const UNAUTHORIZED_STATUS = 401;

/** 刷新 Token 的接口地址 */
const REFRESH_TOKEN_URL = "/api/refresh-token";

/** 登录页路由路径（Token 刷新失败时跳转） */
const LOGIN_PATH = "/login";

// ==================== 无感刷新 Token：锁与队列机制 ====================

/**
 * 是否正在刷新 Token 的标志位（锁）
 * true = 正在刷新中，后续请求应排队等待
 * false = 未在刷新，可以发起新的刷新请求
 */
let isRefreshing = false;

/**
 * 等待 Token 刷新的请求队列
 * 每个 401 请求被挂起时，将 resolve 函数推入此队列
 * Token 刷新成功后，依次调用队列中的 resolve 重试请求
 */
let requestQueue: Array<(token: string) => void> = [];

// ==================== 工具函数 ====================

/**
 * 从 localStorage 获取 Token
 *
 * @returns {string | null} Token 字符串，不存在则返回 null
 */
function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (error) {
    // localStorage 可能因隐私模式/配额满等原因不可用
    console.error("[request] 获取 Token 失败，localStorage 不可用:", error);
    return null;
  }
}

/**
 * 将 Token 写入 localStorage
 *
 * @param token - 要存储的 Token 字符串
 */
function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (error) {
    console.error("[request] 存储 Token 失败，localStorage 不可用:", error);
  }
}

/**
 * 从 localStorage 获取 Refresh Token
 *
 * @returns {string | null} Refresh Token 字符串
 */
function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("[request] 获取 Refresh Token 失败:", error);
    return null;
  }
}

/**
 * 清除所有 Token 相关存储并跳转登录页
 * 用于 Token 刷新失败时的降级处理
 *
 * @param reason - 清除 Token 的原因描述（用于日志）
 */
function clearAuthAndRedirect(reason: string): void {
  console.warn(`[request] ${reason}，清除 Token 并跳转登录页`);
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error("[request] 清除 Token 失败:", error);
  }

  // 降级方案：如果不在浏览器环境中（如 SSR），window 不存在
  if (typeof window !== "undefined") {
    window.location.href = LOGIN_PATH;
  } else {
    console.error(
      "[request] 非 Browser 环境，无法跳转登录页，请手动处理未授权",
    );
  }
}

/**
 * 刷新 Token 的核心函数
 * 调用后端的刷新接口获取新的 Access Token
 *
 * @returns {Promise<string>} 新的 Access Token
 * @throws {Error} 刷新失败时抛出异常
 */
async function performTokenRefresh(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error("Refresh Token 不存在");
  }

  // ====== 未来替换说明 ======
  // 当前使用 axios 实例直接调用（避免循环依赖）
  // 正式对接后端时，将下方 mock 注释替换为真实请求：
  //
  // const response = await axios.post<ApiResponse<RefreshTokenResponse>>(
  //   REFRESH_TOKEN_URL,
  //   { refreshToken },
  // );
  // const { accessToken, refreshToken: newRefreshToken } = response.data.data;
  // setToken(accessToken);
  // localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
  // return accessToken;

  const response = await axios.post<ApiResponse<RefreshTokenResponse>>(
    REFRESH_TOKEN_URL,
    { refreshToken },
  );

  if (response.data.code !== SUCCESS_CODE) {
    throw new Error(response.data.message || "Token 刷新失败");
  }

  const { accessToken, refreshToken: newRefreshToken } = response.data.data;

  // 更新本地存储的 Token
  setToken(accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);

  console.log("[request] [INFO] Token 刷新成功");

  return accessToken;
}

/**
 * 处理 401 响应的核心逻辑
 * 利用 Promise 队列 + 锁机制实现无感刷新：
 *   1. 第一个 401 请求触发刷新，加锁 isRefreshing = true
 *   2. 后续 401 请求检测到锁已加，将自身 resolve 推入队列等待
 *   3. 刷新完成后，依次唤醒队列中的请求重试
 *   4. 解锁 isRefreshing = false
 *   5. 刷新失败则清除 Token 并跳转登录页
 *
 * @param originalConfig - 原始请求配置（用于重试）
 * @returns {Promise<AxiosResponse>} 重试后的响应（或原始 401 响应）
 */
async function handle401AndRetry(
  originalConfig: InternalAxiosRequestConfig,
): Promise<AxiosResponse> {
  // 如果原请求本身就在请求 refresh-token 接口，避免无限递归
  if (originalConfig.url === REFRESH_TOKEN_URL) {
    console.error("[request] [ERROR] 刷新 Token 接口本身返回 401，终止重试");
    clearAuthAndRedirect("Refresh Token 已失效");
    return Promise.reject(new Error("Refresh Token 无效"));
  }

  // 情况 A：当前没有正在进行的刷新 → 发起刷新
  if (!isRefreshing) {
    console.log("[request] [INFO] 加锁，发起 Token 刷新（首个 401 请求触发）");
    isRefreshing = true;

    try {
      const newToken = await performTokenRefresh();

      // 刷新成功：依次唤醒队列中等待的所有请求
      console.log(
        `[request] [INFO] 刷新成功，唤醒队列中 ${requestQueue.length} 个等待请求`,
      );
      requestQueue.forEach((resolve) => resolve(newToken));
      requestQueue = []; // 清空队列

      // 用新 Token 重试原始请求
      originalConfig.headers.Authorization = `Bearer ${newToken}`;
      return instance(originalConfig as AxiosRequestConfig);
    } catch (refreshError) {
      // 刷新失败：拒绝队列中所有等待的请求
      console.error(
        `[request] [ERROR] Token 刷新失败，拒绝队列中 ${requestQueue.length} 个请求`,
      );
      requestQueue.forEach((reject) =>
        reject(refreshError as unknown as string),
      );
      requestQueue = [];

      clearAuthAndRedirect("Token 刷新失败");
      return Promise.reject(refreshError);
    } finally {
      // 无论成功失败，最终解锁
      isRefreshing = false;
      console.log("[request] [INFO] 解锁，后续 401 请求可重新发起刷新");
    }
  }

  // 情况 B：已有刷新正在进行 → 加入等待队列
  console.log("[request] [INFO] 已有刷新进行中，当前请求加入等待队列");

  return new Promise<string>((resolve, _reject) => {
    requestQueue.push(resolve); // 注意：这里只 push resolve，_reject 在刷新失败时统一处理
  }).then((token) => {
    // 被唤醒后，用新 Token 重试原始请求
    originalConfig.headers.Authorization = `Bearer ${token}`;
    return instance(originalConfig as AxiosRequestConfig);
  });
}

// ==================== 创建 Axios 实例 ====================

/**
 * Axios 实例（单例）
 * 所有业务请求均通过此实例发出，
 * 统一经过请求/响应拦截器的处理链路
 */
const instance: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    "Content-Type": "application/json;charset=UTF-8",
  },
});

// ==================== 请求拦截器 ====================

instance.interceptors.request.use(
  /**
   * 请求发送前的拦截处理
   * 主要职责：自动注入 Authorization 头
   *
   * @param config - Axios 请求配置对象
   * @returns 处理后的请求配置
   */
  (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    // 从 localStorage 获取 Token 并注入请求头
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(
        `[request] [INFO] 请求拦截: ${config.method?.toUpperCase()} ${config.url}`,
      );
    } else {
      console.log(
        `[request] [INFO] 请求拦截（无 Token）: ${config.method?.toUpperCase()} ${config.url}`,
      );
    }

    return config;
  },

  /**
   * 请求发送失败的回调
   * 通常由网络断开、DNS 解析失败等底层错误触发
   *
   * @param error - 错误对象
   * @returns Promise reject，传递错误给调用方
   */
  (error: unknown) => {
    console.error("[request] [ERROR] 请求发送失败:", error);
    return Promise.reject(error);
  },
);

// ==================== 响应拦截器 ====================

instance.interceptors.response.use(
  /**
   * 响应成功接收（HTTP 状态码 2xx）
   * 主要职责：
   *   1. 校验业务状态码（code）
   *   2. 处理 401 无感刷新 Token
   *   3. 返回解包后的 data 数据
   *
   * @param response - Axios 响应对象
   * @returns 响应中的 data 字段（即 ApiResponse<T>.data）
   */
  <T>(response: AxiosResponse<ApiResponse<T>>): Promise<T> => {
    const { data } = response;
    const url = response.config.url || "unknown";
    const method = response.config.method?.toUpperCase() || "UNKNOWN";

    // HTTP 层面成功，检查业务层状态码
    if (data.code === SUCCESS_CODE) {
      console.log(`[request] [INFO] 响应成功: ${method} ${url}`);

      // ====== 审计日志自动采集（仅写操作）======
      /* 仅对 POST/PUT/DELETE 且业务成功的请求自动记录审计日志
       * 排除日志接口自身（防止递归死循环）
       * 使用 Promise.resolve().then() 异步执行，不阻塞当前响应返回
       * 动态 import 避免循环依赖（request.ts 被 stores 引用）
       * 全链路 try-catch 确保日志失败不影响主业务流程 */
      const WRITE_METHODS = new Set(["post", "put", "delete"]);
      const currentMethod = response.config.method?.toLowerCase();
      const urlPath = (response.config.url ?? "").split("?")[0];

      /* 排除日志接口，防止 addLog → post(/api/system/log/add) → 拦截器 → addLog 无限递归 */
      const AUDIT_EXCLUDE_URLS = ["/api/system/log/add", "/api/system/log/list"];

      if (
        WRITE_METHODS.has(currentMethod ?? "") &&
        !AUDIT_EXCLUDE_URLS.some((excluded) => urlPath === excluded)
      ) {
        Promise.resolve().then(async () => {
          try {
            const { useAuditLog } = await import("@/composables/useAuditLog");
            const { useUserStore } = await import("@/stores/user");
            const { addLog } = useAuditLog();
            const userStore = useUserStore();

            /** 从 URL 推断所属模块（urlPath 已在外层提取）*/
            let module = "system" as const;
            if (
              urlPath.startsWith("/api/login") ||
              urlPath.startsWith("/api/refresh-token") ||
              urlPath.startsWith("/api/getUserInfo")
            ) {
              module = "auth";
            } else if (urlPath.startsWith("/api/user")) {
              module = "user";
            } else if (urlPath.startsWith("/api/task")) {
              module = "task";
            }

            /** 将 HTTP 方法映射为 AuditAction */
            const actionMap: Record<string, string> = {
              post: "create",
              put: "update",
              delete: "delete",
            };

            /** 安全提取请求参数（兼容对象和字符串两种格式）*/
            let requestData: Record<string, unknown> = {};
            const rawData = response.config.data;
            if (typeof rawData === "object" && rawData !== null) {
              requestData = rawData as Record<string, unknown>;
            } else if (typeof rawData === "string") {
              try {
                /* Axios 有时会将 data 序列化为字符串，尝试反序列化 */
                requestData = JSON.parse(rawData);
              } catch (_parseError) {
                /* 解析失败则包装为原始字符串值 */
                requestData = { _raw: rawData };
              }
            }

            await addLog({
              method: currentMethod?.toUpperCase() ?? "",
              url: response.config.url ?? "",
              params: requestData,
              module,
              action: actionMap[currentMethod ?? ""] ?? "query" as const,
              userId: userStore.userInfo?.id ?? null,
              username: userStore.userInfo?.username ?? "anonymous",
              status: "success",
            });
          } catch (_auditError) {
            /* 降级：审计日志写入失败静默处理 */
            console.error(
              "[request] [ERROR] 审计日志自动采集失败:",
              _auditError,
            );
          }
        });
      }

      return Promise.resolve(data.data);
    }

    // 业务错误（code 非 SUCCESS_CODE）
    console.warn(
      `[request] [WARN] 业务错误 [${data.code}]: ${method} ${url} — ${data.message}`,
    );

    // 可选：根据特定业务错误码做特殊处理
    // 例如：权限不足(code=403)、账号被封(code=10001) 等

    return Promise.reject(new Error(data.message || "未知业务错误"));
  },

  /**
   * 响应接收失败（HTTP 状态码非 2xx）
   * 主要职责：
   *   1. 处理 401 → 触发无感刷新 Token
   *   2. 其他 HTTP 错误 → 统一提示
   *
   * @param error - Axios 错误对象
   * @returns Promise reject 或重试后的响应
   */
  async (error: unknown) => {
    // 类型守卫：判断是否为 Axios 错误（有 response/config）
    if (
      typeof error === "object" &&
      error !== null &&
      "response" in error &&
      "config" in error
    ) {
      const axiosError = error as {
        response?: { status: number; data?: unknown };
        config: InternalAxiosRequestConfig;
      };
      const { response, config } = axiosError;
      const status = response?.status;
      const url = config.url || "unknown";

      // ========== 核心：401 无感刷新 Token ==========
      if (status === UNAUTHORIZED_STATUS) {
        console.warn(
          `[request] [WARN] 收到 401: ${config.method?.toUpperCase()} ${url}，尝试无感刷新`,
        );
        return handle401AndRetry(config);
      }

      // ========== 其他 HTTP 错误处理 ==========
      const errorMessage =
        response &&
        typeof response.data === "object" &&
        response.data !== null &&
        "message" in response.data
          ? String((response.data as { message: unknown }).message)
          : `请求失败(HTTP ${status})`;

      console.error(
        `[request] [ERROR] HTTP 错误 [${status}]: ${config.method?.toUpperCase()} ${url} — ${errorMessage}`,
      );

      return Promise.reject(new Error(errorMessage));
    }

    // 非 Axios 错误（网络中断、超时等）
    const errorMessage =
      error instanceof Error ? error.message : "网络请求异常";
    console.error(`[request] [ERROR] 请求异常: ${errorMessage}`);

    return Promise.reject(error);
  },
);

// ==================== 导出便捷方法 ====================

/**
 * 封装 GET 请求
 *
 * @template T - 响应数据的泛型类型
 * @param url - 请求地址（会拼接 baseURL）
 * @param params - URL 查询参数（可省略）
 * @param config - 额外的 Axios 配置（可省略）
 * @returns Promise<T> 响应数据（已解包 ApiResponse.data）
 *
 * @example
 * ```ts
 * // 获取用户信息
 * const userInfo = await request.get<UserInfo>('/api/user/info');
 * ```
 */
async function get<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.get<any, T>(url, { params, ...config });
}

/**
 * 封装 POST 请求
 *
 * @template T - 响应数据的泛型类型
 * @param url - 请求地址
 * @param data - 请求体数据（可省略）
 * @param config - 额外的 Axios 配置（可省略）
 * @returns Promise<T> 响应数据（已解包 ApiResponse.data）
 *
 * @example
 * ```ts
 * // 登录
 * const result = await request.post<LoginResult>('/api/login', { username, password });
 * ```
 */
async function post<T>(
  url: string,
  data?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.post<any, T>(url, data, config);
}

/**
 * 封装 PUT 请求
 *
 * @template T - 响应数据的泛型类型
 * @param url - 请求地址
 * @param data - 请求体数据（可省略）
 * @param config - 额外的 Axios 配置（可省略）
 * @returns Promise<T> 响应数据
 */
async function put<T>(
  url: string,
  data?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.put<any, T>(url, data, config);
}

/**
 * 封装 DELETE 请求
 *
 * @template T - 响应数据的泛型类型
 * @param url - 请求地址
 * @param params - URL 查询参数（可省略）
 * @param config - 额外的 Axios 配置（可省略）
 * @returns Promise<T> 响应数据
 */
async function del<T>(
  url: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
): Promise<T> {
  return instance.delete<any, T>(url, { params, ...config });
}

// ==================== 默认导出 ====================

/**
 * 统一请求模块导出对象
 * 包含 Axios 实例和便捷方法，按需引入即可
 *
 * @example
 * ```ts
 * import request from '@/utils/request';
 * import { get, post } from '@/utils/request';
 *
 * // 使用默认实例
 * request.get('/api/user');
 *
 * // 使用便捷方法
 * const data = await post<LoginResult>('/api/login', { user, pass });
 * ```
 */
export default instance;

export { get, post, put, del };

// ==================== 导出工具函数（供 auth 模块使用）====================

export { getToken, setToken, clearAuthAndRedirect };
