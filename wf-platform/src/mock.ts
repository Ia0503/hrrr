/**
 * Mock 数据层 — 模拟后端 API
 *
 * 本文件合并了原 src/mock/user.ts（用户认证/管理）与 src/mock/task.ts（看板任务）
 * 所有接口共享模块级内存存储，模拟后端数据库行为
 * 页面刷新后重置为初始状态（纯内存实现，无持久化）
 *
 * 预设账户：
 *   admin    管理员  密码 123456
 *   zhangsan 普通用户  密码 123456
 *   lisi     普通用户  密码 123456
 *   wangwu   普通用户  密码 123456
 *
 * 接口清单（共 13 个）：
 *   用户相关 (9)：login, refresh-token, user/info, getUserInfo,
 *                 user/list, user/manage-list, user/create, user/update, user/delete
 *   任务相关 (4)：task/board, task/create, task/update, task/delete
 */

import Mock from "mockjs";

const { Random } = Mock;

// ==================== MockMethod 接口定义 ====================

/**
 * Mock 接口方法类型（本地定义，不依赖 vite-plugin-mock）
 * 与 vite.config.ts 中 viteMockServe 插件的自定义兼容接口对齐
 */
interface MockMethod {
  url: string;
  method?: "get" | "post" | "put" | "delete" | "patch";
  response?: ((opt: {
    body: Record<string, unknown>;
    query: Record<string, unknown>;
    headers: Record<string, unknown>;
    url: Record<string, unknown>;
  }) => unknown) | unknown;
}

// ==================== 用户相关类型定义 ====================

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

/** Token 前缀 */
const MOCK_TOKEN_PREFIX = "mock_token_";

/** 会话信息 */
interface SessionInfo {
  userId: number;
  username: string;
  token: string;
  createdAt: number;
}

// ==================== 任务相关类型定义 ====================

/**
 * 任务接口定义（统一存储格式）
 *
 * 【嵌套支持说明】
 * v2 新增 requirement/bugInfo/debt/doc 四个可选嵌套对象，
 * 对应 SchemaForm 引擎的路径式 field（如 "bugInfo.severity"）。
 * 这些字段在 taskType 匹配时由前端表单提交，Mock 层透传存储和返回。
 */
interface StoredTask {
  id: number | string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: string;
  tags?: string[];
  createdAt: string;
  orderIndex: number;
  /** 任务类型：feature/bug/improvement/tech_debt/doc */
  taskType?: string;
  /** 截止日期，格式 YYYY-MM-DD */
  dueDate?: string;
  /** 预估工时（小时）*/
  estimatedHours?: number;
  /** 复杂度评分（1-5）*/
  complexity?: number;
  /** 是否加急标记 */
  isUrgent?: boolean;

  /* ========== 嵌套字段区域（v2 新增）========== */

  /** 需求规格信息（taskType="feature" 时使用） */
  requirement?: {
    source: string;           // 需求来源：内部需求/客户反馈/竞品分析
    userStory: string;        // 用户故事
    acceptanceCriteria: string; // 验收标准
    scope: string;            // 影响范围：全平台/仅Web端/仅API
  };

  /** Bug 详情信息（taskType="bug" 时使用） */
  bugInfo?: {
    severity: string;         // 严重程度：critical/major/minor/trivial
    frequency: string;        // 复现频率：occasional/often/always
    environment: string;      // 环境信息
    steps: string;            // 复现步骤
  };

  /** 技术债务评估（taskType="tech_debt" 时使用） */
  debt?: {
    category: string;         // 债务类别：代码坏味道/性能瓶颈/安全漏洞/技术过时
    introducedVersion: string;// 引入版本号
    affectedModules: string[];// 影响模块列表
    payoffDays: number;       // 预估还清周期（天）
  };

  /** 文档配置信息（taskType="doc" 时使用） */
  doc?: {
    docType: string;          // 文档类型：API文档/使用手册/技术方案/发布说明
    targetAudience: string[]; // 目标读者
    wordCountTarget: number;  // 字数目标
    publishChannel: string;   // 发布渠道：内部Wiki/GitHub Pages/官网
  };

  /** 改进方案信息（taskType="improvement" 时使用） */
  improvement?: {
    category: string;         // 改进方向：performance/ux/code_quality/security/process
    currentPain: string;      // 现状痛点描述
    expectedGain: string;     // 预期收益描述
    impactScope: string[];    // 影响范围列表
  };
}

// ==================== 存储单例初始化 ====================

// ---------- 会话存储 ----------

