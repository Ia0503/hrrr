/**
 * @file 审计日志组合式函数（Hook）
 * @module composables/useAuditLog
 * @description 封装审计日志的写入、查询、清空等核心能力。
 *             提供 addLog() 方法供业务代码手动调用，
 *             同时支持 localStorage 持久化和敏感字段自动脱敏。
 *
 * 设计原则：
 *   1. 日志失败绝不阻塞主业务流程（全链路 try-catch + console.error 降级）
 *   2. 敏感字段通过可配置的脱敏规则表处理（支持精确匹配 + 前缀匹配）
 *   3. localStorage 持久化 + 最大条数上限自动裁剪机制
 *
 * 依赖关系：
 *   - 被引用于: utils/request.ts（拦截器自动采集）, stores/user.ts（登录/登出手动埋点）, views/system/log/index.vue（页面展示）
 *   - 依赖于: types/log.ts, utils/request.ts（发送日志到后端/Mock）
 */

import type { AuditLog, AuditLogQuery, AuditLogPageResult } from "@/types/log";
import { AuditModule, AuditAction } from "@/types/log";
import { post } from "@/utils/request";

// ==================== 常量配置 ====================

/** localStorage 中存储审计日志的 key */
const STORAGE_KEY = "wf_audit_logs";

/** localStorage 元数据的 key（版本号、清理策略标记等）*/
const META_KEY = "_wf_audit_meta";

/** 默认最大存储条数（超出时裁剪最旧记录）*/
const DEFAULT_MAX_SIZE = 1000;

/** 存储格式版本号（用于后续迁移兼容）*/
const STORAGE_VERSION = 1;

// ==================== 脱敏规则配置 ====================

/**
 * 脱敏字段匹配规则
 * 支持两种匹配模式：
 *   - exact: 字段名完全匹配（不区分大小写）
 *   - prefix: 字段名以指定前缀开头（不区分大小写）
 *
 * 扩展方式：在此数组中 push 新规则即可，无需修改 sanitizeParams 函数
 */
const SENSITIVE_PATTERNS: Array<{ type: "exact" | "prefix"; value: string }> = [
  { type: "exact", value: "password" },
  { type: "exact", value: "token" },
  { type: "exact", value: "refreshToken" },
  // { type: "prefix", value: "authorization" }, /* 预留：后续按需开启 */
  // { type: "exact", value: "idCard" },          /* 预留：身份证号 */
  // { type: "exact", value: "phone" },           /* 预留：手机号 */
];

// ==================== 内部工具函数 ====================

/**
 * 对参数对象进行敏感字段脱敏处理
 *
 * 遍历 params 对象的所有 key，与 SENSITIVE_PATTERNS 规则表逐一比对，
 * 匹配成功的字段值替换为 "******"，其余字段原样保留。
 *
 * @param params - 待脱敏的参数对象（原始副本，不会修改原对象）
 * @returns 脱敏后的新对象（浅拷贝 + 替换敏感字段值）
 *
 * @example
 * ```ts
 * sanitizeParams({ username: "admin", password: "123456", token: "abc" })
 * // → { username: "admin", password: "******", token: "******" }
 * ```
 */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const result = { ...params };

  for (const key of Object.keys(result)) {
    const lowerKey = key.toLowerCase();
    const matched = SENSITIVE_PATTERNS.some((p) =>
      p.type === "exact"
        ? p.value.toLowerCase() === lowerKey
        : lowerKey.startsWith(p.value.toLowerCase()),
    );

    if (matched) {
      result[key] = "******";
      console.log(`[AUDIT-LOG] [INFO] 参数脱敏: ${key} → ******`);
    }
  }

  return result;
}

/**
 * 生成唯一日志 ID
 * 使用时间戳 + 4 位随机十六进制字符串，保证高并发下的唯一性
 *
 * @returns 格式如 "log_20260528T103001_a3f8k2" 的字符串
 */
function generateLogId(): string {
  const now = new Date();
  const timePart = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const randomPart = Math.random().toString(16).substring(2, 8);
  return `log_${timePart}_${randomPart}`;
}

/**
 * 从 localStorage 读取全部审计日志
 * 若读取失败或数据损坏则返回空数组（降级策略）
 *
 * @returns 已存储的日志数组
 */
function loadFromStorage(): AuditLog[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn("[AUDIT-LOG] [WARN] localStorage 中的日志数据格式异常，已重置");
      return [];
    }
    return parsed as AuditLog[];
  } catch (e) {
    console.error("[AUDIT-LOG] [ERROR] 从 localStorage 读取审计日志失败:", e);
    return [];
  }
}

