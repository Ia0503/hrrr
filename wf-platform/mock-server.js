/**
 * Mock WebSocket 服务器 - 本地开发测试用
 *
 * 用途：
 *   本项目为纯前端项目，无后端服务。此脚本提供一个模拟的实时服务器，
 *   向已连接的客户端推送虚假的任务更新数据，用于开发阶段测试 WebSocket 实时通信功能。
 *
 * 使用方式：
 *   1. 安装依赖：npm install socket.io --save-dev
 *   2. 启动服务器：node mock-server.js
 *   3. 配合前端开发服务器使用：npm run dev（Vite 默认端口 5173）
 *
 * 注意事项：
 *   - 此服务器监听端口 3100，与 Vite 开发服务器（5173）分离
 *   - 仅用于本地开发环境，请勿用于生产环境
 *   - 所有数据均为模拟生成的假数据，不涉及真实业务逻辑
 */

const { Server } = require("socket.io");

// ==================== 服务器配置 ====================

const PORT = 3100; // WS 服务器端口（与 Vite 开发服务器 5173 区分）

const io = new Server(PORT, {
  cors: { origin: "*" }, // 开发模式允许所有来源跨域访问
});

// ==================== 模拟数据池 ====================

// 预定义任务池（ID 与 src/mock/task.ts 中的 mock API 响应保持一致）
const TASK_POOL = [
  { id: 1001, title: "用户登录功能优化", status: "todo" },
  { id: 1002, title: "首页响应速度提升", status: "todo" },
  { id: 1003, title: "移动端适配方案设计", status: "todo" },
  { id: 2001, title: "权限管理系统开发", status: "doing" },
  { id: 2002, title: "数据导出功能实现", status: "doing" },
  { id: 3001, title: "项目初始化与环境搭建", status: "done" },
  { id: 3002, title: "基础布局组件开发", status: "done" },
];

// 新任务的递增 ID 起始值
let nextNewTaskId = 9001;

// 任务状态枚举
const STATUSES = ["todo", "doing", "done"];

// 任务优先级枚举
const PRIORITIES = ["low", "medium", "high", "urgent"];

// 模拟负责人列表
const ASSIGNEES = ["张三", "李四", "王五", "赵六", "钱七"];

// 新建任务标题候选列表
const NEW_TASK_TITLES = [
  "紧急Bug修复",
  "代码审查任务",
  "文档编写",
  "性能优化专项",
  "安全漏洞修复",
];

// ==================== 工具函数 ====================

/**
 * 生成唯一事件 ID
 * 格式：evt_时间戳_随机字符串
 * @returns {string} 唯一的事件标识符
 */
function generateEventId() {
  return (
    "evt_" +
    Date.now() +
    "_" +
    Math.random().toString(36).substr(2, 9)
  );
}

/**
 * 构造标准的 SocketPayload 数据包
 * 匹配前端定义的 SocketPayload 接口结构
 * @param {string} eventType - 事件类型（如 task:updated, task:created 等）
 * @param {object} taskData - 任务数据对象
 * @returns {object} 标准化的 SocketPayload 对象
 */
function buildPayload(eventType, taskData) {
  return {
    eventId: generateEventId(),
    timestamp: new Date().toISOString(),
    sender: {
      userId: 999,
      username: "模拟用户_自动化",
    },
    data: taskData,
  };
}

/**
 * 加权随机选择器
 * 根据权重数组随机返回对应选项的索引
 * @param {number[]} weights - 权重数组，每个元素代表对应选项的被选中概率权重
 * @returns {number} 被选中的选项索引
 */
function weightedRandom(weights) {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < weights.length; i++) {
    random -= weights[i];
    if (random <= 0) return i;
  }

  return weights.length - 1;
}

/**
 * 从数组中随机选取一个元素
 * @param {Array} arr - 源数组
 * @returns {*} 随机选取的元素
 */
function randomPick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ==================== 模拟动作生成器 ====================

/**
 * 动作1：模拟其他用户拖拽任务，更新任务状态
 * 随机选择一个已有任务，将其状态切换到另一个状态
 * @returns {{eventType: string, payload: object}} 事件类型和数据负载
 */