/** 内存会话存储：token -> sessionInfo */
const sessionStore = new Map<string, SessionInfo>();

// ---------- 用户存储 ----------

/** 自增 ID 计数器（用户）*/
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

// ---------- 任务存储 ----------

/**
 * 初始化预设任务数据
 *
 * 【设计说明】
 * 所有任务（预设 + 用户新建 + 拖拽变更）都存储在 taskStore 数组中，
 * 模拟后端数据库表。三个任务 Mock 接口共享此存储：
 *   - GET  /api/task/board   -> 按 status 分组返回
 *   - POST /api/task/create  -> 追加新任务
 *   - POST /api/task/update  -> 更新任务的 status 等字段
 *
 * [MOCK][WARN] 当前为纯内存实现，页面刷新后重置为初始状态。
 * 正式环境替换真实后端 API 后，数据由数据库持久化。
 */
function initPresetTasks(): StoredTask[] {
  const assigneePool = ["管理员", "张三", "李四", "王五"];
  const tagPool = ["前端开发", "后端开发", "UI设计", "数据库", "API接口", "测试验证", "文档编写"];

  /**
   * 从标签池中随机选取 1~3 个标签并排序返回
   * @param tagPool - 可选标签池数组
   * @returns 随机选取的标签子集
   */
  const pickTags = (pool: string[]): string[] => {
    const count = Random.integer(1, 3);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).sort();
  };

  return [
    /* ---------- 待处理列 (todo) ---------- */
    {
      id: 1001,
      title: "用户登录功能优化",
      description: "优化登录流程，增加验证码校验、记住密码、第三方登录等功能",
      status: "todo",
      priority: "high",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: pickTags(tagPool),
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 0,
      taskType: "feature",
      dueDate: "2026-06-15",
      estimatedHours: 16,
      complexity: 4,
      requirement: {
        source: "客户反馈",
        userStory: "作为系统管理员，我希望登录页面支持验证码和记住密码功能，以便提升安全性和使用便利性",
        acceptanceCriteria: "1. 登录失败3次后显示图形验证码 2. 勾选记住密码后7天内免登录 3. 支持微信扫码登录",
        scope: "全平台",
      },
    },
    {
      id: 1002,
      title: "首页响应速度提升",
      description: "针对首屏加载进行性能优化，包括图片懒加载、组件按需加载等",
      status: "todo",
      priority: "medium",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: pickTags(tagPool),
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 1,
      taskType: "improvement",
      dueDate: "2026-06-20",
      estimatedHours: 8,
      complexity: 3,
      improvement: {
        category: "performance",
        currentPain: "首页加载时间超过 3 秒，用户流失率较高",
        expectedGain: "首屏渲染时间降低至 1.5 秒以内，提升用户留存",
        impactScope: ["前端", "后端", "数据库"],
      },
    },
    {
      id: 1003,
      title: "移动端适配方案设计",
      description: "调研并制定移动端适配技术方案，包括响应式布局、触摸交互等",
      status: "todo",
      priority: "low",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: pickTags(tagPool),
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 2,
      taskType: "feature",
      dueDate: "2026-06-30",
      estimatedHours: 24,
      complexity: 5,
    },

    /* ---------- Bug 类型示例（含嵌套 bugInfo） ---------- */
    {
      id: 1004,
      title: "登录页样式在缩放时错乱",
      description: "浏览器窗口缩放到 50% 时，标签文字与输入框重叠",
      status: "todo",
      priority: "urgent",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: ["前端开发", "CSS"],
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 3,
      taskType: "bug",
      dueDate: "2026-05-30",
      estimatedHours: 3,
      complexity: 2,
      isUrgent: true,
      bugInfo: {
        severity: "major",
        frequency: "always",
        environment: "Chrome 120 / Windows 11, Firefox 120 / macOS",
        steps: "1. 打开登录页面 2. 按 Ctrl+减号将缩放调至 50% 3. 观察到 el-form-item label 与 input 框文字重叠",
      },
    },

    /* ---------- 进行中列 (doing) ---------- */
    {
      id: 2001,
      title: "权限管理系统开发",
      description: "实现基于角色的访问控制（RBAC），包含角色管理、权限分配、菜单动态渲染",
      status: "doing",
      priority: "urgent",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: pickTags(tagPool),
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 0,
      taskType: "feature",
      dueDate: "2026-05-31",
      estimatedHours: 40,
      complexity: 5,
      isUrgent: true,
      requirement: {
        source: "内部需求",
        userStory: "作为系统管理员，我希望能够通过角色和权限矩阵控制各功能模块的访问，以便实现最小权限原则",
        acceptanceCriteria: "1. 支持角色CRUD 2. 支持权限点分配 3. 菜单根据权限动态渲染 4. API接口级鉴权",
        scope: "全平台",
      },
    },
    {
      id: 2002,
      title: "数据导出功能实现",
      description: "支持 Excel/CSV 格式数据导出，含大数据量分批处理与进度展示",
      status: "doing",
      priority: "high",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: pickTags(tagPool),
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 1,
      taskType: "feature",
      dueDate: "2026-06-05",
      estimatedHours: 12,
      complexity: 3,
    },

    /* ---------- 已完成列 (done) ---------- */
    {
      id: 3001,
      title: "项目初始化与环境搭建",
      description: "完成项目脚手架搭建、依赖安装、ESLint/Prettier 配置、Git 工作流规范",
      status: "done",
      priority: "medium",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: ["后端开发"],
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 0,
      taskType: "tech_debt",
      estimatedHours: 4,
      complexity: 2,
      debt: {
        category: "技术过时",
        introducedVersion: "v0.1.0",
        affectedModules: ["工程化", "构建配置"],
        payoffDays: 3,
      },
    },
    {
      id: 3002,
      title: "基础布局组件开发",
      description: "实现通用布局框架：侧边栏导航、顶部面包屑、内容区域容器",
      status: "done",
      priority: "low",
      assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
      tags: ["前端开发", "UI设计"],
      createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
      orderIndex: 1,
      taskType: "feature",
      estimatedHours: 6,
      complexity: 2,
    },
  ];
}

