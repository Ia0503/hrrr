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
import { ElMessage, ElMessageBox } from "element-plus";
import { Loading } from "@element-plus/icons-vue";
import { VueDraggable } from "vue-draggable-plus";
import { useTaskStore } from "@/stores/task";
import type { BoardColumn, TaskPriority, TaskItem } from "@/stores/task";

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

/** 当前选中的任务（用于详情弹窗展示） */
const selectedTask = ref<TaskItem | null>(null);

/** 任务详情弹窗可见性 */
const showDetailDialog = ref(false);

/** 编辑模式下的待编辑任务数据（传给 TaskForm 组件） */
const editingTaskData = ref<TaskItem | null>(null);

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

  /** 未配置 WebSocket 服务地址时跳过连接 */
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (!wsUrl || wsUrl === "undefined" || !wsUrl.trim()) {
    console.log("[board] ⏭️ WebSocket 未配置，跳过初始化（离线模式）");
    return;
  }

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
  /* 如果没有实际移动则忽略（同位置放下） */
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

  /* dataset.id 返回字符串，mock 数据中 id 为数字，需统一转换为数字 */
  const taskId = Number(evt.item.dataset.id) || evt.item.dataset.id;
  const fromColumnId = (evt.from.closest(".wf-board-column") as HTMLElement)?.dataset?.columnId || "";
  const toColumnId = (evt.to.closest(".wf-board-column") as HTMLElement)?.dataset?.columnId || "";

  console.log(
    `[board] 🚀 拖拽完成: taskId=${taskId} (${typeof taskId}), ` +
    `从[${fromColumnId}] → 到[${toColumnId}], 位置 ${evt.oldIndex} → ${evt.newIndex}`,
  );

  try {
    await taskStore.moveTask({ taskId, fromColumnId, toColumnId, newIndex: evt.newIndex });
    ElMessage.success("任务已移动");
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

/**
 * 格式化日期时间（含时分秒）
 *
 * @param dateStr - ISO 格式日期时间字符串
 * @returns 格式化后的完整时间文本（如 "2024-01-15 14:30"）
 */
function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return "未知时间";
  try {
    const date = new Date(dateStr);
    /* 使用北京时间格式化，避免时区偏差 */
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    return "时间格式异常";
  }
}

/**
 * 将状态值转为中文显示文本
 *
 * @param status - 状态枚举值（对应看板列 id）
 * @returns 中文显示名称
 */
function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    todo: "待处理",
    doing: "进行中",
    done: "已完成",
  };
  return statusMap[status] || status || "未设置";
}

/**
 * 将任务类型值转为中文显示文本
 *
 * @param taskType - 任务类型枚举值
 * @returns 中文显示名称
 */
function getTaskTypeLabel(taskType: string | undefined): string {
  const typeMap: Record<string, string> = {
    feature: "功能需求",
    bug: "缺陷 Bug",
    improvement: "优化改进",
    tech_debt: "技术债务",
    doc: "文档编写",
  };
  return taskType ? (typeMap[taskType] || taskType) : "未设置";
}

/**
 * 根据复杂度数值返回对应的星级文字描述
 *
 * @param complexity - 复杂度评分（1-5）
 * @returns 星级 + 文字描述字符串
 */
function getComplexityLabel(complexity: number | undefined): string {
  if (!complexity) return "未评估";
  const labels = ["", "极简 ⭐", "简单 ⭐⭐", "中等 ⭐⭐⭐", "复杂 ⭐⭐⭐⭐", "极复杂 ⭐⭐⭐⭐⭐"];
  return labels[complexity] || `${complexity} 分`;
}

/**
 * 格式化预估工时显示
 *
 * @param hours - 工时数（小时）
 * @returns 格式化后的工时文本
 */
