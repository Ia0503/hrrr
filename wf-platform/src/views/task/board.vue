<script setup lang="ts">
/**
 * @fileoverview 任务看板页面（Phase 3 + 4 核心业务页）
 *
 * 功能概览：
 * - 三列看板布局（待处理 / 进行中 / 已完成）
 * - 跨列拖拽排序（vue-draggable-plus）
 * - 实时协同（WebSocket 状态同步）
 * - 新建任务弹窗（SchemaForm 驱动）
 */

import { ref, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { VueDraggable } from "vue-draggable-plus";
import { useTaskStore } from "@/stores/task";
import type { BoardColumn, TaskPriority } from "@/stores/task";

/** WebSocket 管理器实例 */
import { getWebSocketManager } from "@/utils/websocket";
/** HTTP 请求封装（用于调用创建任务接口） */
import request from "@/utils/request";

import TaskForm from "./components/TaskForm.vue";

/* ============================================================
 * Store & State 初始化
 * ============================================================ */

const taskStore = useTaskStore();

/** 页面加载状态 */
const loading = ref(true);

/** 新建任务弹窗可见性 */
const showTaskFormDialog = ref(false);

/** WebSocket 连接状态（用于 UI 展示） */
const wsConnected = ref(false);

/* ============================================================
 * 生命周期
 * ============================================================ */

onMounted(async () => {
  console.log("[board] 🎯 看板页面已挂载，开始初始化...");

  try {
    loading.value = true;
    await taskStore.fetchBoardData();
    console.log("[board] ✅ 看板数据加载完成");
  } catch (error) {
    console.error("[board] ❌ 看板数据加载失败:", error);
    ElMessage.error("看板数据加载失败，请刷新重试");
  } finally {
    loading.value = false;
  }

  /* 初始化 WebSocket 监听器 */
  initWebSocket();
});

onUnmounted(() => {
  cleanupWebSocket();
});

/* ============================================================
 * WebSocket 管理
 * ============================================================ */

function initWebSocket(): void {
  const wsManager = getWebSocketManager();

  if (wsManager.connected) {
    wsConnected.value = true;
    taskStore.initSocketListeners();
    console.log("[board] 📡 WebSocket 已连接，已注册监听");
  } else {
    wsManager.connect().then(() => {
      wsConnected.value = true;
      taskStore.initSocketListeners();
      console.log("[board] 📡 WebSocket 连接成功并注册监听");
    }).catch((err: unknown) => {
      console.warn("[board] ⚠️ WebSocket 连接失败，将使用离线模式:", err);
      wsConnected.value = false;
    });
  }
}

function cleanupWebSocket(): void {
  try {
    taskStore.cleanupSocketListeners();
    wsConnected.value = false;
    console.log("[board] 🔌 WebSocket 监听已清理");
  } catch (error) {
    console.warn("[board] 清理 WebSocket 时发生错误:", error);
  }
}

/* ============================================================
 * 拖拽事件处理
 * ============================================================ */

/**
 * 跨列拖拽完成回调
 *
 * 当用户将任务卡片从一个列拖拽到另一个列时触发。
 * 调用 store 的 moveTask 方法处理状态变更（含乐观更新与回滚机制）。
 *
 * @param evt - vue-draggable-plus 提供的拖拽事件对象
 */
async function onDragEnd(evt: any): Promise<void> {
  /* 如果没有跨列移动则忽略 */
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

  const taskId = String(evt.item.dataset.id || "");
  const toColumnId = (evt.to.closest(".wf-board-column") as HTMLElement)?.dataset?.columnId || "";
  const newIndex = evt.newIndex;

  console.log(
    `[board] 🚀 检测到跨列/跨位置拖拽: ` +
    `taskId=${taskId}, 目标列=${toColumnId}, 新位置=${newIndex}`,
  );

  try {
    await taskStore.moveTask(taskId, toColumnId, newIndex);
  } catch (error) {
    console.error("[board] 拖拽操作处理失败:", error);
    ElMessage.error("任务移动失败，请重试");
  }
}

/**
 * 列内排序完成回调
 *
 * @param columnId - 发生排序列的 ID
 * @param newOrder - 排序后的任务 ID 数组
 */
async function onSortEnd(columnId: string, newOrder: string[]): Promise<void> {
  console.log(`[board] 📋 列 [${columnId}] 内部排序完成`);

  try {
    await taskStore.reorderWithinColumn(columnId, newOrder);
  } catch (error) {
    console.error("[board] 内部排序处理失败:", error);
    ElMessage.error("排序保存失败，请重试");
  }
}

/* ============================================================
 * 工具方法
 * ============================================================ */

/**
 * 根据 priority 值返回对应的 Element Plus Tag 类型
 *
 * @param priority - 任务优先级值
 * @returns el-tag 组件的 type 属性值
 */
function getPriorityTagType(priority: TaskPriority): "" | "success" | "warning" | "danger" | "info" {
  switch (priority) {
    case "urgent": return "danger";
    case "high": return "warning";
    case "medium": return "info";  /* 中等优先级用 info 样式（灰蓝色） */
    case "low": return "info";
    default: return "info";
  }
}

/**
 * 将优先级值转为中文显示文本
 *
 * @param priority - 优先级枚举值
 * @returns 中文显示名称
 */
function getPriorityLabel(priority: TaskPriority): string {
  const map: Record<TaskPriority, string> = {
    urgent: "紧急",
    high: "高",
    medium: "中",
    low: "低",
  };
  return map[priority] || "未设置";
}

/**
 * 格式化日期为可读字符串
 *
 * @param dateStr - ISO 格式日期字符串
 * @returns 格式化后的日期文本（如 "2024-01-15"）
 */
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "暂无截止日期";
  try {
    return new Date(dateStr).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return "日期格式异常";
  }
}

