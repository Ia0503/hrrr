/**
 * @fileoverview 看板任务状态管理 Store（Pinia Setup Store 风格）
 * 负责看板列数据、任务拖拽排序、乐观更新与回滚等核心逻辑
 */

import { defineStore } from "pinia";
import { ref } from "vue";
import request from "@/utils/request";

/* ============================================================
 * WebSocket 实时同步模块导入
 * ============================================================ */
import { getWebSocketManager, SocketEvent, type SocketPayload } from "@/utils/websocket";
import type { TaskItem } from "./task"; // 引用自身类型定义，用于 WebSocket 事件载荷类型标注

/* ============================================================
 * 类型定义区域
 * ============================================================ */

/** 任务优先级枚举 */
export type TaskPriority = "low" | "medium" | "high" | "urgent";

/** 任务项数据结构 */
export interface TaskItem {
  /** 任务唯一标识 */
  id: number | string;
  /** 任务标题 */
  title: string;
  /** 任务描述（可选） */
  description?: string;
  /** 任务状态，对应看板列的 id，如 "todo", "doing", "done" */
  status: string;
  /** 任务优先级 */
  priority: TaskPriority;
  /** 负责人名称（可选） */
  assignee?: string;
  /** 标签数组（可选） */
  tags?: string[];
  /** 创建时间，ISO 格式时间字符串（可选） */
  createdAt?: string;
  /**
   * 列内排序索引
   * 用于拖拽排序后记录任务在当前列中的位置
   */
  orderIndex?: number;
}

/** 看板列数据结构 */
export interface BoardColumn {
  /** 列标识，如 "todo", "doing", "done" */
  id: string;
  /** 列标题，如 "待处理", "进行中", "已完成" */
  title: string;
  /** 该列下的任务列表（有序排列） */
  taskList: TaskItem[];
}

/* ============================================================
 * Store 定义
 * ============================================================ */

