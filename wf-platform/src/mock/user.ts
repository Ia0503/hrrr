/**
 * 用户相关 Mock 接口
 * 模拟用户认证、用户管理（CRUD）功能
 *
 * 数据模型：
 *   - 用户数据存储在模块级单例 userStore[] 中（模拟数据库表）
 *   - 所有接口共享同一数据源，修改即时生效
 *   - 刷新页面后重置为初始状态（纯内存实现）
 *
 * 预设账户：
 *   admin    管理员  密码 123456
 *   zhangsan 普通用户  密码 123456
 *   lisi     普通用户  密码 123456
 *   wangwu   普通用户  密码 123456
 */

import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";

const { Random } = Mock;

// ==================== 类型定义 ====================

/** 用户角色 */
type UserRole = "admin" | "user";

/** 用户状态 */
type UserStatus = "active" | "disabled";

/** 存储中的用户对象 */
interface StoredUser {
  id: number;
  username: string;
  nickname: string;
  password: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

// ==================== 统一用户存储（模块级单例）====================

/** Token 前缀 */
const MOCK_TOKEN_PREFIX = "mock_token_";

/** 会话信息 */
interface SessionInfo {
  userId: number;
  username: string;
  token: string;
  createdAt: number;
}

/** 内存会话存储：token → sessionInfo */
const sessionStore = new Map<string, SessionInfo>();

/** 自增 ID 计数器 */
let userIdCounter = 100;

/**
 * 初始化预设用户
 * 只有这些用户可以登录，其他登录请求一律拒绝
 */
function initUsers(): StoredUser[] {
  return [
    {
      id: userIdCounter++,
      username: "admin",
      nickname: "管理员",
      password: "123456",
      role: "admin",
      status: "active",
      createdAt: "2024-01-01 00:00:00",
    },
    {
      id: userIdCounter++,
      username: "zhangsan",
      nickname: "张三",
      password: "123456",
      role: "user",
      status: "active",
      createdAt: "2024-02-15 10:30:00",
    },
    {
      id: userIdCounter++,
      username: "lisi",
      nickname: "李四",
      password: "123456",
      role: "user",
      status: "active",
      createdAt: "2024-03-10 14:20:00",
    },
    {
      id: userIdCounter++,
      username: "wangwu",
      nickname: "王五",
      password: "123456",
      role: "user",
      status: "active",
      createdAt: "2024-04-20 09:15:00",
    },
  ];
}

/** 统一用户存储实例 */
let userStore: StoredUser[] = initUsers();

// ==================== 校验工具函数 ====================

/** 用户名校验：纯小写字母 [a-z]，长度 2~18 */
function isValidUsername(username: string): boolean {
  return /^[a-z]{2,18}$/.test(username);
}

/** 昵称校验：≥ 2个字符，支持中文/英文/符号 */
function isValidNickname(nickname: string): boolean {
  return typeof nickname === "string" && nickname.trim().length >= 2;
}

/** 密码校验：纯数字，长度 6~18 */
function isValidPassword(password: string): boolean {
  return /^\d{6,18}$/.test(password);
}

/** 根据用户名查找用户（用于登录）*/
function findUserByUsername(username: string): StoredUser | undefined {
  return userStore.find((u) => u.username === username);
}

/** 根据 ID 查找用户 */
function findUserById(id: number | string): StoredUser | undefined {
  return userStore.find((u) => u.id === Number(id));
}

/** 生成模拟 Token */
function generateToken(): string {
  return `${MOCK_TOKEN_PREFIX}${Random.string(32)}`;
}

/** 从 Authorization 头提取 Token 并查找对应会话 */
function getSession(headers?: Record<string, string>): SessionInfo | null {
  const authHeader = headers?.authorization ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token || token.startsWith("expire_")) return null;
  return sessionStore.get(token) ?? null;
}

/** 根据会话获取对应用户 */
function getUserFromSession(session: SessionInfo): StoredUser | undefined {
  return findUserById(session.userId);
}

// ==================== 菜单定义 ====================