/* ============================================================
 * 新建任务弹窗
 * ============================================================ */

/** 打开新建任务弹窗 */
function openCreateDialog(): void {
  showTaskFormDialog.value = true;
}

/**
 * 新建任务弹窗提交回调
 * 调用创建接口 → 成功后写入 taskStore → 看板立即显示新任务
 * 刷新页面后重新请求看板数据时，mock 会从内存中返回该任务
 */
const handleTaskFormSubmit = async (data: Record<string, unknown>) => {
  console.log("[board] 📝 收到新建任务提交数据:", JSON.stringify(data, null, 2));

  try {
    /* @mock 调用创建任务接口，将数据持久化到 mock 内存存储 */
    const res = await request.post("/api/task/create", data);
    const createdTask = res.data.data;

    console.log(`[board] ✅ 接口返回: id=${createdTask.id}, title="${createdTask.title}"`);

    /* 将接口返回的完整任务数据写入 store，新任务立即出现在看板对应列中 */
    taskStore.addTask(createdTask as Record<string, unknown>);

    ElMessage.success(`任务 "${String(data.title || "未命名")}" 创建成功！`);
  } catch (error) {
    console.error("[board] ❌ 创建任务失败:", error);

    /* 接口失败时的降级方案：仍然写入本地 store（仅本次会话有效） */
    console.warn("[board] ⚠️ 降级处理：任务仅添加到本地（刷新后将丢失）");
    taskStore.addTask(data);
    ElMessage.warning("任务已创建（离线模式），刷新页面后可能丢失");
  }
};
</script>