function formatEstimatedHours(hours: number | undefined): string {
  if (!hours) return "未估算";
  return `${hours} 小时`;
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
 * 委托给 taskStore.addTask() 统一处理：
 *   1. 调用后端 API 持久化（获取服务端 ID）
 *   2. 成功后将返回数据写入本地 store，看板立即显示
 *   3. API 失败时抛出错误，由此处 catch 处理提示
 */
const handleTaskFormSubmit = async (data: Record<string, unknown>) => {
  console.log("[board] 📝 收到新建任务提交数据:", JSON.stringify(data, null, 2));

  try {
    await taskStore.addTask(data);
    ElMessage.success(`任务 "${String(data.title || "未命名")}" 创建成功！`);
  } catch (error) {
    console.error("[board] ❌ 创建任务失败:", error);
    ElMessage.error("创建失败，请重试");
  }
};

/* ============================================================
 * 任务详情弹窗
 * ============================================================ */

/**
 * 打开任务详情弹窗
 *
 * @param task - 被点击的任务卡片对应的数据对象
 */
function openDetailDialog(task: TaskItem): void {
  console.log(`[board] 👁️ 打开任务详情: id=${task.id}, title=${task.title}`);
  selectedTask.value = task;
  showDetailDialog.value = true;
}

/**
 * 从详情弹窗进入编辑模式
 *
 * 关闭详情弹窗 → 将当前选中任务赋值给 editingTaskData → 打开 TaskForm 编辑弹窗
 */
function handleEditTask(): void {
  if (!selectedTask.value) {
    console.warn("[board] ⚠️ 无选中任务，无法编辑");
    return;
  }

  console.log(`[board] ✏️ 进入编辑模式: id=${selectedTask.value.id}`);

  /* 关闭详情弹窗，切换到编辑表单 */
  showDetailDialog.value = false;

  /* 将当前任务数据传给 TaskForm 组件，触发编辑模式 */
  editingTaskData.value = { ...selectedTask.value };
  showTaskFormDialog.value = true;
}

/**
 * 删除当前选中的任务
 *
 * 流程：
 *   1. 弹出二次确认框（ElMessageBox.confirm）
 *   2. 用户确认后调用 /api/task/delete 接口
 *   3. 成功后刷新看板数据并关闭弹窗
 */
async function handleDeleteTask(): Promise<void> {
  if (!selectedTask.value) {
    console.warn("[board] ⚠️ 无选中任务，无法删除");
    return;
  }

  const taskTitle = selectedTask.value.title || "未命名任务";

  try {
    /* 二次确认：防止误删 */
    await ElMessageBox.confirm(
      `确定要删除任务「${taskTitle}」吗？此操作不可恢复。`,
      "删除确认",
      {
        confirmButtonText: "确认删除",
        cancelButtonText: "取消",
        type: "warning",
        confirmButtonClass: "el-button--danger",
      },
    );

    console.log(`[board] 🗑️ 用户确认删除任务: id=${selectedTask.value.id}`);

    /* 调用删除接口 */
    await request.delete("/api/task/delete", {
      data: { id: selectedTask.value.id },
    });

    ElMessage.success(`任务「${taskTitle}」已删除`);
    console.log(`[board] ✅ 任务删除成功，刷新看板数据`);

    /* 关闭详情弹窗并刷新看板 */
    showDetailDialog.value = false;
    selectedTask.value = null;

    await taskStore.fetchBoardData();
  } catch (error: any) {
    /* 用户点击"取消"时 error 为 'cancel'，不需要提示错误 */
    if (error === "cancel") {
      console.log("[board] 用户取消了删除操作");
      return;
    }

    console.error("[board] ❌ 删除任务失败:", error);
    ElMessage.error("删除失败，请重试");
  }
}

/**
 * TaskForm 编辑提交回调（编辑模式下复用）
 *
 * 与新建提交的区别：需要调用更新接口而非创建接口
 */
const handleEditFormSubmit = async (data: Record<string, unknown>) => {
  console.log("[board] 📝 收到编辑任务提交数据:", JSON.stringify(data, null, 2));

  try {
    await taskStore.updateTask(data);
    ElMessage.success(`任务 "${String(data.title || "未命名")}" 更新成功！`);
  } catch (error) {
    console.error("[board] ❌ 更新任务失败:", error);
    ElMessage.error("更新失败，请重试");
  } finally {
    /* 编辑完成后清空 editingTaskData，避免下次打开新建弹窗时残留数据 */
    editingTaskData.value = null;
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
          :group="{ name: 'tasks', pull: true, put: true }"
          class="wf-board-column__list"
          item-key="id"
          :animation="200"
          ghost-class="wf-task-card--ghost"
          drag-class="wf-task-card--drag"
          :scroll="true"
          :scroll-sensitivity="80"
          :scroll-speed="12"
          force-fallback
          @end="onDragEnd"
        >
          <article
            v-for="task in column.taskList"
            :key="task.id"
            :data-id="task.id"
            class="wf-task-card"
            @click="openDetailDialog(task)"
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

    <!-- ==================== 新建/编辑任务弹窗 ==================== -->
    <TaskForm
      v-model="showTaskFormDialog"
      :task-data="editingTaskData"
      :submit="editingTaskData ? handleEditFormSubmit : handleTaskFormSubmit"
      @submit="editingTaskData ? handleEditFormSubmit($event) : handleTaskFormSubmit($event)"
    />

    <!-- ==================== 任务详情弹窗 ==================== -->
    <el-dialog
      v-model="showDetailDialog"
      title="任务详情"
      width="560px"
      :close-on-click-modal="true"
      destroy-on-close
      class="wf-detail-dialog"
      @closed="selectedTask = null"
    >
      <!-- 详情内容区域：展示任务完整信息 -->
      <div v-if="selectedTask" class="wf-detail-dialog__body">
        <!-- 标题行 -->
        <div class="wf-detail-dialog__title-row">
          <h3 class="wf-detail-dialog__title">{{ selectedTask.title }}</h3>
          <el-tag
            size="small"
            :type="getPriorityTagType(selectedTask.priority)"
            effect="dark"
            round
          >
            {{ getPriorityLabel(selectedTask.priority) }}
          </el-tag>
        </div>

        <!-- 描述 -->
        <section class="wf-detail-dialog__section">
          <h4 class="wf-detail-dialog__section-title">任务描述</h4>
          <p class="wf-detail-dialog__desc">
            {{ selectedTask.description || "暂无描述" }}
          </p>
        </section>

        <!-- 元信息网格 -->
        <div class="wf-detail-dialog__meta-grid">
          <!-- 任务类型 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">任务类型</span>
            <span class="wf-detail-dialog__meta-value">
              {{ getTaskTypeLabel(selectedTask.taskType) }}
            </span>
          </div>

          <!-- 负责人 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">负责人</span>
            <span class="wf-detail-dialog__meta-value">
              {{ selectedTask.assignee || "未指派" }}
            </span>
          </div>

          <!-- 状态 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">状态</span>
            <span class="wf-detail-dialog__meta-value">
              {{ getStatusLabel(selectedTask.status) }}
            </span>
          </div>

          <!-- 优先级 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">优先级</span>
            <span class="wf-detail-dialog__meta-value">
              {{ getPriorityLabel(selectedTask.priority) }}
            </span>
          </div>

          <!-- 截止日期 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">截止日期</span>
            <span class="wf-detail-dialog__meta-value">
              {{ formatDate(selectedTask.dueDate) }}
            </span>
          </div>

          <!-- 预估工时 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">预估工时</span>
            <span class="wf-detail-dialog__meta-value">
              {{ formatEstimatedHours(selectedTask.estimatedHours) }}
            </span>
          </div>

          <!-- 复杂度评分 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">复杂度</span>
            <span class="wf-detail-dialog__meta-value">
              {{ getComplexityLabel(selectedTask.complexity) }}
            </span>
          </div>

          <!-- 创建时间 -->
          <div class="wf-detail-dialog__meta-item">
            <span class="wf-detail-dialog__meta-label">创建时间</span>
            <span class="wf-detail-dialog__meta-value">
              {{ formatDateTime(selectedTask.createdAt) }}
            </span>
          </div>
        </div>

        <!-- 标签列表 -->
        <section v-if="selectedTask.tags && selectedTask.tags.length" class="wf-detail-dialog__section">
          <h4 class="wf-detail-dialog__section-title">标签</h4>
          <div class="wf-detail-dialog__tags">
            <el-tag
              v-for="(tag, idx) in selectedTask.tags"
              :key="idx"
              size="small"
              type="info"
              effect="plain"
              class="wf-detail-dialog__tag"
            >
              #{{ tag }}
            </el-tag>
          </div>
        </section>
      </div>

      <!-- 底部操作按钮：编辑 + 删除 -->
      <template #footer>
        <div class="wf-detail-dialog__footer">
          <el-button type="primary" @click="handleEditTask">
            编 辑
          </el-button>
          <el-button type="danger" plain @click="handleDeleteTask">
            删 除
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* ============================================================
 * 页面根容器
 * ============================================================ */
.wf-board {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 84px); /* 大屏：减去顶部导航栏高度，填满剩余视口 */
  min-height: 0; /* 关键：允许 flex 子项收缩到小于内容高度 */
  padding: 20px 24px;
  gap: 16px;
  background-color: var(--wf-bg-page);
  overflow: hidden;
  transition: var(--wf-transition-theme);

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
  color: var(--wf-text-primary);
  line-height: 1.3;
}

.wf-board__subtitle {
  font-size: 13px;
  color: var(--wf-text-muted);
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
  color: var(--wf-text-muted);
  background-color: var(--wf-bg-page);
}
.wf-board__ws-indicator--offline::before {
  background-color: var(--wf-border-default);
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
  color: var(--wf-text-muted);
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
  min-height: 0; /* 允许 flex 子项收缩（关键：否则子元素高度不受限）*/
  overflow: hidden; /* 防止内容撑破容器 */
}

/* ============================================================
 * 响应式设计
 * ============================================================ */

/**
 * 平板/移动端适配（< 1024px）
 * 看板列改为纵向堆叠，高度自适应
 */
@media screen and (max-width: 1023px) {
  .wf-board {
    /* 小屏不再强制占满视口高度，改为自适应内容高度 */
    height: auto;
    min-height: calc(100vh - 84px);
    overflow: visible;
    padding: 12px 8px;
    gap: 12px;
  }

  .wf-board__header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 4px 0;
  }

  .wf-board__title {
    font-size: 16px;
  }

  .wf-board__subtitle {
    font-size: 12px;
  }

  .wf-board__header-right {
    width: 100%;
    justify-content: space-between;
  }

  /* 看板列：单列纵向排列 */
  .wf-board__columns {
    grid-template-columns: 1fr;
    overflow: visible;
    min-height: auto;
  }

  /* 每列不再限制最大高度 */
  .wf-board-column {
    max-width: none;
    max-height: none;
    overflow: visible;
  }

  .wf-board-column__list {
    max-height: none; /* 移除大屏的显示上限限制 */
    overflow-y: visible;
  }

  /* 卡片字体缩小 */
  .wf-task-card__title {
    font-size: 13px;
  }
  .wf-task-card__desc {
    font-size: 11px;
    -webkit-line-clamp: 1; /* 描述只显示一行 */
  }
  .wf-task-card__meta {
    font-size: 11px;
  }
}

/**
 * 手机竖屏（< 640px）
 * 进一步压缩间距和字号
 */
@media screen and (max-width: 639px) {
  .wf-board {
    padding: 8px 4px;
    gap: 8px;
  }

  .wf-board__title {
    font-size: 15px;
  }

  .wf-board-column__header {
    padding: 10px 12px;
  }

  .wf-board-column__title {
    font-size: 13px;
  }

  .wf-task-card {
    padding: 10px 12px;
  }

  .wf-task-card__title {
    font-size: 12px;
  }
}

/* ============================================================
 * 单个看板列
 * ============================================================ */
.wf-board-column {
  display: flex;
  flex-direction: column;
  background-color: var(--wf-bg-surface);
  border-radius: 10px;
  min-width: 300px;
  max-width: 380px;
  max-height: 100%; /* 不超过父容器高度，确保内部滚动区 max-height 生效 */
  overflow: hidden; /* 裁剪超出部分，防止任务列表撑开列 */
  box-shadow: var(--wf-shadow-sm);

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
  border-bottom: 1px solid var(--wf-border-light);
  background-color: var(--wf-bg-surface);
  flex-shrink: 0;
}

.wf-board-column__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--wf-text-primary);
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
  color: var(--wf-text-secondary);
  background-color: var(--wf-border-default);
  border-radius: 11px;
  line-height: 22px;
}