function simulateDragUpdate() {
  // 从任务池中随机选择一个任务
  const task = randomPick(TASK_POOL);

  // 获取当前状态索引，并随机切换到一个不同的状态
  const currentStatusIndex = STATUSES.indexOf(task.status);
  let newStatusIndex;
  do {
    newStatusIndex = Math.floor(Math.random() * STATUSES.length);
  } while (newStatusIndex === currentStatusIndex);

  // 更新任务池中该任务的状态（保持数据一致性）
  task.status = STATUSES[newStatusIndex];

  console.log(
    `[mock-ws-server]   ↳ 拖拽模拟: 任务#${task.id} "${task.title}" → ${task.status}`
  );

  return {
    eventType: "task:updated",
    payload: buildPayload("task:updated", {
      id: task.id,
      title: task.title,
      status: task.status,
      action: "drag", // 标识此次更新为拖拽操作
    }),
  };
}

/**
 * 动作2：模拟用户编辑任务字段（标题或优先级）
 * 随机选择一个已有任务，修改其标题或优先级属性
 * @returns {{eventType: string, payload: object}} 事件类型和数据负载
 */
function simulateFieldEdit() {
  // 从任务池中随机选择一个任务
  const task = randomPick(TASK_POOL);

  // 随机决定是修改标题还是优先级
  if (Math.random() < 0.5) {
    // 修改标题：在原标题后追加时间戳以示区分
    const newTitle = `${task.title} (已编辑_${Date.now().toString(36)})`;
    task.title = newTitle;

    console.log(
      `[mock-ws-server]   ↳ 编辑模拟: 任务#${task.id} 标题已更新`
    );

    return {
      eventType: "task:updated",
      payload: buildPayload("task:updated", {
        id: task.id,
        title: newTitle,
        status: task.status,
        action: "edit:title", // 标识此次更新为标题编辑
      }),
    };
  } else {
    // 修改优先级
    const newPriority = randomPick(PRIORITIES);

    console.log(
      `[mock-ws-server]   ↳ 编辑模拟: 任务#${task.id} 优先级 → ${newPriority}`
    );

    return {
      eventType: "task:updated",
      payload: buildPayload("task:updated", {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: newPriority,
        action: "edit:priority", // 标识此次更新为优先级编辑
      }),
    };
  }
}

/**
 * 动作3：模拟新建任务
 * 创建一个全新的任务并添加到待办列（todo）
 * @returns {{eventType: string, payload: object}} 事件类型和数据负载
 */
function simulateTaskCreate() {
  // 使用递增 ID 生成新任务
  const newTaskId = nextNewTaskId++;

  // 随机选择标题和负责人
  const title = randomPick(NEW_TASK_TITLES);
  const assignee = randomPick(ASSIGNEES);
  const priority = randomPick(PRIORITIES);

  // 构造新任务对象
  const newTask = {
    id: newTaskId,
    title: `${title} #${newTaskId}`,
    status: "todo", // 新任务默认放入待办列
    priority: priority,
    assignee: assignee,
  };

  // 将新任务加入任务池（后续可被其他动作引用）
  TASK_POOL.push(newTask);

  console.log(
    `[mock-ws-server]   ↳ 新建模拟: 任务#${newTask.id} "${newTask.title}" 已添加`
  );

  return {
    eventType: "task:created",
    payload: buildPayload("task:created", newTask),
  };
}

/**
 * 动作4：模拟删除任务
 * 从任务池中随机移除一个任务
 * @returns {{eventType: string, payload: object}|null} 事件类型和数据负载，若任务池不足则返回 null
 */
function simulateTaskDelete() {
  // 确保任务池有足够任务可删除（保留至少3个基础任务）
  if (TASK_POOL.length <= 3) {
    console.log(`[mock-ws-server]   ↳ 删除跳过: 任务池不足，当前仅 ${TASK_POOL.length} 个`);
    return null;
  }

  // 随机选择要删除的任务索引
  const deleteIndex = Math.floor(Math.random() * TASK_POOL.length);
  const deletedTask = TASK_POOL.splice(deleteIndex, 1)[0];

  console.log(
    `[mock-ws-server]   ↳ 删除模拟: 任务#${deletedTask.id} "${deletedTask.title}" 已移除`
  );

  return {
    eventType: "task:deleted",
    payload: buildPayload("task:deleted", {
      id: deletedTask.id,
    }),
  };
}

// ==================== 事件广播调度器 ====================

/**
 * 为单个客户端连接启动定时广播任务
 * 每 5 秒触发一次模拟事件，向所有连接的客户端广播
 * @param {import("socket.io").Socket} socket - 当前客户端的 socket 实例
 */
