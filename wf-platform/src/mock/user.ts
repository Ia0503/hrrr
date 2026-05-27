/**
 * 用户相关 Mock 接口
 * 模拟登录和 Token 刷新功能
 *
 * @mock 本文件为 Mock 数据定义文件
 * 未来替换方式：
 *   1. 删除本文件或将其移至归档目录
 *   2. 在 vite.config.ts 中移除 viteMockServe 插件配置
 *   3. 确保 src/api/modules/user.ts 中的接口地址指向真实后端
 *   4. 取消 api 文件中被注释的真实 Axios 请求代码
 */

import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";

// ==================== 工具常量 ====================

/** Mock 使用的随机库前缀（MockJS 的 Random 对象） */
const { Random } = Mock;

/**
 * 模拟生成的 Token 前缀
 * 生产环境中由后端 JWT/OAuth 服务生成
 */
const MOCK_TOKEN_PREFIX = "mock_token_";

/**
 * 模拟 Token 有效期（毫秒）
 * 设为 10 秒便于测试 401 触发刷新流程
 * 实际项目中 Token 有效期通常为 15 分钟 ~ 2 小时
 *
 * ⚠️ 存疑：10 秒仅为测试值，正式对接后由后端控制有效期
 */
const MOCK_TOKEN_EXPIRES_MS = 10 * 1000;

/**
 * 内存中模拟的用户会话存储
 * Key: accessToken → Value: 会话信息
 * 仅用于 Mock 环境，不持久化
 */
const mockSessionStore = new Map<
  string,
  {
    userId: number;
    username: string;
    refreshToken: string;
    createdAt: number;
  }
>();

// ==================== 工具函数 ====================

/**
 * 生成一个模拟的 Access Token
 *
 * @returns {string} 格式为 mock_token_ + 随机字符串 的 Token
 */
function generateMockAccessToken(): string {
  return `${MOCK_TOKEN_PREFIX}${Random.string(32)}`;
}

/**
 * 生成一个模拟的 Refresh Token
 *
 * @returns {string} 格式为 mock_refresh_ + 随机字符串 的 Token
 */
function generateMockRefreshToken(): string {
  return `mock_refresh_${Random.string(40)}`;
}

// ==================== Mock 接口定义 ====================

/**
 * Mock 接口规则列表
 * 每个规则匹配特定的 URL 和 Method，返回预设的 Mock 数据
 *
 * MockMethod 结构说明：
 *   - url: 匹配的请求路径（支持正则）
 *   - method: HTTP 方法（GET / POST / PUT / DELETE 等）
 *   - response: 返回 Mock 数据的函数，接收参数为 (req.body, req.query, req.headers)
 *   - statusCode: 自定义 HTTP 状态码（可选，默认 200）
 */