/* 任务列表滚动区
 *
 * 布局设计（自适应高度）：
 *   - flex: 1 + overflow-y: auto: 自动填充列内剩余空间，超出时纵向滚动
 *   - 不设 max-height：由父容器高度约束自然决定显示数量
 *   - 配合 VueDraggable 的 :scroll 属性，拖拽时接触边缘可自动滚动
 */
.wf-board-column__list {
  flex: 1;
  padding: 10px 12px;
  overflow-y: auto; /* 超出时显示滚动条 */
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
  background-color: var(--wf-border-default);
  border-radius: 2px;
}
.wf-board-column__list::-webkit-scrollbar-thumb:hover {
  background-color: var(--wf-border-default);
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
  color: var(--wf-text-muted);
}

.wf-board-column__empty-hint {
  margin: 0;
  font-size: 11px;
  color: var(--wf-text-muted);
}

/* ============================================================
 * 任务卡片
 * ============================================================ */
.wf-task-card {
  position: relative;
  padding: 12px 14px;
  background-color: var(--wf-bg-surface);
  border: 1px solid var(--wf-border-light);
  border-radius: 8px;
  cursor: grab;
  transition: box-shadow 0.15s ease, transform 0.15s ease, border-color 0.15s ease;

  /* 卡片本身禁止文字选中，拖拽时不会触发浏览器选区 */
  -webkit-user-select: none;
  user-select: none;
}