function startBroadcastLoop(socket) {
  // 定义各动作的权重分布（总和为 100）
  // [拖拽更新, 字段编辑, 新建任务, 删除任务]
  const ACTION_WEIGHTS = [40, 30, 20, 10];

  // 动作生成函数映射表（按权重顺序排列）
  const ACTION_GENERATORS = [
    simulateDragUpdate,
    simulateFieldEdit,
    simulateTaskCreate,
    simulateTaskDelete,
  ];

  // 定时器间隔：5 秒
  const INTERVAL_MS = 5000;

  const intervalId = setInterval(() => {
    // 根据加权随机选择本次执行的动作
    const actionIndex = weightedRandom(ACTION_WEIGHTS);
    const generatorFn = ACTION_GENERATORS[actionIndex];

    // 执行选中的动作生成函数，获取事件数据
    const result = generatorFn();

    // 若返回 null（如删除时任务池不足），跳过本次广播
    if (!result) return;

    const { eventType, payload } = result;

    // 向所有已连接客户端广播事件（不仅限于触发该事件的客户端）
    io.emit(eventType, payload);

    // 记录广播日志
    console.log(
      `[mock-ws-server] 📤 广播: ${eventType} → ${io.engine.clientsCount} 个客户端`
    );
  }, INTERVAL_MS);

  // 将定时器 ID 存储到 socket 实例上，便于断开连接时清理
  socket.broadcastInterval = intervalId;

  console.log(
    `[mock-ws-server] ⏱️  已为客户端 ${socket.id} 启动广播循环 (间隔: ${INTERVAL_MS / 1000}s)`
  );
}

// ==================== 连接与鉴权处理 ====================

// 监听客户端连接事件
io.on("connection", (socket) => {
  // 输出连接日志，包含客户端 ID 和当前在线总数
  console.log(
    `[mock-ws-server] 客户端已连接: ${socket.id}，当前在线: ${io.engine.clientsCount}`
  );

  // ========== 鉴权模拟 ==========
  // 从握手信息中获取客户端传递的 token
  const token = socket.handshake.auth.token;

  // 记录 token 前缀（仅显示前12位，避免泄露完整 token）
  console.log(
    `[mock-ws-server] 鉴权 Token: ${token ? token.substring(0, 12) + "..." : "(空)"}`
  );

  // 校验规则：非空 token 即视为有效，空 token 直接拒绝连接
  if (!token || token.trim().length === 0) {
    console.warn(`[mock-ws-server] ⚠️  拒绝无 Token 的连接请求: ${socket.id}`);
    socket.disconnect(true); // true 表示关闭底层传输连接
    return;
  }

  // ========== 发送欢迎消息 ==========
  // 立即向刚连接的客户端发送确认消息
  socket.emit("connection:ack", {
    serverTime: new Date().toISOString(),
    message: "Mock WS Server 已连接",
  });

  // ========== 启动模拟广播 ==========
  // 为该客户端启动定时广播循环
  startBroadcastLoop(socket);

  // ========== 监听断开连接事件 ==========
  socket.on("disconnect", (reason) => {
    // 清理该客户端关联的广播定时器
    if (socket.broadcastInterval) {
      clearInterval(socket.broadcastInterval);
      console.log(
        `[mock-ws-server] ⏹️  已清理客户端 ${socket.id} 的广播定时器`
      );
    }

    // 输出断开日志，包含断开原因和剩余在线数
    console.log(
      `[mock-ws-server] 客户端断开: ${socket.id} (原因: ${reason})，剩余在线: ${io.engine.clientsCount}`
    );
  });
});

// ==================== 优雅关闭处理 ====================

/**
 * 优雅关闭服务器
 * 监听进程终止信号（SIGINT / SIGTERM），在关闭前清理资源
 */
function gracefulShutdown(signal) {
  console.log(`\n[mock-ws-server] 收到 ${signal} 信号，正在关闭服务器...`);

  // 关闭所有客户端连接并停止接受新连接
  io.close(() => {
    console.log("[mock-ws-server] ✅ 所有连接已关闭，服务器已停止");
    process.exit(0); // 正常退出进程
  });

  // 设置强制退出超时（防止 io.close 卡死）
  setTimeout(() => {
    console.warn("[mock-ws-server] ⚠️  强制退出：关闭超时");
    process.exit(1);
  }, 5000); // 5秒超时保护
}

// 注册信号监听器
process.on("SIGINT", () => gracefulShutdown("SIGINT")); // Ctrl+C 触发
process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // kill 命令触发

// ==================== 服务器启动日志 ====================
console.log("[mock-ws-server] ✅ Mock WebSocket 服务器已启动");
console.log(`[mock-ws-server] 监听端口: ${PORT}`);
console.log(`[mock-ws-server] 访问地址: ws://localhost:${PORT}`);
console.log("[mock-ws-server] 按 Ctrl+C 停止服务器");