export const useTaskStore = defineStore("task", () => {
  /* ---------- 状态（State） ---------- */

  /** 看板所有列数据，每列包含有序的任务列表 */
  const boardColumns = ref<BoardColumn[]>([]);

  /** 全局加载状态，用于控制 UI 骨架屏 / 加载动画等 */
  const loading = ref<boolean>(false);

  /**
   * 快照备份（用于乐观更新回滚）
   * 在执行乐观更新前深拷贝一份 boardColumns，
   * 若 API 调用失败则从此处恢复原始数据
   */
  let boardSnapshot: BoardColumn[] | null = null;

  /* ---------- WebSocket 实时同步状态 ---------- */

  /**
   * WebSocket 监听器是否已初始化标志
   * 用于保证 initSocketListeners 的幂等性（多次调用不会重复注册监听）
   */
  const wsListenersInitialized = ref<boolean>(false);

  /* ---------- Getters（计算属性） ---------- */

  // 暂无额外 getter，后续可按需扩展

  /* ---------- Actions（操作方法） ---------- */

  /**
   * 获取看板完整数据
   *
   * 调用后端接口加载所有看板列及其下的任务列表，
   * 成功后将响应数据赋值给 boardColumns 状态。
   *
   * @throws 当请求失败时抛出错误，由调用方处理
   * @returns Promise<void>
   *
   * @example
   * ```ts
   * await taskStore.fetchBoardData();
   * ```
   */
  async function fetchBoardData(): Promise<void> {
    loading.value = true;
    console.log("[task-store] 开始获取看板数据...");

    try {
      const res = await request.get("/api/task/board");
      boardColumns.value = res as BoardColumn[];
      console.log("[task-store] ✅ 看板数据获取成功，共", boardColumns.value.length, "列");
    } catch (error) {
      console.error("[task-store] ❌ 看板数据获取失败:", error);
      throw error;
    } finally {
      loading.value = false;
    }
  }

  /**
   * 移动任务到目标列（跨列拖拽场景）
   *
   * 采用**乐观更新（Optimistic Update）**策略：
   * 1. 先在本地立即更新 UI（用户无感延迟）
   * 2. 再异步调用后端接口持久化
   * 3. 若后端失败则自动回滚到操作前的状态
   *
   * @param params - 拖拽移动参数
   * @param params.taskId       - 被拖拽任务的 ID
   * @param params.fromColumnId - 来源列的 ID
   * @param params.toColumnId   - 目标列的 ID
   * @param params.newIndex     - 在目标列中的插入位置索引
   * @throws API 失败时抛出错误，并已自动回滚本地状态
   * @returns Promise<void>
   *
   * @example
   * ```ts
   * await taskStore.moveTask({
   *   taskId: 42,
   *   fromColumnId: "todo",
   *   toColumnId: "doing",
   *   newIndex: 0,
   * });
   * ```
   */
  async function moveTask(params: {
    taskId: number | string;
    fromColumnId: string;
    toColumnId: string;
    newIndex: number;
  }): Promise<void> {
    const { taskId, fromColumnId, toColumnId, newIndex } = params;

    console.log(
      `[task-store] 🚀 开始移动任务 [${taskId}] ` +
      `从 [${fromColumnId}] → [${toColumnId}]，目标位置索引: ${newIndex}`,
    );

    /* 步骤一：创建快照备份（用于可能的回滚）
     * 使用 JSON.parse(JSON.stringify()) 进行深拷贝：
     * - 兼容性好：无需 polyfill，所有现代浏览器均支持
     * - 对于纯数据对象（无函数、Date、RegExp 等）足够可靠
     * - 本项目 TaskItem / BoardColumn 均为纯数据结构，适合此方案
     * 如需处理复杂对象可替换为 structuredClone()
     */
    boardSnapshot = JSON.parse(JSON.stringify(boardColumns.value)) as BoardColumn[];

    try {
      /* 步骤二：在来源列中定位并移除任务 */
      const sourceCol = boardColumns.value.find((col) => col.id === fromColumnId);
      if (!sourceCol) {
        throw new Error(`[task-store] 未找到来源列: ${fromColumnId}`);
      }

      const taskIndex = sourceCol.taskList.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) {
        throw new Error(`[task-store] 未在来源列中找到任务: ${taskId}`);
      }

      const [movedTask] = sourceCol.taskList.splice(taskIndex, 1);
      console.log(`[task-store] 📤 已从来源列 [${fromColumnId}] 移除任务 [${taskId}]`);

      /* 步骤三：将任务插入目标列的指定位置 */
      const targetCol = boardColumns.value.find((col) => col.id === toColumnId);
      if (!targetCol) {
        throw new Error(`[task-store] 未找到目标列: ${toColumnId}`);
      }

      targetCol.taskList.splice(newIndex, 0, movedTask);
      movedTask.status = toColumnId; // 同步更新任务的状态字段

      console.log(
        `[task-store] 📥 已将任务 [${taskId}] 插入目标列 [${toColumnId}] 的位置 ${newIndex}`,
      );

      /* 步骤四：调用后端接口持久化变更 */
      await request.post("/api/task/update", {
        taskId,
        newStatus: toColumnId,
        newIndex,
      });

      console.log(`[task-store] ✅ 任务 [${taskId}] 移动成功，后端已确认`);
    } catch (error) {
      /* 步骤五：API 失败 → 回滚到快照状态 */
      if (boardSnapshot !== null) {
        boardColumns.value = JSON.parse(JSON.stringify(boardSnapshot)) as BoardColumn[];
        console.warn(
          "[task-store] ⚠️ 拖拽更新失败，已回滚数据",
          error,
        );
      }
      throw error;
    } finally {
      // 操作完成后清除快照，释放内存引用
      boardSnapshot = null;
    }
  }

  /**
   * 同列内任务重排序（同列拖拽场景）
   *
   * 仅更新本地状态，不调用后端接口。
   * 通常配合 moveTask 或独立使用于纯前端排序场景。
   *
   * @param columnId - 目标列的 ID
   * @param taskList - 排序后的新任务列表（已包含最新顺序）
   * @returns void
   *
   * @example
   * ```ts
   * const newList = [...column.taskList];
   * // ... 对 newList 执行拖拽重排 ...
   * taskStore.reorderWithinColumn("doing", newList);
   * ```
   */
  function reorderWithinColumn(columnId: string, taskList: TaskItem[]): void {
    const column = boardColumns.value.find((col) => col.id === columnId);
    if (!column) {
      console.warn(`[task-store] ⚠️ reorderWithinColumn: 未找到列 [${columnId}]，跳过重排序`);
      return;
    }

    column.taskList = taskList;
    console.log(
      `[task-store] 🔄 列 [${columnId}] 内部重排序完成，共 ${taskList.length} 个任务`,
    );
  }

  /**
   * 新增任务到看板（从 SchemaForm 提交的数据创建）
   *
   * 将表单提交数据转换为 TaskItem 对象，并追加到指定状态列的任务列表末尾。
   * 新任务默认添加到表单中 status 字段指定的列，若未指定则默认放入 "todo" 列。
   *
   * @param formData - SchemaForm 提交的表单数据（字段名→值映射）
   *
   * @example
   * ```ts
   * taskStore.addTask({
   *   title: "新任务",
   *   priority: "high",
   *   assignee: "zhangsan",
   *   status: "todo",
   * });
   * ```
   */
  function addTask(formData: Record<string, unknown>): void {
    /* 生成唯一 ID：使用时间戳 + 随机数避免冲突 */
    const newId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    /* 确定目标列：优先使用表单中的 status，默认 "todo" */
    const targetStatus = (formData.status as string) || "todo";
    const targetColumn = boardColumns.value.find((col) => col.id === targetStatus);

    if (!targetColumn) {
      console.error(`[task-store] ❌ addTask: 未找到目标列 [${targetStatus}]，无法添加任务`);
      return;
    }

    /* 构建新的 TaskItem 对象 */
    const newTask: TaskItem = {
      id: newId,
      title: String(formData.title || "未命名任务"),
      description: formData.description as string | undefined,
      status: targetStatus,
      priority: (formData.priority as TaskPriority) || "medium",
      assignee: formData.assignee as string | undefined,
      tags: (formData.tags as string[]) || undefined,
      createdAt: new Date().toISOString(),
      orderIndex: targetColumn.taskList.length,
    };

    /* 追加到目标列的任务列表末尾 */
    targetColumn.taskList.push(newTask);

    console.log(
      `[task-store] ✅ 新任务已添加到列 [${targetStatus}]: ` +
      `"${newTask.title}" (id=${newId}, 共${targetColumn.taskList.length}个任务)`,
    );
  }

  /* ============================================================
   * WebSocket 实时同步 Actions
   * ============================================================
   *
   * 【设计要点】
   * - 精准更新算法：避免使用 `boardColumns.value = newData` 整体替换模式
   * - 原因：整体替换会覆盖本地尚未持久化的拖拽状态（如正在拖拽中的临时位置）
   * - 所有监听器均具备幂等性：通过 wsListenersInitialized 守卫标志防止重复注册
   * ============================================================ */

  /**
   * 初始化 WebSocket 事件监听器
   *
   * 注册以下三个核心事件的处理逻辑：
   * - TASK_UPDATED: 任务字段更新 / 跨列移动（精准定位 + 原地修改）
   * - TASK_DELETED: 其他用户删除任务时的同步移除
   * - TASK_CREATED: 其他用户创建新任务时的同步追加
   *
   * 该方法为幂等操作，多次调用不会重复注册监听器。
   */
  function initSocketListeners(): void {
    /* 幂等守卫：若已初始化则直接返回，防止重复注册 */
    if (wsListenersInitialized.value) {
      console.warn("[task-store] ⚠️ WebSocket 监听器已初始化，跳过重复注册");
      return;
    }

    const manager = getWebSocketManager();

    /* ---------- a) TASK_UPDATED 监听器 ----------
     * 处理任务字段更新与跨列移动两种场景
     * 采用精准更新策略：遍历列定位任务 → 根据状态是否变化选择不同处理路径 */
    manager.on(SocketEvent.TASK_UPDATED, (payload: SocketPayload<TaskItem>) => {
      const updatedTask = payload.data;

      console.log(
        `[task-store] [WS] 收到 TASK_UPDATED 事件，任务 ID: [${updatedTask.id}]`,
      );

      /** 遍历所有列，查找当前包含该任务的列及其索引位置 */
      let foundColumn: BoardColumn | undefined;
      let taskIndexInColumn = -1;
      let currentStatus = "";

      for (const col of boardColumns.value) {
        const idx = col.taskList.findIndex((t) => t.id === updatedTask.id);
        if (idx !== -1) {
          foundColumn = col;
          taskIndexInColumn = idx;
          currentStatus = col.id; // 记录任务当前所在列的 id（即旧状态）
          break;
        }
      }

      /** 场景 3a：找到任务且状态未变 → 原地更新字段 */
      if (foundColumn && taskIndexInColumn !== -1 && currentStatus === updatedTask.status) {
        // 使用 Object.assign 进行原地字段合并，保留响应式引用不变
        Object.assign(foundColumn.taskList[taskIndexInColumn], updatedTask);
        console.log(
          `[task-store] [WS] 任务 [${updatedTask.id}] 字段已同步更新（原地合并）`,
        );
        return;
      }

      /** 场景 3b：找到任务但状态已变更 → 跨列移动处理 */
      if (foundColumn && taskIndexInColumn !== -1 && currentStatus !== updatedTask.status) {
        // 从原列中移除该任务
        const [movedTask] = foundColumn.taskList.splice(taskIndexInColumn, 1);

        // 查找目标列（以任务的新 status 字段作为列 id）
        const targetCol = boardColumns.value.find((col) => col.id === updatedTask.status);
        if (targetCol) {
          // 将任务追加到目标列末尾（index = taskList.length）
          targetCol.taskList.push(movedTask);
          console.log(
            `[task-store] [WS] 任务 [${updatedTask.id}] 状态变更: [${currentStatus}] → [${updatedTask.status}]`,
          );
        } else {
          // 目标列不存在时回退到原列（防御性处理）
          console.warn(
            `[task-store] [WS] ⚠️ 任务 [${updatedTask.id}] 目标列 [${updatedTask.status}] 不存在，已回退`,
          );
          foundColumn.taskList.splice(taskIndexInColumn, 0, movedTask);
        }
        return;
      }

      /** 场景 3d：未找到该任务 → 视为新任务（可能由其他用户创建后立即编辑） */
      const fallbackCol = boardColumns.value.find((col) => col.id === updatedTask.status);
      if (fallbackCol) {
        fallbackCol.taskList.push({ ...updatedTask });
        console.log(`[task-store] [WS] 新任务已同步（UPDATE 回退）: [${updatedTask.id}]`);
      } else {
        console.warn(
          `[task-store] [WS] ⚠️ 任务 [${updatedTask.id}] 的状态列 [${updatedTask.status}] 不存在，无法同步`,
        );
      }
    });

    /* ---------- b) TASK_DELETED 监听器 ----------
     * 其他用户删除任务时，从本地对应列中同步移除 */
    manager.on(SocketEvent.TASK_DELETED, (payload: SocketPayload<{ taskId: number | string }>) => {
      const { taskId } = payload.data;

      console.log(`[task-store] [WS] 收到 TASK_DELETED 事件，任务 ID: [${taskId}]`);

      /** 遍历所有列，定位并移除目标任务 */
      for (const col of boardColumns.value) {
        const idx = col.taskList.findIndex((t) => t.id === taskId);
        if (idx !== -1) {
          col.taskList.splice(idx, 1);
          console.log(`[task-store] [WS] 任务 [${taskId}] 已被其他用户删除`);
          return;
        }
      }

      // 本地未找到该任务（可能已被其他事件提前移除），仅记录日志
      console.warn(`[task-store] [WS] ⚠️ 待删除任务 [${taskId}] 在本地未找到，可能已被移除`);
    });

    /* ---------- c) TASK_CREATED 监听器 ----------
     * 其他用户创建新任务时，根据任务状态追加到对应列 */
    manager.on(SocketEvent.TASK_CREATED, (payload: SocketPayload<TaskItem>) => {
      const newTask = payload.data;

      console.log(`[task-store] [WS] 收到 TASK_CREATED 事件，任务 ID: [${newTask.id}]`);

      /** 根据 task.status 查找目标看板列 */
      const targetCol = boardColumns.value.find((col) => col.id === newTask.status);
      if (targetCol) {
        // 使用展开运算符创建副本，避免外部引用污染
        targetCol.taskList.push({ ...newTask });
        console.log(`[task-store] [WS] 新任务已创建: [${newTask.id}]`);
      } else {
        console.warn(
          `[task-store] [WS] ⚠️ 新任务 [${newTask.id}] 的状态列 [${newTask.status}] 不存在`,
        );
      }
    });

    /* 标记初始化完成 */
    wsListenersInitialized.value = true;
    console.log("[task-store] ✅ WebSocket 监听器已初始化，共注册 3 个事件监听");
  }

  /**
   * 清理所有 WebSocket 事件监听器
   *
   * 移除之前通过 initSocketListeners 注册的全部事件处理器，
   * 并重置初始化标志。注意：本方法**不主动断开 WebSocket 连接**，
   * 连接的生命周期管理由调用方自行决定。
   */
  function cleanupSocketListeners(): void {
    const manager = getWebSocketManager();

    /* 逐个取消注册已绑定的事件监听器 */
    manager.off(SocketEvent.TASK_UPDATED);
    manager.off(SocketEvent.TASK_DELETED);
    manager.off(SocketEvent.TASK_CREATED);

    /* 重置初始化标志，允许后续重新调用 initSocketListeners */
    wsListenersInitialized.value = false;

    console.log("[task-store] 🔌 WebSocket 监听器已清理");
  }

  /* ---------- 返回值：暴露给组件使用的状态与方法 ---------- */
  return {
    // 状态
    boardColumns,
    loading,
    wsListenersInitialized, // WebSocket 监听器初始化状态（供组件判断是否已连接）
    // 方法
    fetchBoardData,
    moveTask,
    reorderWithinColumn,
    addTask, // 新增任务到看板（SchemaForm 提交时调用）
    // WebSocket 实时同步方法
    initSocketListeners, // 初始化 WebSocket 事件监听（进入看板页面时调用）
    cleanupSocketListeners, // 清理 WebSocket 监听器（离开看板页面时调用）
  };
});