<template>
  <div class="wf-board">
    <!-- ==================== 页面头部 ==================== -->
    <header class="wf-board__header">
      <div class="wf-board__header-left">
        <h1 class="wf-board__title">任务看板</h1>
        <span class="wf-board__subtitle">实时协同 · 可视化管理</span>
      </div>

      <div class="wf-board__header-right">
        <!-- WebSocket 连接状态指示灯 -->
        <span :class="['wf-board__ws-indicator', wsConnected ? 'wf-board__ws-indicator--online' : 'wf-board__ws-indicator--offline']">
          {{ wsConnected ? "已连接" : "离线模式" }}
        </span>

        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Loading /></el-icon>
          新建任务
        </el-button>

        <el-button @click="taskStore.fetchBoardData()" :loading="loading">
          刷新
        </el-button>
      </div>
    </header>

    <!-- ==================== 加载状态 ==================== -->
    <div v-if="loading" class="wf-board__loading">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <p class="wf-board__loading-text">正在加载看板数据...</p>
    </div>

    <!-- ==================== 看板主体（三列） ==================== -->
    <main v-else class="wf-board__columns">
      <section
        v-for="column in taskStore.boardColumns"
        :key="column.id"
        class="wf-board-column"
        :data-column-id="column.id"
      >
        <!-- 列头：标题 + 计数 -->
        <div class="wf-board-column__header">
          <h2 class="wf-board-column__title">{{ column.title }}</h2>
          <span class="wf-board-column__count">{{ column.taskList.length }}</span>
        </div>

        <!-- 任务列表（支持拖拽）
             vue-draggable-plus 0.6.x 的默认插槽是普通容器插槽（不传 scoped 数据），
             需要在插槽内部自行 v-for 遍历 column.taskList，SortableJS 会自动让子元素可拖拽 -->
        <VueDraggable
          v-model="column.taskList"
          group="tasks"
          class="wf-board-column__list"
          item-key="id"
          :animation="200"
          ghost-class="wf-task-card--ghost"
          drag-class="wf-task-card--drag"
          handle=".wf-task-card__handle"
          @end="onDragEnd"
        >
          <article
            v-for="task in column.taskList"
            :key="task.id"
            :data-id="task.id"
            class="wf-task-card"
          >
            <div class="wf-task-card__handle">
              <span class="wf-task-card__grip">⋮⋮</span>
            </div>

            <div class="wf-task-card__top">
              <el-tag
                size="small"
                :type="getPriorityTagType(task.priority)"
                effect="light"
                round
              >
                {{ getPriorityLabel(task.priority) }}
              </el-tag>
              <h3 class="wf-task-card__title" :title="task.title">{{ task.title }}</h3>
            </div>

            <p v-if="task.description" class="wf-task-card__desc" :title="task.description">
              {{ task.description }}
            </p>

            <footer class="wf-task-card__meta">
              <span v-if="task.assignee" class="wf-task-card__assignee">
                👤 {{ task.assignee }}
              </span>
              <span v-if="task.dueDate" class="wf-task-card__due">
                📅 {{ formatDate(task.dueDate) }}
              </span>
              <span v-for="(tag, idx) in (task.tags || [])" :key="idx" class="wf-task-card__tag">
                #{{ tag }}
              </span>
            </footer>
          </article>
        </VueDraggable>

        <!-- 空状态提示 -->
        <div v-if="!column.taskList.length" class="wf-board-column__empty">
          <p class="wf-board-column__empty-text">暂无任务</p>
          <p class="wf-board-column__empty-hint">拖拽任务卡片或点击「新建任务」</p>
        </div>
      </section>
    </main>

    <!-- ==================== 新建任务弹窗 ==================== -->
    <TaskForm
      v-model="showTaskFormDialog"
      @submit="handleTaskFormSubmit"
    />
  </div>
</template>

<style scoped>
/* ============================================================
 * 页面根容器
 * ============================================================ */
.wf-board {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px 24px;
  gap: 16px;
  background-color: #f0f2f5;

  /* 禁止看板区域文字选中，防止拖拽时触发浏览器选区 */
  -webkit-user-select: none;
  user-select: none;
}

/* ============================================================
 * 页面头部
 * ============================================================ */
.wf-board__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 12px 4px;
}

.wf-board__header-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wf-board__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
  line-height: 1.3;
}

.wf-board__subtitle {
  font-size: 13px;
  color: #9ca3af;
  font-weight: 400;
}

.wf-board__header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* WebSocket 状态指示灯 */
.wf-board__ws-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 12px;
  line-height: 1;
}

.wf-board__ws-indicator::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.wf-board__ws-indicator--online {
  color: #059669;
  background-color: #ecfdf5;
}
.wf-board__ws-indicator--online::before {
  background-color: #10b981;
  box-shadow: 0 0 4px rgba(16, 185, 129, 0.5);
}