/** 管理员菜单（含系统管理）*/
const ADMIN_MENUS = [
  { name: "Dashboard", path: "/dashboard", component: "views/dashboard/index", redirect: null as string | null, meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false }, children: [] },
  { name: "TaskBoard", path: "/task/board", component: "views/task/board", redirect: null, meta: { title: "任务看板", icon: "GridIcon", hidden: false }, children: [] },
  { name: "System", path: "/system", component: null, redirect: "/system/user", meta: { title: "系统管理", icon: "SettingIcon", hidden: false }, children: [
    { name: "UserManage", path: "/system/user", component: "views/system/user/index", meta: { title: "用户管理", icon: "UserIcon" }, children: [] as never[] },
  ]},
];

/** 普通用户菜单（无系统管理）*/
const USER_MENUS = [
  { name: "Dashboard", path: "/dashboard", component: "views/dashboard/index", redirect: null as string | null, meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false }, children: [] },
  { name: "TaskBoard", path: "/task/board", component: "views/task/board", redirect: null, meta: { title: "任务看板", icon: "GridIcon", hidden: false }, children: [] },
];

// ==================== Mock 接口定义 ====================

export default [
  // ==================== 登录接口 ====================
  {
    url: "/api/login",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const username = String(body?.username ?? "");
      const password = String(body?.password ?? "");

      console.log(`[mock/login] 登录请求: username=${username}`);

      /* 参数完整性检查 */
      if (!username || !password) {
        return { code: 40001, data: null, message: "请输入用户名和密码" };
      }

      /* 在已注册用户中查找 */
      const user = findUserByUsername(username);
      if (!user) {
        console.warn(`[mock/login] 用户不存在: ${username}`);
        return { code: 40401, data: null, message: "用户不存在" };
      }

      /* 检查账号是否被禁用（被删除的用户）*/
      if (user.status === "disabled") {
        console.warn(`[mock/login] 账号已被禁用: ${username}`);
        return { code: 40301, data: null, message: "该账号已被禁用，请联系管理员" };
      }

      /* 密码校验 */
      if (user.password !== password) {
        console.warn(`[mock/login] 密码错误: ${username}`);
        return { code: 40002, data: null, message: "密码错误" };
      }

      /* 登录成功 → 创建会话 + 返回 Token */
      const token = generateToken();
      sessionStore.set(token, {
        userId: user.id,
        username: user.username,
        token,
        createdAt: Date.now(),
      });

      console.log(`[mock/login] ✅ 登录成功: ${username} (${user.role})`);

      return {
        code: 0,
        data: {
          accessToken: token,
          refreshToken: `mock_refresh_${Random.string(40)}`,
          expiresIn: 86400,
          userInfo: {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            avatar: Random.image("100x100", "#4A90E2", "#FFF", "png", "avatar"),
            email: `${user.username}@example.com`,
            role: user.role,
          },
        },
        message: "登录成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 刷新 Token 接口 ====================
  {
    url: "/api/refresh-token",
    method: "post",

    response: () => ({
      code: 0,
      data: {
        accessToken: generateToken(),
        refreshToken: `mock_refresh_${Random.string(40)}`,
        expiresIn: 86400,
      },
      message: "Token 刷新成功",
    }),
  } satisfies MockMethod,

  // ==================== 获取当前用户信息（基础）====================
  {
    url: "/api/user/info",
    method: "get",

    response: ({ headers }: { headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      const user = getUserFromSession(session);
      if (!user) {
        return { statusCode: 401, code: 40101, data: null, message: "用户不存在或已被删除" };
      }

      return {
        code: 0,
        data: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: Random.image("100x100", "#50E3C2", "#FFF", "png", "avatar"),
          email: `${user.username}@example.com`,
          roles: [user.role],
          permissions: user.role === "admin" ? ["*"] : ["dashboard:view", "task:view", "task:create"],
        },
        message: "获取成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 获取用户详细信息（含菜单树）====================
  {
    url: "/api/getUserInfo",
    method: "get",

    response: ({ headers }: { headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      const user = getUserFromSession(session);
      if (!user) {
        return { statusCode: 401, code: 40101, data: null, message: "用户不存在或已被删除" };
      }

      const isAdmin = user.role === "admin";

      console.log(
        `[mock/get-user-info] ✅ 用户信息: ${user.username} (${isAdmin ? "管理员" : "普通用户"})`,
      );

      return {
        code: 0,
        data: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: Random.image("100x100", "#4A90E2", "#FFF", "png", "avatar"),
          email: `${user.username}@example.com`,
          roles: [user.role],
          permissions: isAdmin ? ["*"] : ["dashboard:view", "task:view", "task:create"],
          menuList: isAdmin ? ADMIN_MENUS : USER_MENUS,
        },
        message: "获取成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 获取用户列表（供负责人选择等场景）====================
  {
    url: "/api/user/list",
    method: "get",

    /**
     * 返回所有 active 状态的已注册用户
     * 用于 TaskForm 的负责人下拉列表
     */
    response: ({ headers }: { headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      /** 只返回活跃用户（排除 disabled）*/
      const activeUsers = userStore
        .filter((u) => u.status === "active")
        .map((u) => ({
          id: u.id,
          username: u.username,
          nickname: u.nickname,
          role: u.role,
        }));

      console.log(`[mock/user/list] ✅ 返回活跃用户: ${activeUsers.length} 个`);

      return { code: 0, data: activeUsers, message: "获取成功" };
    },
  } satisfies MockMethod,

  // ==================== 管理页用户列表（含禁用用户，仅管理员）====================
  {
    url: "/api/user/manage-list",
    method: "get",

    /**
     * 返回所有用户（含 disabled），用于管理页面展示
     * 只有管理员可调用
     */
    response: ({ headers }: { headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      const operator = getUserFromSession(session);
      if (!operator || operator.role !== "admin") {
        return { statusCode: 403, code: 40301, data: null, message: "无权限操作" };
      }

      /** 返回全部用户（包括被禁用的）*/
      const allUsers = userStore.map((u) => ({
        id: u.id,
        username: u.username,
        nickname: u.nickname,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      }));

      console.log(`[mock/user/manage-list] ✅ 返回全部用户: ${allUsers.length} 个 (含${allUsers.filter(u => u.status === 'disabled').length}个已禁用)`);

      return { code: 0, data: allUsers, message: "获取成功" };
    },
  } satisfies MockMethod,

  // ==================== 创建用户（仅管理员）====================
  {
    url: "/api/user/create",
    method: "post",

    response: ({ body, headers }: { body?: Record<string, unknown>; headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      /* 权限检查：只有管理员可创建用户 */
      const operator = getUserFromSession(session);
      if (!operator || operator.role !== "admin") {
        return { statusCode: 403, code: 40301, data: null, message: "无权限操作" };
      }

      const username = String(body?.username ?? "").trim().toLowerCase();
      const nickname = String(body?.nickname ?? "").trim();
      const password = String(body?.password ?? "");

      console.log(`[mock/user/create] 创建用户请求: username=${username}, nickname=${nickname}`);

      /* 字段校验 */
      if (!isValidUsername(username)) {
        return { code: 40001, data: null, message: "用户名格式错误：需为 2~18 位纯小写英文字母" };
      }
      if (!isValidNickname(nickname)) {
        return { code: 40002, data: null, message: "昵称格式错误：至少 2 个字符" };
      }
      if (!isValidPassword(password)) {
        return { code: 40003, data: null, message: "密码格式错误：需为 6~18 位纯数字" };
      }

      /* 用户名唯一性检查 */
      if (findUserByUsername(username)) {
        return { code: 40901, data: null, message: "用户名已存在" };
      }

      /* 创建新用户 */
      const now = new Date();
      /* 转换为北京时间（UTC+8）格式：YYYY-MM-DD HH:mm:ss */
      const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const createdAtStr = beijingTime.toISOString().replace("T", " ").slice(0, 19);

      const newUser: StoredUser = {
        id: userIdCounter++,
        username,
        nickname,
        password,
        role: "user",
        status: "active",
        createdAt: createdAtStr,
      };

      userStore.push(newUser);

      console.log(`[mock/user/create] ✅ 用户创建成功: ${username} (id=${newUser.id}, 总计${userStore.length})`);

      return {
        code: 0,
        data: { id: newUser.id, username: newUser.username, nickname: newUser.nickname, role: newUser.role },
        message: "创建成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 更新用户（仅管理员）====================
  {
    url: "/api/user/update",
    method: "post",

    response: ({ body, headers }: { body?: Record<string, unknown>; headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      const operator = getUserFromSession(session);
      if (!operator || operator.role !== "admin") {
        return { statusCode: 403, code: 40301, data: null, message: "无权限操作" };
      }

      const targetId = Number(body?.id);
      const targetUser = findUserById(targetId);

      if (!targetUser) {
        return { code: 40401, data: null, message: "目标用户不存在" };
      }

      console.log(`[mock/user/update] 更新用户: target=${targetUser.username}, operator=${operator.username}`);

      /* 规则：不能修改自己的角色（防止把自己降级导致无人管理）*/
      if (targetId === operator.id && body?.role !== undefined && String(body.role) !== operator.role) {
        return { code: 40302, data: null, message: "不能修改自己的角色" };
      }

      /* 规则：不能修改自己的状态（防止禁用自己）*/
      if (targetId === operator.id && body?.status !== undefined) {
        return { code: 40303, data: null, message: "不能修改自己的状态" };
      }

      /* 更新允许的字段（用户名不可变）*/
      if (body?.nickname !== undefined) {
        const newNickname = String(body.nickname).trim();
        if (!isValidNickname(newNickname)) {
          return { code: 40002, data: null, message: "昵称格式错误：至少 2 个字符" };
        }
        targetUser.nickname = newNickname;
      }
      if (body?.password !== undefined) {
        const newPassword = String(body.password);
        if (!isValidPassword(newPassword)) {
          return { code: 40003, data: null, message: "密码格式错误：需为 6~18 位纯数字" };
        }
        targetUser.password = newPassword;
      }
      if (body?.role !== undefined) {
        targetUser.role = String(body.role) as UserRole;
      }
      if (body?.status !== undefined) {
        targetUser.status = String(body.status) as UserStatus;
      }

      console.log(`[mock/user/update] ✅ 用户更新成功: ${targetUser.username} (role=${targetUser.role}, status=${targetUser.status})`);

      return {
        code: 0,
        data: { success: true, id: targetUser.id },
        message: "更新成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 删除用户（仅管理员，只能删普通用户）====================
  {
    url: "/api/user/delete",
    method: "post",

    response: ({ body, headers }: { body?: Record<string, unknown>; headers?: Record<string, string> }) => {
      const session = getSession(headers);
      if (!session) {
        return { statusCode: 401, code: 40100, data: null, message: "无效的访问令牌" };
      }

      const operator = getUserFromSession(session);
      if (!operator || operator.role !== "admin") {
        return { statusCode: 403, code: 40301, data: null, message: "无权限操作" };
      }

      const targetId = Number(body?.id);
      const targetUser = findUserById(targetId);

      if (!targetUser) {
        return { code: 40401, data: null, message: "目标用户不存在" };
      }

      console.log(`[mock/user/delete] 删除请求: target=${targetUser.username} (${targetUser.role}), operator=${operator.username}`);

      /* 不能删自己 */
      if (targetId === operator.id) {
        return { code: 40304, data: null, message: "不能删除自己" };
      }

      /* 只能删普通用户（不能删其他管理员）*/
      if (targetUser.role === "admin") {
        return { code: 40305, data: null, message: "不能删除管理员账户" };
      }

      /* 根据请求参数判断：软删除（禁用）或 硬删除（彻底移除）*/
      const isHardDelete = body?.hardDelete === true;

      if (isHardDelete) {
        /* 硬删除：从 userStore 中彻底移除该用户 */
        const index = userStore.findIndex((u) => u.id === targetId);
        if (index === -1) {
          return { code: 40401, data: null, message: "目标用户不存在" };
        }

        userStore.splice(index, 1);

        console.log(`[mock/user/delete] ✅ 用户已永久删除: ${targetUser.username} (剩余${userStore.length}个用户)`);

        return { code: 0, data: { success: true, id: targetUser.id }, message: "删除成功" };
      } else {
        /* 软删除（默认）：标记为 disabled，保留数据但禁止登录 */
        targetUser.status = "disabled";

        console.log(`[mock/user/delete] ✅ 用户已禁用: ${targetUser.username} (不再可登录)`);

        return { code: 0, data: { success: true, id: targetUser.id }, message: "删除成功" };
      }
    },
  } satisfies MockMethod,
];