export default [
  // ==================== 登录接口 ====================
  {
    /** @mock 模拟用户登录接口 */
    url: "/api/login",
    method: "post",

    /**
     * 登录 Mock 处理函数
     * 接收用户名和密码，返回模拟的 Token 和用户信息
     *
     * @param body - 请求体，期望格式 { username: string; password: string }
     * @returns Mock 响应数据
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const username = body?.username ?? "admin";
      const password = body?.password ?? "";

      console.log(
        `[mock/login] 收到登录请求: username=${username}, password=${"*".repeat(String(password).length)}`,
      );

      // 模拟密码校验（实际由后端完成）
      if (!username || !password) {
        console.warn("[mock/login] 登录失败：缺少用户名或密码");
        return {
          code: 40001,
          data: null,
          message: "用户名或密码不能为空",
        };
      }

      // 生成 Token
      const accessToken = generateMockAccessToken();
      const refreshToken = generateMockRefreshToken();
      const now = Date.now();

      // 存储会话信息（用于刷新 Token 时验证）
      mockSessionStore.set(accessToken, {
        userId: Random.integer(1000, 9999),
        username: String(username),
        refreshToken,
        createdAt: now,
      });

      console.log(
        `[mock/login] ✅ 登录成功: userId=${mockSessionStore.get(accessToken)?.userId}, token=${accessToken.substring(0, 12)}...`,
      );

      return {
        code: 0,
        data: {
          accessToken,
          refreshToken,
          expiresIn: Math.floor(MOCK_TOKEN_EXPIRES_MS / 1000), // 返回秒数
          userInfo: {
            id: mockSessionStore.get(accessToken)?.userId,
            username: String(username),
            nickname: `${String(username)}_昵称`,
            avatar: Random.image("100x100", "#4A90E2", "#FFF", "png", "avatar"),
            email: `${String(username)}@example.com`,
            role: username === "admin" ? "admin" : "user", // admin 用户拥有管理员角色
          },
        },
        message: "登录成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 刷新 Token 接口 ====================
  {
    /** @mock 模拟刷新 Token 接口 */
    url: "/api/refresh-token",
    method: "post",

    /**
     * 刷新 Token Mock 处理函数
     * 接收旧的 refreshToken，返回新的 accessToken 和 refreshToken
     *
     * @param body - 请求体，期望格式 { refreshToken: string }
     * @returns Mock 响应数据
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const refreshToken = body?.refreshToken ?? "";

      console.log(
        `[mock/refresh] 收到刷新请求: refreshToken=${String(refreshToken).substring(0, 16)}...`,
      );

      // 查找对应的会话
      let sessionInfo:
        | (typeof mockSessionStore extends Map<infer _K, infer V> ? V : never)
        | undefined;

      for (const [, session] of mockSessionStore) {
        if (session.refreshToken === refreshToken) {
          sessionInfo = session;
          break;
        }
      }

      if (!sessionInfo) {
        console.warn("[mock/refresh] 刷新失败：无效的 Refresh Token");
        return {
          code: 40002,
          data: null,
          message: "Refresh Token 无效或已过期",
        };
      }

      // 检查 Token 是否过期（模拟 7 天有效期）
      const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - sessionInfo.createdAt > SESSION_MAX_AGE_MS) {
        console.warn("[mock/refresh] 刷新失败：会话已过期");
        mockSessionStore.clear(); // 清除过期会话
        return {
          code: 40003,
          data: null,
          message: "会话已过期，请重新登录",
        };
      }

      // 生成新 Token
      const newAccessToken = generateMockAccessToken();
      const newRefreshToken = generateMockRefreshToken();

      // 更新会话存储（删除旧 key，插入新 key）
      mockSessionStore.delete(sessionInfo.username); // 尝试清理旧条目
      mockSessionStore.set(newAccessToken, {
        ...sessionInfo,
        refreshToken: newRefreshToken,
        createdAt: Date.now(), // 更新创建时间
      });

      console.log(
        `[mock/refresh] ✅ 刷新成功: newToken=${newAccessToken.substring(0, 12)}...`,
      );

      return {
        code: 0,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: Math.floor(MOCK_TOKEN_EXPIRES_MS / 1000),
        },
        message: "Token 刷新成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 获取当前用户信息接口 ====================
  {
    /** @mock 模拟获取当前登录用户信息接口 */
    url: "/api/user/info",
    method: "get",

    /**
     * 获取用户信息 Mock 处理函数
     * 从 Authorization 头解析 Token，查找对应会话
     *
     * @param headers - 请求头，从中提取 Authorization
     * @returns Mock 响应数据
     */
    response: ({ headers }: { headers?: Record<string, string> }) => {
      const authHeader = headers?.authorization ?? "";
      const token = authHeader.replace("Bearer ", "");

      console.log(
        `[mock/user-info] 收到用户信息请求: token=${token.substring(0, 12)}...`,
      );

      // 模拟 401 场景：如果 Token 以 "expire_" 开头，返回 401
      // 用于测试无感刷新流程
      if (token.startsWith("expire_")) {
        console.warn("[mock/user-info] 模拟 Token 过期，返回 401");
        return {
          statusCode: 401, // HTTP 401
          code: 40100,
          data: null,
          message: "Token 已过期",
        };
      }

      const session = mockSessionStore.get(token);
      if (!session) {
        console.warn("[mock/user-info] 未找到对应会话，返回 401");
        return {
          statusCode: 401,
          code: 40101,
          data: null,
          message: "无效的访问令牌",
        };
      }

      return {
        code: 0,
        data: {
          id: session.userId,
          username: session.username,
          nickname: `${session.username}_昵称`,
          avatar: Random.image("100x100", "#50E3C2", "#FFF", "png", "avatar"),
          email: `${session.username}@example.com`,
          roles: [session.username === "admin" ? "admin" : "user"],
          permissions:
            session.username === "admin"
              ? ["*"] // 管理员拥有全部权限
              : ["user:read", "user:write"], // 普通用户有限权限
        },
        message: "获取成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 获取用户详细信息（含动态菜单）接口 ====================
  {
    /** @mock 模拟获取用户详细信息及动态菜单树接口 */
    url: "/api/getUserInfo",
    method: "get",

    /**
     * 获取用户详细信息 Mock 处理函数
     * 从 Authorization 头解析 Token，返回用户基本信息、角色、权限和动态菜单树
     *
     * @param headers - 请求头，从中提取 Authorization
     * @returns Mock 响应数据（含菜单树）
     *
     * @mock 替换说明：
     *   本接口为 Mock 数据定义，正式环境需替换为真实后端 API
     *   替换步骤：
     *     1. 在后端实现 /api/getUserInfo 接口，返回相同的数据结构
     *     2. 删除本 Mock 定义或移至归档目录
     *     3. 确保 api 模块中的请求地址指向真实后端
     */
    response: ({ headers }: { headers?: Record<string, string> }) => {
      const authHeader = headers?.authorization ?? "";
      const token = authHeader.replace("Bearer ", "");

      console.log(
        `[mock/get-user-info] 收到用户详情请求: token=${token.substring(0, 12)}...`,
      );

      // 校验 Token 是否有效
      if (token.startsWith("expire_") || !token) {
        console.warn("[mock/get-user-info] Token 无效或已过期");
        return {
          statusCode: 401,
          code: 40100,
          data: null,
          message: "Token 已过期或无效",
        };
      }

      const session = mockSessionStore.get(token);
      if (!session) {
        console.error("[mock/get-user-info] 未找到对应会话");
        return {
          statusCode: 401,
          code: 40101,
          data: null,
          message: "无效的访问令牌",
        };
      }

      // 根据用户角色判断是否为管理员
      const isAdmin = session.username === "admin";

      /**
       * 管理员完整菜单树
       * 包含仪表盘、系统管理及其子菜单
       */
      const adminMenuList = [
        {
          name: "Dashboard",
          path: "/dashboard",
          component: "views/dashboard/index",
          redirect: null,
          meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false },
          children: [],
        },
        {
          name: "TaskBoard",
          path: "/task/board",
          component: "views/task/board",
          redirect: null,
          meta: { title: "任务看板", icon: "GridIcon", hidden: false },
          children: [],
        },
        {
          name: "System",
          path: "/system",
          component: null, // 父级无组件，使用布局组件
          redirect: "/system/user",
          meta: { title: "系统管理", icon: "SettingIcon", hidden: false },
          children: [
            {
              name: "UserManage",
              path: "/system/user",
              component: "views/system/user/index",
              meta: { title: "用户管理", icon: "UserIcon" },
            },
          ],
        },
      ];

      /**
       * 普通用户菜单树
       * 包含仪表盘和任务看板页面
       */
      const userMenuList = [
        {
          name: "Dashboard",
          path: "/dashboard",
          component: "views/dashboard/index",
          redirect: null,
          meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false },
          children: [],
        },
        {
          name: "TaskBoard",
          path: "/task/board",
          component: "views/task/board",
          redirect: null,
          meta: { title: "任务看板", icon: "GridIcon", hidden: false },
          children: [],
        },
      ];

      console.log(
        `[mock/get-user-info] ✅ 返回用户信息: role=${isAdmin ? "admin" : "user"}, menuCount=${isAdmin ? adminMenuList.length : userMenuList.length}`,
      );

      return {
        code: 0,
        data: {
          id: session.userId,
          username: session.username,
          nickname: `${session.username}_昵称`,
          avatar: Random.image(
            "100x100",
            "#4A90E2",
            "#FFF",
            "png",
            "avatar",
          ),
          email: `${session.username}@example.com`,
          roles: isAdmin ? ["admin"] : ["user"], // 角色标识数组
          permissions: isAdmin
            ? ["*"] // 管理员拥有全部权限
            : ["user:read", "dashboard:view"], // 普通用户有限权限
          menuList: isAdmin ? adminMenuList : userMenuList, // 动态菜单树
        },
        message: "获取成功",
      };
    },
  } satisfies MockMethod,
];
