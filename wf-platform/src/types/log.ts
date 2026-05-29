/**
 * @file 审计日志类型定义
 * @module types/log
 * @description 定义审计日志体系的核心数据结构，包括日志条目、查询条件、分页响应等接口/枚举。
 *             所有与审计日志相关的类型定义集中在此，便于统一维护和跨模块引用。
 *
 * 依赖关系：
 *   - 被引用于: composables/useAuditLog.ts, views/system/log/index.vue, utils/request.ts, stores/user.ts
 *   - 依赖于: 无（纯类型定义）
 */

// ==================== 枚举定义 ====================

/**
 * 操作模块枚举
 * 标识操作所属的业务模块，用于日志分类和筛选
 */
export enum AuditModule {
  /** 认证模块：登录、登出、刷新 Token */
  AUTH = "auth",
  /** 用户管理模块：CRUD 操作 */
  USER = "user",
  /** 任务看板模块：任务 CRUD 操作 */
  TASK = "task",
  /** 系统管理模块：系统配置、审计日志等 */
  SYSTEM = "system",
}

/**
 * 操作类型枚举
 * 标识具体的用户行为动作
 */
export enum AuditAction {
  /** 登录 */
  LOGIN = "login",
  /** 登出 */
  LOGOUT = "logout",
  /** 新建/创建 */
  CREATE = "create",
  /** 编辑/更新 */
  UPDATE = "update",
  /** 删除 */
  DELETE = "delete",
  /** 查询（仅手动埋点使用）*/
  QUERY = "query",
}

// ==================== 接口定义 ====================

/**
 * 单条审计日志记录
 *
 * @property id - 唯一标识符（格式：log_时间戳_随机串）
 * @property userId - 操作人 ID（未登录时为 null）
 * @property username - 操作人用户名（未登录时为 "anonymous"）
 * @property module - 所属业务模块
 * @property action - 操作类型
 * @property method - HTTP 请求方法（GET/POST/PUT/DELETE）
 * @property url - 请求 URL 路径
 * @property params - 请求参数对象（敏感字段已脱敏）
 * @property ip - 客户端 IP 地址（Mock 阶段固定值）
 * @property userAgent - 浏览器 User-Agent 字符串
 * @property status - 操作结果状态
 * @property createTime - 日志生成时间（ISO 8601 格式）
 */
export interface AuditLog {
  id: string;
  userId: number | null;
  username: string;
  module: AuditModule;
  action: AuditAction;
  method: string;
  url: string;
  params: Record<string, unknown>;
  ip: string;
  userAgent: string;
  status: "success" | "fail";
  createTime: string;
}

/**
 * 审计日志列表查询条件
 *
 * @property page - 当前页码（从 1 开始）
 * @property pageSize - 每页显示条数
 * @property startTime - 查询起始时间（ISO 格式，可选）
 * @property endTime - 查询结束时间（ISO 格式，可选）
 * @property module - 模块筛选条件（可选）
 * @property action - 操作类型筛选条件（可选）
 * @property username - 操作人模糊搜索（可选）
 * @property status - 结果状态筛选（可选）
 */
export interface AuditLogQuery {
  page: number;
  pageSize: number;
  startTime?: string;
  endTime?: string;
  module?: AuditModule;
  action?: AuditAction;
  username?: string;
  status?: "success" | "fail";
}

/**
 * 审计日志分页响应结构
 *
 * @property list - 当前页的日志列表
 * @property total - 符合条件的总记录数
 * @property page - 当前页码
 * @property pageSize - 每页条数
 */
export interface AuditLogPageResult {
  list: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}