.wf-board__ws-indicator--offline {
  color: #9ca3af;
  background-color: #f3f4f6;
}
.wf-board__ws-indicator--offline::before {
  background-color: #d1d5db;
}

/* ============================================================
 * 加载状态
 * ============================================================ */
.wf-board__loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #9ca3af;
}

.wf-board__loading-text {
  margin: 0;
  font-size: 14px;
}

/* ============================================================
 * 看板列容器
 * ============================================================ */
.wf-board__columns {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  min-height: 0;
  overflow-x: auto;
}

/* 响应式：小屏幕下改为纵向滚动 */
@media (max-width: 1024px) {
  .wf-board__columns {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .wf-board {
    overflow-y: auto;
  }
}

/* ============================================================
 * 单个看板列
 * ============================================================ */
.wf-board-column {
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 10px;
  min-width: 300px;
  max-width: 380px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);

  /* 继承父级禁止选中，确保列内也不会触发文字选区 */
  -webkit-user-select: none;
  user-select: none;
}

/* 列头 */
.wf-board-column__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #f0f0f0;
  background-color: #fafbfc;
  flex-shrink: 0;
}

.wf-board-column__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #374151;
}

.wf-board-column__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 7px;
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  background-color: #e5e7eb;
  border-radius: 11px;
  line-height: 22px;
}

/* 任务列表滚动区 */
.wf-board-column__list {
  flex: 1;
  padding: 10px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
}

/* 自定义滚动条 */
.wf-board-column__list::-webkit-scrollbar {
  width: 4px;
}
.wf-board-column__list::-webkit-scrollbar-thumb {
  background-color: #e5e7eb;
  border-radius: 2px;
}
.wf-board-column__list::-webkit-scrollbar-thumb:hover {
  background-color: #d1d5db;
}

/* 空状态 */
.wf-board-column__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  text-align: center;
}

.wf-board-column__empty-text {
  margin: 0 0 4px;
  font-size: 13px;
  color: #9ca3af;
}

.wf-board-column__empty-hint {
  margin: 0;
  font-size: 11px;
  color: #d1d5db;
}

/* ============================================================
 * 任务卡片
 * ============================================================ */
.wf-task-card {
  position: relative;
  padding: 12px 14px;
  background-color: #ffffff;
  border: 1px solid #eaeaea;
  border-radius: 8px;
  cursor: grab;
  transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;

  /* 卡片本身禁止文字选中，拖拽时不会触发浏览器选区 */
  -webkit-user-select: none;
  user-select: none;
}

.wf-task-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
  transform: translateY(-1px);
}

.wf-task-card:active {
  cursor: grabbing;
}

/* 拖拽中的幽灵样式 */
.wf-task-card--ghost {
  opacity: 0.4;
  background-color: #f3f4f6;
  border-style: dashed;
}

/* 正在拖拽的样式 */
.wf-task-card--drag {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  transform: rotate(2deg);
}

/* 拖拽手柄 */
.wf-task-card__handle {
  position: absolute;
  top: 8px;
  right: 8px;
  cursor: grab;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.wf-task-card:hover .wf-task-card__handle {
  opacity: 0.5;
}

.wf-task-card__grip {
  font-size: 14px;
  color: #9ca3af;
  letter-spacing: -1px;
  line-height: 1;
}

/* 卡片顶部：优先级 + 标题 */
.wf-task-card__top {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.wf-task-card__title {
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: #1f2937;
  line-height: 1.4;
  flex: 1;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 描述预览 */
.wf-task-card__desc {
  margin: 0 0 8px;
  font-size: 12px;
  color: #6b7280;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 底部元信息 */
.wf-task-card__meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f3f4f6;
  font-size: 12px;
  color: #9ca3af;
}

.wf-task-card__assignee,
.wf-task-card__due,
.wf-task-card__tag {
  white-space: nowrap;
}

.wf-task-card__tag {
  color: #6366f1;
  font-size: 11px;
}
</style>
