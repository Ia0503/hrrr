<template>
  <div class="wf-audit-log">
    <!-- 页面标题栏 -->
    <div class="wf-audit-log__header">
      <h2 class="wf-audit-log__title">审计日志</h2>
      <el-button
        type="danger"
        plain
        size="small"
        :loading="clearLoading"
        @click="handleClearAll"
      >
        清空日志
      </el-button>
    </div>

    <!-- 筛选工具栏 -->
    <div class="wf-audit-log__toolbar">
      <div class="wf-audit-log__filter-item">
        <span class="wf-audit-log__label">时间范围</span>
        <el-date-picker
          v-model="queryParams.startTime"
          type="datetime"
          placeholder="开始时间"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px"
          @change="handleSearch"
        />
        <span class="wf-audit-log__separator">至</span>
        <el-date-picker
          v-model="queryParams.endTime"
          type="datetime"
          placeholder="结束时间"
          value-format="YYYY-MM-DDTHH:mm:ss"
          style="width: 180px"
          @change="handleSearch"
        />
      </div>

      <div class="wf-audit-log__filter-item">
        <span class="wf-audit-log__label">操作模块</span>
        <el-select
          v-model="queryParams.module"
          placeholder="全部"
          clearable
          style="width: 140px"
          @change="handleSearch"
        >
          <el-option label="认证" value="auth" />
          <el-option label="用户管理" value="user" />
          <el-option label="任务看板" value="task" />
          <el-option label="系统管理" value="system" />
        </el-select>
      </div>

      <div class="wf-audit-log__filter-item">
        <span class="wf-audit-log__label">操作类型</span>
        <el-select
          v-model="queryParams.action"
          placeholder="全部"
          clearable
          style="width: 120px"
          @change="handleSearch"
        >
          <el-option label="登录" value="login" />
          <el-option label="登出" value="logout" />
          <el-option label="新建" value="create" />
          <el-option label="编辑" value="update" />
          <el-option label="删除" value="delete" />
        </el-select>
      </div>

      <div class="wf-audit-log__filter-item">
        <span class="wf-audit-log__label">操作人</span>
        <el-input
          v-model="queryParams.username"
          placeholder="输入用户名搜索"
          clearable
          style="width: 160px"
          @keyup.enter="handleSearch"
          @clear="handleSearch"
        />
      </div>

      <div class="wf-audit-log__actions">
        <el-button type="primary" :icon="Search" @click="handleSearch">
          搜索
        </el-button>
        <el-button :icon="RefreshRight" @click="handleReset">
          重置
        </el-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="wf-audit-log__table" v-loading="tableLoading">
      <el-table
        :data="logList"
        border
        stripe
        style="width: 100%"
        :default-sort="{ prop: 'createTime', order: 'descending' }"
      >
        <!-- 时间列 -->
        <el-table-column
          prop="createTime"
          label="操作时间"
          width="180"
          sortable
        >
          <template #default="{ row }">
            {{ formatTime(row.createTime) }}
          </template>
        </el-table-column>

        <!-- 操作人列 -->
        <el-table-column
          prop="username"
          label="操作人"
          width="110"
        />

        <!-- 模块列 -->
        <el-table-column
          prop="module"
          label="模块"
          width="100"
        >
          <template #default="{ row }">
            <el-tag :type="moduleTagType(row.module)" size="small">
              {{ moduleLabel(row.module) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 操作类型列 -->
        <el-table-column
          prop="action"
          label="操作类型"
          width="90"
        >
          <template #default="{ row }">
            <el-tag :type="actionTagType(row.action)" size="small" effect="plain">
              {{ actionLabel(row.action) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 方法列 -->
        <el-table-column
          prop="method"
          label="方法"
          width="70"
          align="center"
        />

        <!-- URL 列 -->
        <el-table-column
          prop="url"
          label="请求地址"
          min-width="180"
          show-overflow-tooltip
        />

        <!-- 请求参数列（可展开）-->
        <el-table-column
          label="请求参数"
          min-width="200"
        >
          <template #default="{ row }">
            <el-popover
              placement="bottom-start"
              :width="400"
              trigger="hover"
            >
              <template #reference>
                <el-text type="primary" style="cursor: pointer">
                  点击查看参数
                </el-text>
              </template>
              <pre class="wf-audit-log__param-json">{{ formatJson(row.params) }}</pre>
            </el-popover>
          </template>
        </el-table-column>

        <!-- 状态列 -->
        <el-table-column
          prop="status"
          label="状态"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            <el-tag
              :type="row.status === 'success' ? 'success' : 'danger'"
              size="small"
            >
              {{ row.status === "success" ? "成功" : "失败" }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 分页器 -->
    <div class="wf-audit-log__pagination">
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :total="pagination.total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @size-change="handleSizeChange"
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @file 审计日志查看页面
 * @module views/system/log/index
 * @description 系统管理下的审计日志查看页面，提供多维度筛选、分页浏览、参数详情展示、清空日志等功能。
 *             仅管理员角色可访问（通过动态路由权限控制）。
 *
 * 功能说明：
 *   - 多条件筛选：时间范围、操作模块、操作类型、操作人模糊搜索
 *   - 表格展示：时间、操作人、模块、操作类型、HTTP 方法、URL、参数（悬浮展开）、耗时、状态
 *   - 分页：支持每页条数切换和页码跳转
 *   - 清空：二次确认后清除全部审计日志（localStorage）
 *
 * 依赖关系：
 *   - 被引用于: 动态路由 /system/log
 *   - 依赖于: composables/useAuditLog.ts, types/log.ts, element-plus
 */

import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Search, RefreshRight } from "@element-plus/icons-vue";
import { useAuditLog } from "@/composables/useAuditLog";
import type { AuditLog, AuditLogQuery } from "@/types/log";

// ==================== 响应式状态 ====================

/** 日志列表数据 */
const logList = ref<AuditLog[]>([]);

/** 表格加载状态 */
const tableLoading = ref(false);

/** 清空按钮加载状态 */
const clearLoading = ref(false);

/** 分页信息 */
const pagination = reactive({
  page: 1,
  pageSize: 20,
  total: 0,
});

/** 筛选查询参数 */
const queryParams = reactive<Partial<AuditLogQuery> & {
  startTime?: string;
  endTime?: string;
}>({
  startTime: undefined,
  endTime: undefined,
  module: undefined,
  action: undefined,
  username: undefined,
});

// ==================== Hook 初始化 ====================

/** 审计日志 Hook 实例 */
const { fetchLogs, clearLogs } = useAuditLog();

// ==================== 数据加载 ====================

/**
 * 加载日志列表
 *
 * @param isResetPage - 是否重置到第 1 页（搜索/重置时为 true，翻页时为 false）
 */
async function loadLogs(isResetPage = false): Promise<void> {
  tableLoading.value = true;

  try {
    if (isResetPage) {
      pagination.page = 1;
    }

    const query: AuditLogQuery = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      ...queryParams,
    };

    const result = await fetchLogs(query);

    logList.value = result.list;
    pagination.total = result.total;

    console.log(
      `[audit-log-page] [INFO] 日志加载完成: 第${result.page}页, 共${result.total}条`,
    );
  } catch (error) {
    console.error("[audit-log-page] [ERROR] 日志列表加载失败:", error);
    ElMessage.error("日志列表加载失败");
  } finally {
    tableLoading.value = false;
  }
}

// ==================== 事件处理 ====================

/** 搜索按钮点击 */
function handleSearch(): void {
  loadLogs(true);
}

/** 重置筛选条件 */
function handleReset(): void {
  queryParams.startTime = undefined;
  queryParams.endTime = undefined;
  queryParams.module = undefined;
  queryParams.action = undefined;
  queryParams.username = undefined;
  loadLogs(true);
}

/** 分页页码变化 */
function handlePageChange(page: number): void {
  pagination.page = page;
  loadLogs();
}

/** 每页条数变化 */
function handleSizeChange(size: number): void {
  pagination.pageSize = size;
  pagination.page = 1;
  loadLogs();
}

/** 清空全部日志（需二次确认）*/
async function handleClearAll(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      "此操作将永久删除所有审计日志记录，是否继续？",
      "确认清空",
      {
        confirmButtonText: "确定清空",
        cancelButtonText: "取消",
        type: "warning",
        confirmButtonClass: "el-button--danger",
      },
    );

    clearLoading.value = true;
    clearLogs();

    /* 重新加载空列表 */
    await loadLogs(true);

    ElMessage.success("审计日志已全部清空");
  } catch (_cancelError) {
    /* 用户取消操作，无需处理 */
  } finally {
    clearLoading.value = false;
  }
}

// ==================== 格式化函数 ====================

/**
 * 格式化 ISO 时间字符串为本地显示格式
 *
 * @param isoString - ISO 8601 时间字符串
 * @returns 格式化后的时间字符串，如 "2026-05-28 19:30:01"
 */
function formatTime(isoString: string): string {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    const pad = (n: number): string => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  } catch (_e) {
    return isoString;
  }
}