/**
 * 将审计日志数组写入 localStorage
 * 写入失败时尝试清理旧数据后重试（配额溢出兜底策略）
 *
 * @param logs - 要存储的日志数组
 * @param retryCount - 当前重试次数（内部递归用，外部调用不传）
 */
function saveToStorage(logs: AuditLog[], retryCount = 0): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    /* 配额溢出时的降级策略：删除一半最旧的记录后重试（最多重试 1 次）*/
    if (
      e instanceof DOMException &&
      e.name === "QuotaExceededError" &&
      retryCount === 0 &&
      logs.length > 1
    ) {
      console.warn(
        "[AUDIT-LOG] [WARN] localStorage 配额已满，自动清理 50% 旧日志后重试",
      );
      const trimmed = logs.slice(Math.floor(logs.length / 2));
      saveToStorage(trimmed, retryCount + 1);
      return;
    }
    console.error("[AUDIT-LOG] [ERROR] 审计日志写入 localStorage 失败:", e);
  }
}

/**
 * 执行最大条数裁剪
 * 当日志总数超过 maxSize 时，移除最早的记录以释放空间
 *
 * @param logs - 当前日志数组（将被原地修改）
 * @param maxSize - 允许的最大条数
 */
function enforceMaxSize(logs: AuditLog[], maxSize: number): void {
  if (logs.length <= maxSize) return;

  const removedCount = logs.length - maxSize;
  logs.splice(0, removedCount);

  console.log(
    `[AUDIT-LOG] [INFO] 日志数量超限(${logs.length + removedCount}/${maxSize})，已裁剪 ${removedCount} 条最早记录`,
  );
}

/**
 * 初始化元数据（仅在首次写入时执行）
 * 记录存储版本和初始时间，用于后续数据迁移和诊断
 */
function initMetadata(): void {
  if (!localStorage.getItem(META_KEY)) {
    try {
      localStorage.setItem(
        META_KEY,
        JSON.stringify({ version: STORAGE_VERSION, maxSize: DEFAULT_MAX_SIZE, createdAt: new Date().toISOString() }),
      );
    } catch (_e) {
      /* 元数据写入失败不影响主功能 */
    }
  }
}

// ==================== 主 Hook 函数 ====================

/**
 * 审计日志组合式函数
 *
 * 提供审计日志的完整生命周期管理能力：
 *   - addLog(): 写入一条日志（自动脱敏 + 持久化 + 上报后端 + 上限保护）
 *   - fetchLogs(): 分页查询日志列表（优先调 API，降级读 localStorage）
 *   - clearLogs(): 清空全部日志（需管理员权限确认）
 *
 * @returns 审计日志操作方法集
 *
 * @example
 * ```ts
 * const { addLog, fetchLogs, clearLogs } = useAuditLog();
 *
 * // 手动记录登录
 * await addLog({
 *   module: AuditModule.AUTH,
 *   action: AuditAction.LOGIN,
 *   method: "POST",
 *   url: "/api/login",
 *   params: { username: "admin" },
 *   status: "success",
 * });
 *
 * // 分页查询
 * const result = await fetchLogs({ page: 1, pageSize: 20 });
 * ```
 */