/** 统一任务存储实例（模块加载时用预设数据初始化）*/
let taskStore: StoredTask[] = initPresetTasks();

/** 自增 ID 计数器（任务，从 10000 开始，避免与预设 ID 冲突）*/
let taskIdCounter = 10000;

// ==================== 校验工具函数 ====================

/** 用户名校验：纯小写字母 [a-z]，长度 2~18 */
function isValidUsername(username: string): boolean {
  return /^[a-z]{2,18}$/.test(username);
}

/** 昵称校验：>= 2个字符，支持中文/英文/符号 */
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

/** 管理员菜单（含系统管理入口）*/
const ADMIN_MENUS = [
  { name: "Dashboard", path: "/dashboard", component: "views/dashboard/index", redirect: null as string | null, meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false }, children: [] },
  { name: "TaskBoard", path: "/task/board", component: "views/task/board", redirect: null, meta: { title: "任务看板", icon: "GridIcon", hidden: false }, children: [] },
  { name: "System", path: "/system", component: null, redirect: "/system/user", meta: { title: "系统管理", icon: "SettingIcon", hidden: false }, children: [
    { name: "UserManage", path: "/system/user", component: "views/system/user/index", meta: { title: "用户管理", icon: "UserIcon" }, children: [] as never[] },
    { name: "AuditLog", path: "/system/log", component: "views/system/log/index", meta: { title: "审计日志", icon: "DocumentIcon" }, children: [] as never[] },
  ]},
];

/** 普通用户菜单（无系统管理入口）*/
const USER_MENUS = [
  { name: "Dashboard", path: "/dashboard", component: "views/dashboard/index", redirect: null as string | null, meta: { title: "仪表盘", icon: "DashboardIcon", hidden: false }, children: [] },
  { name: "TaskBoard", path: "/task/board", component: "views/task/board", redirect: null, meta: { title: "任务看板", icon: "GridIcon", hidden: false }, children: [] },
];

// ==================== Mock 接口定义 ====================