/**
 * 将对象格式化为缩进的 JSON 字符串（用于参数展示）
 *
 * @param data - 待格式化的对象
 * @returns 缩进 2 空格的 JSON 字符串
 */
function formatJson(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch (_e) {
    return String(data);
  }
}

/**
 * 模块枚举值 → 中文标签映射
 */
function moduleLabel(module: string): string {
  const map: Record<string, string> = {
    auth: "认证",
    user: "用户",
    task: "任务",
    system: "系统",
  };
  return map[module] || module;
}

/**
 * 模块 → el-tag 类型映射
 */
function moduleTagType(module: string): "" | "success" | "warning" | "info" | "danger" {
  const map: Record<string, "" | "success" | "warning" | "info" | "danger"> = {
    auth: "",
    user: "success",
    task: "warning",
    system: "info",
  };
  return map[module] || "info";
}

/**
 * 操作类型枚举值 → 中文标签映射
 */
function actionLabel(action: string): string {
  const map: Record<string, string> = {
    login: "登录",
    logout: "登出",
    create: "新建",
    update: "编辑",
    delete: "删除",
    query: "查询",
  };
  return map[action] || action;
}

/**
 * 操作类型 → el-tag 类型映射
 */
function actionTagType(action: string): "" | "success" | "warning" | "info" | "danger" {
  const map: Record<string, "" | "success" | "warning" | "info" | "danger"> = {
    login: "success",
    logout: "info",
    create: "",
    update: "warning",
    delete: "danger",
    query: "info",
  };
  return map[action] || "info";
}

