/**
 * 看板任务相关 Mock 接口
 * 模拟看板数据获取与任务状态更新功能
 *
 * @mock 本文件为 Mock 数据定义文件
 * 未来替换方式：
 *   1. 删除本文件或将其移至归档目录
 *   2. 在 vite.config.ts 中移除 viteMockServe 插件配置
 *   3. 确保 src/api/modules/task.ts 中的接口地址指向真实后端
 *   4. 取消 api 文件中被注释的真实 Axios 请求代码
 */

import type { MockMethod } from "vite-plugin-mock";
import Mock from "mockjs";

// ==================== 工具常量 ====================

/** Mock 使用的随机库前缀（MockJS 的 Random 对象） */
const { Random } = Mock;

// ==================== 统一任务存储（模块级单例）====================

/**
 * 任务接口定义（统一存储格式）
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
}

/**
 * 统一任务内存存储
 *
 * 【设计说明】
 * 所有任务（预设 + 用户新建 + 拖拽变更）都存储在此数组中，
 * 模拟后端数据库表。三个 Mock 接口共享此存储：
 *   - GET  /api/task/board   → 按 status 分组返回
 *   - POST /api/task/create  → 追加新任务
 *   - POST /api/task/update  → 更新任务的 status 等字段
 *
 * ⚠️ 当前为纯内存实现，页面刷新后重置为初始状态。
 * 正式环境替换真实后端 API 后，数据由数据库持久化。
 */

/** 初始化预设任务数据 */
function initPresetTasks(): StoredTask[] {
  const assigneePool = ["管理员", "张三", "李四", "王五"];
  const tagPool = ["前端开发", "后端开发", "UI设计", "数据库", "API接口", "测试验证", "文档编写"];

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

/** 自增 ID 计数器（从 10000 开始，避免与预设 ID 冲突）*/
let taskIdCounter = 10000;

// ==================== Mock 接口定义 ====================

export default [
  // ==================== 获取看板数据接口 ====================
  {
    url: "/api/task/board",
    method: "get",

    response: () => {
      console.log("[mock] 收到看板数据请求");

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
        `[mock] ✅ 返回看板数据: todo=${todoTasks.length}, doing=${doingTasks.length}, done=${doneTasks.length} (总计${taskStore.length})`,
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

  // ==================== 创建任务接口 ====================
  {
    url: "/api/task/create",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const data = body || {};

      console.log("[mock] 收到创建任务请求:", JSON.stringify(data));

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
      };

      /* 写入统一存储（与拖拽更新共享同一数据源）*/
      taskStore.push(newTask);

      console.log(
        `[mock] ✅ 任务已创建: id=${newTaskId}, title="${newTask.title}", status=${newTask.status} (总计${taskStore.length})`,
      );

      return { code: 0, data: newTask, message: "创建成功" };
    },
  } satisfies MockMethod,

  // ==================== 更新任务接口（拖拽/编辑通用）====================
  {
    url: "/api/task/update",
    method: "post",

    /**
     * 统一任务更新处理
     * 支持两种场景：
     *   1. 拖拽移动：{ taskId, newStatus, newIndex } — 更新 status 字段
     *   2. 编辑任务：{ taskId, title, description, ... } — 更新任意字段
     *
     * 所有变更直接写入 taskStore 统一存储，下次 GET /api/task/board 即可获取最新数据
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const taskId = body?.taskId;
      const newStatus = body?.newStatus;

      console.log(
        `[mock] 收到任务更新请求: taskId=${taskId}, newStatus=${newStatus}`,
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
            `[mock] 🔄 拖拽重排完成: 列[${targetStatus}] 共 ${columnTasks.length} 个任务`,
          );
        }
      }

      /* 支持其他字段的增量更新 */
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

      console.log(
        `[mock] ✅ 任务已更新: id=${taskId}` +
        (isDragOperation ? `, status: ${oldStatus} → ${targetStatus}, 列 [${targetStatus}] 已重排` : ", 字段已更新"),
      );

      return { code: 0, data: { success: true, taskId }, message: "更新成功" };
    },
  } satisfies MockMethod,

  // ==================== 删除任务接口 ====================
  {
    url: "/api/task/delete",
    method: "post",

    response: ({ body }: { body?: Record<string, unknown> }) => {
      const taskId = body?.taskId;

      console.log(`[mock] 收到删除任务请求: taskId=${taskId}`);

      if (taskId === undefined || taskId === null) {
        return { code: 40001, data: null, message: "缺少任务 ID 参数" };
      }

      const taskIndex = taskStore.findIndex((t) => t.id === taskId);

      if (taskIndex === -1) {
        return { code: 40401, data: null, message: `任务不存在: ${taskId}` };
      }

      const removed = taskStore.splice(taskIndex, 1)[0];

      console.log(`[mock] ✅ 任务已删除: id=${removed.id}, title="${removed.title}" (剩余${taskStore.length})`);

      return { code: 0, data: { success: true, taskId }, message: "删除成功" };
    },
  } satisfies MockMethod,
];