export function useAuditLog() {

  /**
   * 写入一条审计日志
   *
   * 执行流程：
   *   1. 补充默认值（id, ip, userAgent, createTime）
   *   2. 对 params 进行敏感字段脱敏
   *   3. 追加到 localStorage（持久化）
   *   4. 异步上报到后端 /api/system/log/add（失败降级为 console.error）
   *   5. 检查并执行最大条数裁剪
   *
   * @param logData - 日志数据（允许部分字段缺失，将自动补全）
   * @returns Promise<void> - 无论成功失败均 resolve（绝不 reject）
   */
  async function addLog(logData: Partial<AuditLog>): Promise<void> {
    try {
      /* 步骤 1：构建完整的日志记录 */
      const fullLog: AuditLog = {
        id: generateLogId(),
        userId: logData.userId ?? null,
        username: logData.username ?? "anonymous",
        module: logData.module ?? AuditModule.SYSTEM,
        action: logData.action ?? AuditAction.QUERY,
        method: logData.method ?? "UNKNOWN",
        url: logData.url ?? "",
        params: sanitizeParams(logData.params ?? {}),
        ip: logData.ip ?? "127.0.0.1",
        userAgent:
          typeof window !== "undefined"
            ? navigator.userAgent || ""
            : "",
        status: logData.status ?? "success",
        createTime: new Date().toISOString(),
      };

      /* 步骤 2：初始化元数据（首次）*/
      initMetadata();

      /* 步骤 3：追加到 localStorage（持久化）*/
      const existingLogs = loadFromStorage();
      existingLogs.push(fullLog);
      enforceMaxSize(existingLogs, DEFAULT_MAX_SIZE);
      saveToStorage(existingLogs);

      /* 步骤 4：异步上报到后端/Mock（不阻塞主流程）*/
      try {
        // ====== 未来替换说明 ======
        // 当前使用 request.post 发送到 Mock 接口
        // 正式对接后端时无需修改此处，只需确保 /api/system/log/add 接口可用即可
        //
        await post("/api/system/log/add", fullLog);
      } catch (_reportError) {
        /* 上报失败静默降级：日志已存入 localStorage，不影响主业务 */
        console.error("[AUDIT-LOG] [ERROR] 审计日志上报后端失败:", _reportError);
      }

      console.log(
        `[AUDIT-LOG] [INFO] 审计日志已记录: [${fullLog.module}/${fullLog.action}] ${fullLog.username} ${fullLog.method} ${fullLog.url} (${fullLog.status})`,
      );
    } catch (e) {
      /* 最外层兜底：任何异常都不向上传播 */
      console.error("[AUDIT-LOG] [ERROR] 审计日志写入异常:", e);
    }
  }

  /**
   * 分页查询审计日志列表
   *
   * 优先调用后端 API 获取最新数据；
   * 若 API 调用失败则降级读取 localStorage 本地缓存作为兜底。
   *
   * @param query - 查询条件（分页、筛选）
   * @returns Promise<AuditLogPageResult> - 分页结果
   */
  async function fetchLogs(query: AuditLogQuery): Promise<AuditLogPageResult> {
    try {
      // ====== 未来替换说明 ======
      // 当前调用 Mock 接口获取日志列表
      // 正式对接后端时无需修改此处，只需确保 /api/system/log/list 接口返回正确格式即可
      //
      const result = await post<AuditLogPageResult>("/api/system/log/list", query);
      return result;
    } catch (_fetchError) {
      /* API 失败降级：从 localStorage 读取本地缓存 */
      console.warn("[AUDIT-LOG] [WARN] 日志列表 API 获取失败，降级读取本地缓存:", _fetchError);

      const allLogs = loadFromStorage();
      const filtered = filterLogs(allLogs, query);
      const total = filtered.length;
      const startIdx = (query.page - 1) * query.pageSize;
      const list = filtered.slice(startIdx, startIdx + query.pageSize);

      return { list, total, page: query.page, pageSize: query.pageSize };
    }
  }

  /**
   * 清空全部审计日志
   * 同时清除 localStorage 和元数据
   *
   * @returns void
   */
  function clearLogs(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(META_KEY);
      console.log("[AUDIT-LOG] [INFO] 审计日志已全部清空");
    } catch (e) {
      console.error("[AUDIT-LOG] [ERROR] 清空审计日志失败:", e);
    }
  }

  /* 返回公共方法 */
  return { addLog, fetchLogs, clearLogs };
}

// ==================== 内部辅助函数 ====================

/**
 * 对日志数组应用筛选条件
 * 支持按时间范围、模块、操作类型、操作人、状态等多维度过滤
 *
 * @param logs - 全量日志数组
 * @param query - 筛选条件
 * @returns 筛选后的日志子集（已按 createTime 倒序排列）
 */
function filterLogs(logs: AuditLog[], query: AuditLogQuery): AuditLog[] {
  let result = [...logs].sort(
    (a, b) => new Date(b.createTime).getTime() - new Date(a.createTime).getTime(),
  );

  /* 时间范围筛选 */
  if (query.startTime) {
    const start = new Date(query.startTime).getTime();
    result = result.filter((l) => new Date(l.createTime).getTime() >= start);
  }
  if (query.endTime) {
    const end = new Date(query.endTime).getTime();
    result = result.filter((l) => new Date(l.createTime).getTime() <= end);
  }

  /* 模块筛选 */
  if (query.module) {
    result = result.filter((l) => l.module === query.module);
  }

  /* 操作类型筛选 */
  if (query.action) {
    result = result.filter((l) => l.action === query.action);
  }

  /* 操作人模糊搜索 */
  if (query.username) {
    const keyword = query.username.toLowerCase();
    result = result.filter((l) => l.username.toLowerCase().includes(keyword));
  }

  /* 状态筛选 */
  if (query.status) {
    result = result.filter((l) => l.status === query.status);
  }

  return result;
}