// ==================== 生命周期 ====================

onMounted(() => {
  console.log("[audit-log-page] [INFO] 审计日志页面已挂载");
  loadLogs();
});
</script>

<style scoped>
/* ============================================
 * 审计日志页面样式
 * 遵循 wf- 前缀 + BEM 规范
 * ============================================ */

.wf-audit-log {
  padding: 20px;
  min-height: 100%;
  box-sizing: border-box;
}

/* 页面标题栏 */
.wf-audit-log__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.wf-audit-log__title {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

/* 筛选工具栏 */
.wf-audit-log__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: center;
  padding: 16px 20px;
  margin-bottom: 16px;
  background-color: var(--el-bg-color);
  border-radius: var(--el-border-radius-base);
  border: 1px solid var(--el-border-color-lighter);
}

.wf-audit-log__filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wf-audit-log__label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.wf-audit-log__separator {
  font-size: 13px;
  color: var(--el-text-color-placeholder);
}

.wf-audit-log__actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

/* 表格容器 */
.wf-audit-log__table {
  background-color: var(--el-bg-color);
  border-radius: var(--el-border-radius-base);
  padding: 4px;
  min-height: 300px;
}

/* 参数 JSON 展示区域 */
.wf-audit-log__param-json {
  margin: 0;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  max-height: 300px;
  overflow-y: auto;
  word-break: break-all;
  white-space: pre-wrap;
}

/* 分页区域 */
.wf-audit-log__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
  padding: 12px 0;
}
</style>