.wf-task-card:hover {
  box-shadow: var(--wf-shadow-md);
  border-color: var(--wf-border-default);
  transform: translateY(-1px);
}

.wf-task-card:active {
  cursor: grabbing;
}

/* 拖拽中的幽灵样式 */
.wf-task-card--ghost {
  opacity: 0.4;
  background-color: var(--wf-bg-page);
  border-style: dashed;
}

/* 正在拖拽的样式 */
.wf-task-card--drag {
  box-shadow: var(--wf-shadow-lg);
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
  color: var(--wf-text-muted);
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
  color: var(--wf-text-primary);
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
  color: var(--wf-text-secondary);
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
  border-top: 1px solid var(--wf-border-light);
  font-size: 12px;
  color: var(--wf-text-muted);
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

/* ============================================================
 * 任务详情弹窗
 * ============================================================ */

.wf-detail-dialog :deep(.el-dialog) {
  border-radius: 12px;
  overflow: hidden;
}

.wf-detail-dialog :deep(.el-dialog__header) {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid var(--wf-border-light);
  background-color: var(--wf-bg-surface);
}

.wf-detail-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: var(--wf-text-primary);
}

.wf-detail-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.wf-detail-dialog :deep(.el-dialog__footer) {
  padding: 12px 24px;
  border-top: 1px solid var(--wf-border-light);
  background-color: var(--wf-bg-surface);
}

