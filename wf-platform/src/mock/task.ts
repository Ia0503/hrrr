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

// ==================== 动态任务存储（模块级单例）====================

/**
 * 用户通过表单新建的任务列表（内存持久化，刷新后清空）
 *
 * 【设计说明】
 * 模拟后端数据库的临时存储。每次用户通过 SchemaForm 提交新任务时，
 * POST /api/task/create 接口将任务写入此数组；
 * GET /api/task/board 接口返回看板数据时会将此数组合并到对应列中。
 *
 * ⚠️ 当前为纯内存实现，页面刷新后数据丢失。
 * 正式环境替换真实后端 API 后，数据由数据库持久化，不存在此限制。
 */
const createdTasks: Array<{
  id: string | number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assignee?: string;
  tags?: string[];
  createdAt: string;
  orderIndex: number;
}> = [];

/** 自增 ID 计数器（用于生成唯一 ID） */
let taskIdCounter = 10000;

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
  // ==================== 获取看板数据接口 ====================
  {
    /**
     * @mock 模拟获取看板数据接口
     *
     * 替换说明：
     *   正式环境需实现真实后端 API，返回相同的数据结构
     *   后端应返回 BoardColumn[] 格式的看板列数据，每列包含任务列表
     */
    url: "/api/task/board",
    method: "get",

    /**
     * 获取看板数据 Mock 处理函数
     * 返回三列看板数据：待处理、进行中、已完成
     *
     * @returns Mock 响应数据，包含三列看板及其任务列表
     */
    response: () => {
      console.log("[mock/task-board] 收到看板数据请求");

      /** 预设的负责人姓名池（可自定义） */
      const assigneePool = ["张三", "李四", "王五", "赵六", "钱七"];

      /** 预设的标签池（分类标签，不与优先级/状态重叠） */
      const tagPool = ["前端开发", "后端开发", "UI设计", "数据库", "API接口", "测试验证", "文档编写"];

      /**
       * 从标签池中随机选取 1-3 个**不重复**标签
       *
       * @param pool - 可选标签数组
       * @returns 随机选取的去重标签数组
       */
      const pickTags = (pool: string[]): string[] => {
        const count = Random.integer(1, 3);
        /* 打乱数组后取前 count 个，确保不重复 */
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count).sort();
      };

      /** 待处理列（todo）的任务数据 */
      const todoTasks = [
        {
          id: 1001,
          title: "用户登录功能优化",
          description:
            "优化登录流程，增加验证码校验、记住密码、第三方登录等功能",
          status: "todo" as const,
          priority: "high" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: pickTags(tagPool),
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 0,
        },
        {
          id: 1002,
          title: "首页响应速度提升",
          description:
            "针对首屏加载进行性能优化，包括图片懒加载、组件按需加载等",
          status: "todo" as const,
          priority: "medium" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: pickTags(tagPool),
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 1,
        },
        {
          id: 1003,
          title: "移动端适配方案设计",
          description:
            "调研并制定移动端适配技术方案，包括响应式布局、触摸交互等",
          status: "todo" as const,
          priority: "low" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: pickTags(tagPool),
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 2,
        },
      ];

      /** 进行中列（doing）的任务数据 */
      const doingTasks = [
        {
          id: 2001,
          title: "权限管理系统开发",
          description:
            "实现基于角色的访问控制（RBAC），包含角色管理、权限分配、菜单动态渲染",
          status: "doing" as const,
          priority: "urgent" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: pickTags(tagPool),
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 0,
        },
        {
          id: 2002,
          title: "数据导出功能实现",
          description:
            "支持 Excel/CSV 格式数据导出，含大数据量分批处理与进度展示",
          status: "doing" as const,
          priority: "high" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: pickTags(tagPool),
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 1,
        },
      ];

      /** 已完成列（done）的任务数据 */
      const doneTasks = [
        {
          id: 3001,
          title: "项目初始化与环境搭建",
          description:
            "完成项目脚手架搭建、依赖安装、ESLint/Prettier 配置、Git 工作流规范",
          status: "done" as const,
          priority: "medium" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: ["后端开发"],
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 0,
        },
        {
          id: 3002,
          title: "基础布局组件开发",
          description:
            "实现通用布局框架：侧边栏导航、顶部面包屑、内容区域容器",
          status: "done" as const,
          priority: "low" as const,
          assignee: assigneePool[Random.integer(0, assigneePool.length - 1)],
          tags: ["前端开发", "UI设计"],
          createdAt: Random.datetime("yyyy-MM-dd HH:mm:ss"),
          orderIndex: 1,
        },
      ];

      /* 将用户动态创建的任务合并到对应的看板列中 */
      const dynamicTodoTasks = createdTasks.filter((t) => t.status === "todo");
      const dynamicDoingTasks = createdTasks.filter((t) => t.status === "doing");
      const dynamicDoneTasks = createdTasks.filter((t) => t.status === "done");

      console.log(
        `[mock/task-board] ✅ 返回看板数据: todo=${todoTasks.length + dynamicTodoTasks.length} (静态${todoTasks.length}+动态${dynamicTodoTasks.length}), ` +
        `doing=${doingTasks.length + dynamicDoingTasks.length}, done=${doneTasks.length + dynamicDoneTasks.length}`,
      );

      return {
        code: 0,
        data: [
          {
            id: "todo",
            title: "待处理",
            taskList: [...todoTasks, ...dynamicTodoTasks],
          },
          {
            id: "doing",
            title: "进行中",
            taskList: [...doingTasks, ...dynamicDoingTasks],
          },
          {
            id: "done",
            title: "已完成",
            taskList: [...doneTasks, ...dynamicDoneTasks],
          },
        ],
        message: "获取成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 创建任务接口 ====================
  {
    /**
     * @mock 模拟创建任务接口（SchemaForm 提交时调用）
     *
     * 接收表单提交数据，生成唯一 ID 后写入 createdTasks 内存数组。
     * 后续 GET /api/task/board 请求会将此任务合入对应看板列中返回。
     *
     * 替换说明：
     *   正式环境需实现真实后端 API，将数据写入数据库并返回创建结果
     */
    url: "/api/task/create",
    method: "post",

    /**
     * 创建任务 Mock 处理函数
     *
     * @param body - SchemaForm 提交的表单数据（字段名→值映射）
     * @returns 包含新建任务完整数据的响应
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const data = body || {};

      console.log("[mock/task-create] 收到创建任务请求:", JSON.stringify(data));

      /** 生成唯一 ID 并递增计数器 */
      taskIdCounter += 1;
      const newTaskId = taskIdCounter;

      /** 构建完整的任务对象 */
      const newTask = {
        id: newTaskId,
        title: String(data.title || "未命名任务"),
        description: data.description as string | undefined,
        status: String(data.status || "todo"),
        priority: String(data.priority || "medium"),
        assignee: data.assignee as string | undefined,
        tags: (data.tags as string[]) || undefined,
        createdAt: new Date().toISOString(),
        orderIndex: 0,
      };

      /* 写入内存存储 */
      createdTasks.push(newTask);

      console.log(
        `[mock/task-create] ✅ 任务已创建: id=${newTaskId}, title="${newTask.title}", status=${newTask.status}, ` +
        `(当前共 ${createdTasks.length} 个动态任务)`,
      );

      return {
        code: 0,
        data: newTask,
        message: "创建成功",
      };
    },
  } satisfies MockMethod,

  // ==================== 更新任务状态接口 ====================
  {
    /**
     * @mock 模拟更新任务状态接口（拖拽后调用）
     *
     * 替换说明：
     *   正式环境需实现真实后端 API，接收 taskId/newStatus/newIndex 并更新数据库
     *   后端应在事务中执行更新操作，确保数据一致性
     *
     * 特殊测试模式：
     *   当 taskId 为字符串 "fail_test" 时，模拟接口失败返回错误码
     *   用于测试前端拖拽回滚（rollback）功能
     */
    url: "/api/task/update",
    method: "post",

    /**
     * 更新任务状态 Mock 处理函数
     * 接收拖拽后的任务状态变更信息，返回更新结果
     *
     * @param body - 请求体，期望格式 { taskId: number|string, newStatus: string, newIndex: number }
     * @returns Mock 响应数据，成功时返回更新确认信息，失败时返回错误信息
     */
    response: ({ body }: { body?: Record<string, unknown> }) => {
      const taskId = body?.taskId;
      const newStatus = body?.newStatus;
      const newIndex = body?.newIndex;

      console.log(
        `[mock/task-update] 收到任务更新请求: taskId=${taskId}, newStatus=${newStatus}, newIndex=${newIndex}`,
      );

      // 失败测试模式：当 taskId 为 "fail_test" 时模拟接口异常
      // 用于验证前端拖拽操作的回滚（rollback）机制是否正常工作
      if (taskId === "fail_test") {
        console.warn(
          "[mock/task-update] ⚠️ 触发失败测试模式，返回错误响应（用于回滚测试）",
        );
        return {
          code: 50001,
          data: null,
          message: "模拟接口失败：用于测试数据回滚功能",
        };
      }

      // 校验必要参数是否存在
      if (taskId === undefined || taskId === null) {
        console.warn("[mock/task-update] 更新失败：缺少 taskId 参数");
        return {
          code: 40001,
          data: null,
          message: "缺少任务 ID 参数",
        };
      }

      if (!newStatus) {
        console.warn("[mock/task-update] 更新失败：缺少 newStatus 参数");
        return {
          code: 40002,
          data: null,
          message: "缺少目标状态参数",
        };
      }

      // 模拟成功的状态更新操作
      console.log(
        `[mock/task-update] ✅ 任务状态更新成功: taskId=${taskId} → status=${newStatus}, index=${newIndex}`,
      );

      return {
        code: 0,
        data: {
          success: true,
          taskId,
          newStatus,
        },
        message: "更新成功",
      };
    },
  } satisfies MockMethod,
];