export default [
  // ================================================================
  //  用户相关接口（9 个）
  // ================================================================

  // ---------- 登录接口 ----------
  {
    url: "/api/login",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const username = String(body?.username ?? "");
      const password = String(body?.password ?? "");

      console.log(`[MOCK][INFO] 登录请求: username=${username}`);

      /* 参数完整性检查 */
      if (!username || !password) {
        return { code: 40001, data: null, message: "请输入用户名和密码" };
      }

      /* 在已注册用户中查找 */
      const user = findUserByUsername(username);
      if (!user) {
        console.warn(`[MOCK][WARN] 用户不存在: ${username}`);
        return { code: 40401, data: null, message: "用户不存在" };
      }

      /* 检查账号是否被禁用（被删除的用户）*/
      if (user.status === "disabled") {
        console.warn(`[MOCK][WARN] 账号已被禁用: ${username}`);
        return { code: 40301, data: null, message: "该账号已被禁用，请联系管理员" };
      }

      /* 密码校验 */
      if (user.password !== password) {
        console.warn(`[MOCK][WARN] 密码错误: ${username}`);
        return { code: 40002, data: null, message: "密码错误" };
      }

      /* 登录成功 -> 创建会话 + 返回 Token */
      const token = generateToken();
      sessionStore.set(token, {
        userId: user.id,
        username: user.username,
        token,
        createdAt: Date.now(),
      });

      console.log(`[MOCK][INFO] 登录成功: ${username} (${user.role})`);

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

  // ---------- 刷新 Token 接口 ----------
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

  // ---------- 获取当前用户信息（基础）----------
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

  // ---------- 获取用户详细信息（含菜单树）----------
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
        `[MOCK][INFO] 用户信息查询: ${user.username} (${isAdmin ? "管理员" : "普通用户"})`,
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

  // ---------- 获取用户列表（供负责人选择等场景）----------
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

      console.log(`[MOCK][INFO] 返回活跃用户列表: ${activeUsers.length} 个`);

      return { code: 0, data: activeUsers, message: "获取成功" };
    },
  } satisfies MockMethod,

  // ---------- 管理页用户列表（含禁用用户，仅管理员）----------
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

      const disabledCount = allUsers.filter((u) => u.status === "disabled").length;
      console.log(`[MOCK][INFO] 返回全部用户: ${allUsers.length} 个 (含 ${disabledCount} 个已禁用)`);

      return { code: 0, data: allUsers, message: "获取成功" };
    },
  } satisfies MockMethod,

  // ---------- 创建用户（仅管理员）----------
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

      console.log(`[MOCK][INFO] 创建用户请求: username=${username}, nickname=${nickname}`);

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

      console.log(`[MOCK][INFO] 用户创建成功: ${username} (id=${newUser.id}, 总计${userStore.length})`);

      return {
        code: 0,
        data: { id: newUser.id, username: newUser.username, nickname: newUser.nickname, role: newUser.role },
        message: "创建成功",
      };
    },
  } satisfies MockMethod,

  // ---------- 更新用户（仅管理员）----------
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

      console.log(`[MOCK][INFO] 更新用户: target=${targetUser.username}, operator=${operator.username}`);

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

      console.log(`[MOCK][INFO] 用户更新成功: ${targetUser.username} (role=${targetUser.role}, status=${targetUser.status})`);

      return {
        code: 0,
        data: { success: true, id: targetUser.id },
        message: "更新成功",
      };
    },
  } satisfies MockMethod,

  // ---------- 删除用户（仅管理员，只能删普通用户）----------
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

      console.log(`[MOCK][INFO] 删除请求: target=${targetUser.username} (${targetUser.role}), operator=${operator.username}`);

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

        console.log(`[MOCK][INFO] 用户已永久删除: ${targetUser.username} (剩余${userStore.length}个用户)`);

        return { code: 0, data: { success: true, id: targetUser.id }, message: "删除成功" };
      } else {
        /* 软删除（默认）：标记为 disabled，保留数据但禁止登录 */
        targetUser.status = "disabled";

        console.log(`[MOCK][INFO] 用户已禁用: ${targetUser.username} (不再可登录)`);

        return { code: 0, data: { success: true, id: targetUser.id }, message: "删除成功" };
      }
    },
  } satisfies MockMethod,

  // ================================================================
  //  任务相关接口（4 个）
  // ================================================================

  // ---------- 获取看板数据接口 ----------
  {
    url: "/api/task/board",
    method: "get",

    response: () => {
      console.log("[MOCK][INFO] 收到看板数据请求");

      /**
       * 从统一存储中按 status 分组，并按 orderIndex 升序排列
       * 确保：
       *   1. 跨列拖拽后 status 变更正确反映
       *   2. 同列内上下拖拽后顺序（orderIndex）持久化保留
       */
      const sortByOrder = (a: StoredTask, b: StoredTask) => a.orderIndex - b.orderIndex;

      const todoTasks = taskStore.filter((t) => t.status === "todo").sort(sortByOrder);
      const doingTasks = taskStore.filter((t) => t.status === "doing").sort(sortByOrder);
      const doneTasks = taskStore.filter((t) => t.status === "done").sort(sortByOrder);

      console.log(
        `[MOCK][INFO] 返回看板数据: todo=${todoTasks.length}, doing=${doingTasks.length}, done=${doneTasks.length} (总计${taskStore.length})`,
      );

      return {
        code: 0,
        data: [
          { id: "todo", title: "待处理", taskList: todoTasks },
          { id: "doing", title: "进行中", taskList: doingTasks },
          { id: "done", title: "已完成", taskList: doneTasks },
        ],
        message: "获取成功",
      };
    },
  } satisfies MockMethod,

  // ---------- 创建任务接口 ----------
  {
    url: "/api/task/create",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const data = body || {};

      console.log("[MOCK][INFO] 收到创建任务请求:", JSON.stringify(data));

      taskIdCounter += 1;
      const newTaskId = taskIdCounter;

      const newTask: StoredTask = {
        id: newTaskId,
        title: String(data.title || "未命名任务"),
        description: data.description as string | undefined,
        status: String(data.status || "todo"),
        priority: String(data.priority || "medium"),
        assignee: data.assignee as string | undefined,
        tags: (data.tags as string[]) || undefined,
        createdAt: new Date().toISOString(),
        orderIndex: 0,
        taskType: data.taskType as string | undefined,
        dueDate: data.dueDate as string | undefined,
        estimatedHours: data.estimatedHours as number | undefined,
        complexity: data.complexity as number | undefined,
        isUrgent: data.isUrgent as boolean | undefined,

        /* 嵌套字段：透传存储（前端 SchemaForm 路径式 field 提交的嵌套对象）*/
        requirement: data.requirement as StoredTask["requirement"] | undefined,
        bugInfo: data.bugInfo as StoredTask["bugInfo"] | undefined,
        debt: data.debt as StoredTask["debt"] | undefined,
        doc: data.doc as StoredTask["doc"] | undefined,
      };

      /* 写入统一存储（与拖拽更新共享同一数据源）*/
      taskStore.push(newTask);

      console.log(
        `[MOCK][INFO] 任务已创建: id=${newTaskId}, title="${newTask.title}", status=${newTask.status} (总计${taskStore.length})`,
      );

      return { code: 0, data: newTask, message: "创建成功" };
    },
  } satisfies MockMethod,

  // ---------- 更新任务接口（拖拽/编辑通用）----------
  {
    url: "/api/task/update",
    method: "post",

    /**
     * 统一任务更新处理
     * 支持两种场景：
     *   1. 拖拽移动：{ taskId, newStatus, newIndex } -- 更新 status 字段
     *   2. 编辑任务：{ taskId, title, description, ... } -- 更新任意字段
     *
     * 所有变更直接写入 taskStore 统一存储，下次 GET /api/task/board 即可获取最新数据
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const taskId = body?.taskId;
      const newStatus = body?.newStatus;

      console.log(
        `[MOCK][INFO] 收到任务更新请求: taskId=${taskId}, newStatus=${newStatus}`,
      );

      /* 失败测试模式 */
      if (taskId === "fail_test") {
        return { code: 50001, data: null, message: "模拟接口失败" };
      }

      if (taskId === undefined || taskId === null) {
        return { code: 40001, data: null, message: "缺少任务 ID" };
      }

      const taskIndex = taskStore.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) {
        return { code: 40401, data: null, message: `任务不存在` };
      }

      const oldStatus = taskStore[taskIndex].status;

      /* 更新 status（跨列拖拽场景）*/
      if (newStatus !== undefined && newStatus !== null) {
        taskStore[taskIndex].status = String(newStatus);
      }

      /**
       * 列内排序重排（仅拖拽场景触发）
       *
       * 【设计要点】
       * - 拖拽场景：前端会传 newStatus（跨列）或 newIndex（同列），需要重排 orderIndex
       * - 编辑场景：只传字段值（title/description 等），不触发布局变更，跳过重排
       *
       * 判定条件：请求中包含 newStatus 或 newIndex 时才进入排序逻辑
       */
      const isDragOperation = newStatus !== undefined && newStatus !== null
        || body?.newIndex !== undefined;

      if (isDragOperation) {
        const targetStatus = taskStore[taskIndex].status;
        const columnTasks = taskStore.filter((t) => t.status === targetStatus);

        /** 按 orderIndex 排序获取当前 Mock 认为的正确顺序 */
        const sortedColumn = [...columnTasks].sort((a, b) => a.orderIndex - b.orderIndex);

        /** 找到被移动任务在排序后数组中的位置 */
        const movedIndexInSorted = sortedColumn.findIndex((t) => t.id === taskId);

        if (movedIndexInSorted !== -1) {
          /** 从排序数组中取出被移动的任务 */
          const [movedTask] = sortedColumn.splice(movedIndexInSorted, 1);

          /**
           * 确定插入位置
           * 跨列场景：newIndex 来自 evt.newIndex（VueDraggable 提供的目标位置）
           * 同列场景：同样使用 evt.newIndex
           * 未传 newIndex 时默认插到末尾
           */
          const insertIdx = Math.min(
            Number(body?.newIndex ?? sortedColumn.length),
            sortedColumn.length,
          );
          sortedColumn.splice(insertIdx, 0, movedTask);

          /** 将排列后的顺序写回 taskStore：重新分配 orderIndex */
          sortedColumn.forEach((t, idx) => {
            const storeIdx = taskStore.findIndex((st) => st.id === t.id);
            if (storeIdx !== -1) {
              taskStore[storeIdx].orderIndex = idx;
            }
          });

          console.log(
            `[MOCK][INFO] 拖拽重排完成: 列[${targetStatus}] 共 ${columnTasks.length} 个任务`,
          );
        }
      }

      /* 支持其他字段的增量更新（含嵌套对象整体替换）*/
      if (body?.title !== undefined) taskStore[taskIndex].title = String(body.title);
      if (body?.priority !== undefined) taskStore[taskIndex].priority = String(body.priority);
      if (body?.assignee !== undefined) taskStore[taskIndex].assignee = body.assignee as string | undefined;
      if (body?.tags !== undefined) taskStore[taskIndex].tags = body.tags as string[] | undefined;
      if (body?.description !== undefined) taskStore[taskIndex].description = body.description as string | undefined;
      if (body?.taskType !== undefined) taskStore[taskIndex].taskType = body.taskType as string | undefined;
      if (body?.dueDate !== undefined) taskStore[taskIndex].dueDate = body.dueDate as string | undefined;
      if (body?.estimatedHours !== undefined) taskStore[taskIndex].estimatedHours = body.estimatedHours as number | undefined;
      if (body?.complexity !== undefined) taskStore[taskIndex].complexity = body.complexity as number | undefined;
      if (body?.isUrgent !== undefined) taskStore[taskIndex].isUrgent = body.isUrgent as boolean | undefined;

      /* 嵌套对象整体替换更新 */
      if (body?.requirement !== undefined) taskStore[taskIndex].requirement = body.requirement as StoredTask["requirement"] | undefined;
      if (body?.bugInfo !== undefined) taskStore[taskIndex].bugInfo = body.bugInfo as StoredTask["bugInfo"] | undefined;
      if (body?.debt !== undefined) taskStore[taskIndex].debt = body.debt as StoredTask["debt"] | undefined;
      if (body?.doc !== undefined) taskStore[taskIndex].doc = body.doc as StoredTask["doc"] | undefined;

      const finalStatus = taskStore[taskIndex].status;
      console.log(
        `[MOCK][INFO] 任务已更新: id=${taskId}` +
        (isDragOperation ? `, status: ${oldStatus} -> ${finalStatus}, 列 [${finalStatus}] 已重排` : ", 字段已更新"),
      );

      return { code: 0, data: { success: true, taskId }, message: "更新成功" };
    },
  } satisfies MockMethod,

  // ---------- 删除任务接口 ----------
  {
    url: "/api/task/delete",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const taskId = body?.taskId;

      console.log(`[MOCK][INFO] 收到删除任务请求: taskId=${taskId}`);

      if (taskId === undefined || taskId === null) {
        return { code: 40001, data: null, message: "缺少任务 ID 参数" };
      }

      const taskIndex = taskStore.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        return { code: 40401, data: null, message: `任务不存在: ${taskId}` };
      }

      const removed = taskStore.splice(taskIndex, 1)[0];

      console.log(`[MOCK][INFO] 任务已删除: id=${removed.id}, title="${removed.title}" (剩余${taskStore.length})`);

      return { code: 0, data: { success: true, taskId }, message: "删除成功" };
    },
  } satisfies MockMethod,

  // ================================================================
  //  审计日志相关接口（2 个）
  // ================================================================

  /**
   * @mock 记录审计日志
   * 接收前端上报的日志数据，打印到控制台并返回成功
   *
   * 正式对接后端时：替换为真实 HTTP 请求到后端日志采集服务
   */
  {
    url: "/api/system/log/add",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      console.log(
        `[MOCK] [INFO] 收到审计日志记录:`,
        JSON.stringify(body).substring(0, 300),
      );
      return { code: 0, data: null, message: "日志记录成功" };
    },
  } satisfies MockMethod,

  /**
   * @mock 获取审计日志列表
   * 支持分页和多维度筛选，返回模拟的审计日志数据
   *
   * 正式对接后端时：替换为真实后端分页查询接口
   */
  {
    url: "/api/system/log/list",
    method: "get",

    response: ({ query }: { query?: Record<string, string> }) => {
      const page = Number(query?.page ?? "1");
      const pageSize = Number(query?.pageSize ?? "20");
      const module = query?.module;
      const action = query?.action;
      const username = query?.username;
      const status = query?.status;
      const startTime = query?.startTime;
      const endTime = query?.endTime;

      /* 预设模拟审计日志数据（覆盖过去 7 天的各种操作场景）*/
      const presetLogs = [
        {
          id: "log_001",
          userId: 100,
          username: "admin",
          module: "auth" as const,
          action: "login" as const,
          method: "POST",
          url: "/api/login",
          params: { username: "admin", password: "******" },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 145,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -7, "2026-05-28"),
        },
        {
          id: "log_002",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "用户登录功能优化",
            description: "优化登录流程，增加验证码校验",
            taskType: "feature",
            priority: "high",
            assignee: "管理员",
            status: "todo",
            tags: ["前端开发", "UI设计"],
            dueDate: "2026-06-15",
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 89,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -6, "2026-05-28"),
        },
        {
          id: "log_003",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "update" as const,
          method: "POST",
          url: "/api/task/update",
          params: {
            taskId: 2001,
            newStatus: "done",
            newIndex: 1,
            title: "权限管理系统开发",
            accessToken: "******",
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 67,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -6, "2026-05-28"),
        },
        {
          id: "log_004",
          userId: 100,
          username: "admin",
          module: "user" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/user/create",
          params: {
            username: "zhaoliu",
            nickname: "赵六",
            role: "user",
            password: "******",
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 52,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -5, "2026-05-28"),
        },
        {
          id: "log_005",
          userId: 101,
          username: "zhangsan",
          module: "auth" as const,
          action: "login" as const,
          method: "POST",
          url: "/api/login",
          params: { username: "zhangsan", password: "******" },
          ip: "192.168.1.105",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          status: "success" as const,
          duration: 98,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -5, "2026-05-28"),
        },
        {
          id: "log_006",
          userId: 101,
          username: "zhangsan",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "移动端适配方案设计",
            description: "响应式布局 + 触摸交互优化",
            priority: "medium",
            assignee: "张三",
          },
          ip: "192.168.1.105",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          status: "success" as const,
          duration: 76,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -4, "2026-05-28"),
        },
        {
          id: "log_007",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "delete" as const,
          method: "POST",
          url: "/api/task/delete",
          params: { taskId: 1999, hardDelete: false },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 34,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -4, "2026-05-28"),
        },
        {
          id: "log_008",
          userId: 102,
          username: "lisi",
          module: "auth" as const,
          action: "login" as const,
          method: "POST",
          url: "/api/login",
          params: { username: "lisi", password: "******" },
          ip: "10.0.0.42",
          userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0",
          status: "success" as const,
          duration: 112,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -3, "2026-05-28"),
        },
        {
          id: "log_009",
          userId: 100,
          username: "admin",
          module: "user" as const,
          action: "update" as const,
          method: "POST",
          url: "/api/user/update",
          params: {
            id: 101,
            newNickname: "张三（已激活）",
            newRole: "admin",
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 45,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -3, "2026-05-28"),
        },
        {
          id: "log_010",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "首页响应速度提升",
            description: "减少首屏加载时间至 2s 以内",
            taskType: "optimization",
            priority: "high",
            assignee: "李四",
            tags: ["性能优化"],
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 61,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -2, "2026-05-28"),
        },
        {
          id: "log_011",
          userId: 101,
          username: "zhangsan",
          module: "task" as const,
          action: "update" as const,
          method: "POST",
          url: "/api/task/update",
          params: {
            taskId: 2003,
            newStatus: "inProgress",
            newIndex: 1,
          },
          ip: "192.168.1.105",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          status: "success" as const,
          duration: 55,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -2, "2026-05-28"),
        },
        {
          id: "log_012",
          userId: 103,
          username: "wangwu",
          module: "auth" as const,
          action: "login" as const,
          method: "POST",
          url: "/api/login",
          params: { username: "wangwu", password: "******" },
          ip: "172.16.0.88",
          userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
          status: "success" as const,
          duration: 203,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -2, "2026-05-28"),
        },
        {
          id: "log_013",
          userId: 100,
          username: "admin",
          module: "user" as const,
          action: "delete" as const,
          method: "POST",
          url: "/api/user/delete",
          params: { id: 999, hardDelete: true },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 38,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -1, "2026-05-28"),
        },
        {
          id: "log_014",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "update" as const,
          method: "POST",
          url: "/api/task/update",
          params: {
            taskId: 2005,
            newPriority: "urgent",
            isUrgent: true,
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 41,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -1, "2026-05-28"),
        },
        {
          id: "log_015",
          userId: 101,
          username: "zhangsan",
          module: "task" as const,
          action: "delete" as const,
          method: "POST",
          url: "/api/task/delete",
          params: { taskId: 1988, hardDelete: false },
          ip: "192.168.1.105",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          status: "success" as const,
          duration: 29,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", -1, "2026-05-28"),
        },
        {
          id: "log_016",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "数据导出功能实现",
            description: "支持 Excel / CSV 格式导出任务报表",
            taskType: "feature",
            priority: "medium",
            assignee: "王五",
            tags: ["后端开发", "报表"],
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 72,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
        {
          id: "log_017",
          userId: 100,
          username: "admin",
          module: "auth" as const,
          action: "logout" as const,
          method: "GET",
          url: "/api/logout",
          params: {},
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 15,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
        {
          id: "log_018",
          userId: 102,
          username: "lisi",
          module: "auth" as const,
          action: "logout" as const,
          method: "GET",
          url: "/api/logout",
          params: {},
          ip: "10.0.0.42",
          userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0",
          status: "success" as const,
          duration: 18,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
        {
          id: "log_019",
          userId: 100,
          username: "admin",
          module: "user" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/user/create",
          params: {
            username: "sunqi",
            nickname: "孙七",
            role: "viewer",
            password: "******",
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 48,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
        {
          id: "log_020",
          userId: 100,
          username: "admin",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "项目初始化与环境搭建",
            description: "Vite + Vue3 + TypeScript + Pinia 技术栈配置",
            taskType: "feature",
            priority: "low",
            assignee: "管理员",
            tags: ["工程化", "基础设施"],
          },
          ip: "127.0.0.1",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          status: "success" as const,
          duration: 93,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
        {
          id: "log_021",
          userId: 101,
          username: "zhangsan",
          module: "task" as const,
          action: "create" as const,
          method: "POST",
          url: "/api/task/create",
          params: {
            title: "",
            password: "******",
          },
          ip: "192.168.1.105",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          status: "fail" as const,
          duration: 23,
          createTime: Random.datetime("yyyy-MM-dd HH:mm:ss", 0, "2026-05-28"),
        },
      ];

      /* 从 localStorage 读取真实日志（与预设数据合并）*/
      let allLogs = [...presetLogs];
      try {
        const storedRaw = localStorage.getItem("wf_audit_logs");
        if (storedRaw) {
          const stored = JSON.parse(storedRaw);
          if (Array.isArray(stored)) {
            allLogs = [...stored, ...presetLogs];
          }
        }
      } catch (_e) {
        console.warn("[MOCK] [WARN] 读取 localStorage 审计日志失败，仅返回预设数据");
      }

      /* 按时间倒序排列 */
      allLogs.sort(
        (a, b) =>
          new Date(b.createTime).getTime() - new Date(a.createTime).getTime(),
      );

      /* 应用筛选条件 */
      if (module && module !== "") {
        allLogs = allLogs.filter((l) => l.module === module);
      }
      if (action && action !== "") {
        allLogs = allLogs.filter((l) => l.action === action);
      }
      if (username && username !== "") {
        const kw = username.toLowerCase();
        allLogs = allLogs.filter((l) =>
          l.username.toLowerCase().includes(kw),
        );
      }
      if (status && status !== "") {
        allLogs = allLogs.filter((l) => l.status === status);
      }
      if (startTime) {
        const start = new Date(startTime).getTime();
        allLogs = allLogs.filter(
          (l) => new Date(l.createTime).getTime() >= start,
        );
      }
      if (endTime) {
        const end = new Date(endTime).getTime();
        allLogs = allLogs.filter(
          (l) => new Date(l.createTime).getTime() <= end,
        );
      }

      /* 分页计算 */
      const total = allLogs.length;
      const startIdx = (page - 1) * pageSize;
      const list = allLogs.slice(startIdx, startIdx + pageSize);

      console.log(
        `[MOCK] [INFO] 日志列表查询: page=${page}, pageSize=${pageSize}, 筛选后总数=${total}`,
      );

      return {
        code: 0,
        data: { list, total, page, pageSize },
        message: "查询成功",
      };
    },
  } satisfies MockMethod,
];