/* 详情内容区 */
.wf-detail-dialog__body {
  padding: 20px 24px;
  max-height: 60vh;
  overflow-y: auto;
}

/* 标题行：任务名称 + 优先级标签 */
.wf-detail-dialog__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--wf-border-default);
}

.wf-detail-dialog__title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--wf-text-primary);
  line-height: 1.4;
  word-break: break-word;
}

/* 信息分区（描述 / 标签等） */
.wf-detail-dialog__section {
  margin-bottom: 18px;
}

.wf-detail-dialog__section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wf-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wf-detail-dialog__desc {
  margin: 0;
  font-size: 14px;
  color: var(--wf-text-primary);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

/* 元信息网格：两列布局展示字段键值对 */
.wf-detail-dialog__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 24px;
  padding: 14px 16px;
  background-color: var(--wf-bg-page);
  border-radius: 8px;
  border: 1px solid var(--wf-border-light);
  margin-bottom: 18px;
}

.wf-detail-dialog__meta-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.wf-detail-dialog__meta-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--wf-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.wf-detail-dialog__meta-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--wf-text-primary);
}

/* 标签列表 */
.wf-detail-dialog__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.wf-detail-dialog__tag {
  cursor: default;
}

/* 底部操作按钮区域 */
.wf-detail-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
