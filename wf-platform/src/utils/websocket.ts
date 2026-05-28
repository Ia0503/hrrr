/**
 * @file WebSocket 管理模块（基于 socket.io-client）
 * @module utils/websocket
 * @description 提供全应用唯一的 WebSocket 连接管理入口，包含单例模式 WebSocketManager 类、统一的连接/断开/监听/发送 API、
 *             自动重连机制（最多 5 次，指数退避）、响应式连接状态（基于 Vue ref）以及完整的事件生命周期日志。
 *
 * 依赖关系：
 *   - 被引用于: stores/task.ts, views/task/board.vue, 全局需要实时通信的模块
 *   - 依赖于: socket.io-client, vue（ref）
 */

/**
 * WebSocket 管理模块（基于 socket.io-client）
 * 提供全应用唯一的 WebSocket 连接管理入口，包含：
 *   - 单例模式 WebSocketManager 类
 *   - 统一的连接/断开/监听/发送 API
 *   - 自动重连机制（最多 5 次，指数退避）
 *   - 响应式连接状态（基于 Vue ref）
 *   - 完整的事件生命周期日志
 *
 * @module utils/websocket
 *
 * @example
 * ```ts
 * import { getWebSocketManager, SocketEvent, ConnectionStatus } from '@/utils/websocket';
 *
 * // 获取单例并连接
 * const ws = getWebSocketManager();
 * await ws.connect('wss://api.example.com', 'your-token');
 *
 * // 监听任务更新事件
 * ws.on<TaskData>(SocketEvent.TASK_UPDATED, (payload) => {
 *   console.log('任务更新:', payload.data);
 * });
 *
 * // 发送消息到服务端
 * ws.emit('chat:message', { content: 'Hello' });
 *
 * // 断开连接
 * ws.disconnect();
 * ```
 */

import { io, type Socket } from "socket.io-client";
import { ref, type Ref } from "vue";

// ==================== 类型定义 ====================

/**
 * Socket 事件名称枚举
 * 定义所有业务事件类型，与服务端保持一致
 */
export enum SocketEvent {
  /** 任务被其他用户更新（状态变更、字段修改等） */
  TASK_UPDATED = "task:updated",
  /** 任务被删除 */
  TASK_DELETED = "task:deleted",
  /** 新任务创建 */
  TASK_CREATED = "task:created",
  /** 看板列顺序变更（同列拖拽排序） */
  COLUMN_REORDERED = "column:reordered",
  /** 用户上线/离线通知 */
  USER_PRESENCE = "user:presence",
  /** 服务端心跳响应（用于检测连接活性） */
  PONG = "pong",
}

/**
 * 泛型信封接口
 * 所有通过 WebSocket 传输的数据都包裹在此结构中，
 * 用于统一消息格式、去重和追踪
 *
 * @template T - 实际业务数据载荷的类型
 */
export interface SocketPayload<T = unknown> {
  /** 事件唯一标识 UUID，用于去重和追踪 */
  eventId: string;
  /** 事件发生时间戳（ISO 8601 格式） */
  timestamp: string;
  /** 触发该事件的用户信息 */
  sender: {
    userId: number | string;
    username: string;
  };
  /** 实际业务数据载荷 */
  data: T;
}

/**
 * WebSocket 连接状态枚举
 * 用于响应式展示当前连接状态
 */
export enum ConnectionStatus {
  /** 未连接 */
  DISCONNECTED = "disconnected",
  /** 正在连接 */
  CONNECTING = "connecting",
  /** 已连接 */
  CONNECTED = "connected",
  /** 重连中 */
  RECONNECTING = "reconnecting",
  /** 连接出错 */
  ERROR = "error",
}

// ==================== 单例类：WebSocketManager ====================

/**
 * WebSocket 单例管理器
 *
 * 设计要点：
 *   1. 单例模式 —— 全应用只有一个实例，避免重复连接
 *   2. 响应式状态 —— status 基于 Vue ref()，可在模板中直接使用
 *   3. 自动重连 —— socket.io 内置重连 + 应用层最大尝试次数限制
 *   4. 统一日志 —— 所有关键操作均有 [ws] 前缀日志输出
 *
 * 使用方式：
 *   通过 getWebSocketManager() 获取实例，不要直接 new
 */
class WebSocketManager {
  // ==================== 私有属性 ====================

  /**
   * 底层 socket.io 实例（懒初始化）
   * 首次调用 connect() 时创建，disconnect 时置为 null
   */
  private socket: Socket | null = null;

  /**
   * 响应式连接状态
   * 基于 Vue 的 ref()，组件中可直接 watch 或在模板中使用
   */
  private status: Ref<ConnectionStatus> = ref(ConnectionStatus.DISCONNECTED);

  /**
   * 存储的服务端 URL（用于重连时复用）
   */
  private serverUrl: string | null = null;

  /**
   * 当前已发起的重连尝试次数（累计值）
   */
  private reconnectAttemptsMade: number = 0;

  /**
   * 最大重连尝试次数常量
   * 超过此次数后触发降级处理（提示用户刷新页面）
   */
  private readonly MAX_RECONNECT_ATTEMPTS: number = 5;

  /**
   * 重连基础延迟时间（毫秒）
   * socket.io 会在此基础上做指数退避（jitter），实际延迟会递增
   */
  private readonly RECONNECT_DELAY_MS: number = 3000;

  // ==================== 构造函数（私有，强制单例）====================

  /**
   * 私有构造函数
   * 外部禁止直接 new，必须通过 getInstance() 获取实例
   */
  private constructor() {
    console.log("[ws] [INFO] WebSocketManager 单例已初始化");
  }

  // ==================== 单例入口 ====================

  /**
   * 单例实例持有者（静态属性）
   * 在首次调用 getInstance() 时赋值，之后永远返回同一实例
   */
  private static instance: WebSocketManager | null = null;

  /**
   * 获取 WebSocketManager 单例实例
   * 如果实例不存在则自动创建（懒加载）
   *
   * @returns {WebSocketManager} 全局唯一的 WebSocket 管理器实例
   *
   * @example
   * ```ts
   * const ws = getWebSocketManager(); // 推荐使用导出的便捷函数
   * // 或直接调用：
   * const ws = WebSocketManager.getInstance();
   * ```
   */
  static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  // ==================== 公共方法：连接 ====================

  /**
   * 建立 WebSocket 连接到指定服务端
   *
   * 行为说明：
   *   - 若已处于连接状态 → 输出警告并立即 resolve（不重复连接）
   *   - 否则创建新的 socket.io 实例并注册内置事件监听
   *   - 返回 Promise，在收到 'connect' 事件后 resolve
   *
   * @param url - 服务端 WebSocket 地址（如 wss://api.example.com 或 /socket.io）
   * @param token - 用户认证 Token（通过 auth 字段发送给服务端校验）
   * @returns {Promise<void>} 连接成功后 resolve
   *
   * @example
   * ```ts
   * await ws.connect('wss://api.example.com', userToken);
   * ```
   */
  async connect(url: string, token: string): Promise<void> {
    // 检查是否已连接（防止重复连接）
    if (this.socket?.connected) {
      console.warn("[ws] [WARN] 已处于连接状态，忽略重复连接请求");
      return;
    }

    /** 未配置 WS 服务地址时直接跳过，不发起无意义的连接尝试 */
    if (!url || url === "undefined" || url.trim() === "") {
      console.warn("[ws] [WARN] WebSocket URL 未配置 (VITE_WS_URL)，跳过连接");
      this.status.value = ConnectionStatus.DISCONNECTED;
      return Promise.resolve();
    }

    // 更新状态为"正在连接"
    this.status.value = ConnectionStatus.CONNECTING;
    this.serverUrl = url;

    console.log(`[ws] [INFO] 正在连接到服务器: ${url}`);

    return new Promise<void>((resolve, reject) => {
      // 创建 socket.io 实例（核心配置项见下方注释）
      this.socket = io(url, {
        auth: { token }, // 认证信息：服务端通过 socket.handshake.auth.token 获取
        transports: ["websocket"], // 强制仅使用 WebSocket 传输（禁用 HTTP 轮询降级，提升效率）
        reconnection: true, // 启用自动重连
        reconnectionAttempts: this.MAX_RECONNECT_ATTEMPTS, // 最大重连次数
        reconnectionDelay: this.RECONNECT_DELAY_MS, // 首次重连延迟（毫秒）
        reconnectionDelayMax: 10000, // 最大重连延迟上限（毫秒）
        timeout: 10000, // 连接超时时间（毫秒）
        autoConnect: true, // 创建实例后自动连接（默认 true）
      });

      // ====== 注册内置事件监听 ======

      /**
       * 连接成功事件
       * socket.io 握手完成、服务端确认连接后触发
       */
      this.socket.on("connect", () => {
        this.status.value = ConnectionStatus.CONNECTED;
        this.reconnectAttemptsMade = 0; // 重置重连计数
        console.log(`[ws] [INFO] 已连接到服务器 ${url}`);
        resolve(); // Promise resolve，通知调用方连接成功
      });

      /**
       * 断开连接事件
       * 可能原因：
       *   - "io server disconnect"：服务端主动断开（如 Token 失效、被踢下线）
       *   - "io client disconnect"：客户端主动调用 disconnect()
       *   - "ping timeout"：心跳超时
       *   - "transport close"：网络中断
       *   - "transport error"：传输层错误
       */
      this.socket.on("disconnect", (reason: string) => {
        console.warn(`[ws] [WARN] 连接断开，原因: ${reason}`);
        this.status.value = ConnectionStatus.DISCONNECTED;

        // 服务端主动断开 → 尝试自动重连
        if (reason === "io server disconnect") {
          console.log("[ws] [INFO] 服务端主动断开，尝试自动重连...");
          this.socket?.connect();
        }
      });

      /**
       * 连接错误事件
       * 触发场景：服务端不可达、认证失败、CORS 错误等
       */
      this.socket.on("connect_error", (error: Error) => {
        console.error("[ws] [ERROR] 连接错误:", error.message);
        this.status.value = ConnectionStatus.ERROR;
        reject(error); // Promise reject，通知调用方连接失败
      });

      /**
       * 正在重连事件
       * socket.io 自动触发重连时回调，attemptNum 为当前第几次尝试
       */
      this.socket.on("reconnect", (attemptNum: number) => {
        this.reconnectAttemptsMade = attemptNum;
        this.status.value = ConnectionStatus.RECONNECTING;
        console.log(
          `[ws] [INFO] 正在重连... 第 ${attemptNum} 次 / 最大 ${this.MAX_RECONNECT_ATTEMPTS} 次`,
        );
      });

      /**
       * 重连失败事件
       * 达到最大重连次数仍未成功时触发
       */
      this.socket.on("reconnect_failed", () => {
        console.error(
          `[ws] [ERROR] 重连失败，已达最大尝试次数 (${this.MAX_RECONNECT_ATTEMPTS})`,
        );
        this.status.value = ConnectionStatus.ERROR;
        this._handleReconnectFailure(); // 执行降级处理
      });

      /**
       * 重连成功事件
       * 重连过程中某次尝试成功后触发
       */
      this.socket.on("reconnect_success", () => {
        console.log("[ws] [INFO] 重连成功");
        this.status.value = ConnectionStatus.CONNECTED;
        this.reconnectAttemptsMade = 0; // 重置计数
      });
    });
  }

  // ==================== 公共方法：断开 ====================

  /**
   * 手动断开 WebSocket 连接
   *
   * 行为说明：
   *   - 调用 socket.disconnect() 关闭底层连接
   *   - 清空 socket 引用和所有事件监听器（防止内存泄漏）
   *   - 将状态重置为 DISCONNECTED
   *   - 若当前无活跃连接，静默返回（不报错）
   */
  disconnect(): void {
    if (!this.socket) {
      console.log("[ws] [INFO] 当前无活跃连接，无需断开");
      return;
    }

    console.log("[ws] 正在断开连接...");

    // 关闭底层连接
    this.socket.disconnect();

    // 移除所有事件监听器（防止内存泄漏）
    this.socket.removeAllListeners();

    // 清空引用
    this.socket = null;
    this.serverUrl = null;
    this.reconnectAttemptsMade = 0;

    // 更新状态
    this.status.value = ConnectionStatus.DISCONNECTED;

    console.log("[ws] 已手动断开连接");
  }

  // ==================== 公共方法：监听事件 ====================

  /**
   * 注册服务端事件的监听器
   *
   * @template T - 业务数据的类型（对应 SocketPayload<T>.data）
   * @param event - 要监听的事件名称（字符串或 SocketEvent 枚举值）
   * @param callback - 回调函数，接收完整的 SocketPayload 信封对象
   *
   * @example
   * ```ts
   * // 监听任务更新事件
   * ws.on<{ id: string; status: string }>(SocketEvent.TASK_UPDATED, (payload) => {
   *   console.log(`用户 ${payload.sender.username} 更新了任务`, payload.data);
   * });
   *
   * // 监听自定义事件
   * ws.on<any>('notification:new', (payload) => {
   *   console.log('新通知:', payload.data);
   * });
   * ```
   */
  on<T>(
    event: string | SocketEvent,
    callback: (payload: SocketPayload<T>) => void,
  ): void {
    if (!this.socket) {
      console.warn("[ws] [WARN] 未连接，无法注册监听器");
      return;
    }

    this.socket.on(event, callback);
    console.log(`[ws] [INFO] 注册监听: ${event}`);
  }

  // ==================== 公共方法：移除监听 ====================

  /**
   * 移除服务端事件的监听器
   *
   * @param event - 要移除监听的事件名称
   * @param callback - 可选，指定要移除的具体回调函数。
   *                   若不传，则移除该事件的所有监听器
   *
   * @example
   * ```ts
   * // 移除某个特定回调
   * function onTaskUpdate(payload) { ... }
   * ws.on(SocketEvent.TASK_UPDATED, onTaskUpdate);
   * ws.off(SocketEvent.TASK_UPDATED, onTaskUpdate); // 只移除这一个
   *
   * // 移除事件的所有监听器
   * ws.off(SocketEvent.TASK_CREATED);
   * ```
   */
  off(event: string | SocketEvent, callback?: (...args: unknown[]) => void): void {
    if (!this.socket) {
      console.warn("[ws] [WARN] 未连接，无法移除监听器");
      return;
    }

    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event); // 不传 callback 则移除该事件的所有监听器
    }

    console.log(`[ws] [INFO] 移除监听: ${event}${callback ? " (指定回调)" : " (全部)"}`);
  }

  // ==================== 公共方法：发送消息 ====================

  /**
   * 向服务端发送消息/事件
   *
   * @param event - 事件名称（如 'chat:message'、'task:create' 等）
   * @param data - 要发送的数据载荷（任意类型）
   *
   * @example
   * ```ts
   * // 发送聊天消息
   * ws.emit('chat:message', { roomId: 'room-1', content: 'Hello!' });
   *
   * // 发送任务操作
   * ws.emit('task:move', { taskId: '123', columnId: 'col-2' });
   * ```
   */
  emit(event: string, data: unknown): void {
    if (!this.socket || !this.socket.connected) {
      console.warn(`[ws] [WARN] 未连接或连接已断开，无法发送消息: ${event}`);
      return;
    }

    this.socket.emit(event, data);
    console.log(`[ws] [INFO] 发送消息: ${event}`, data);
  }

  // ==================== 公共方法：获取状态 ====================

  /**
   * 获取当前连接状态
   *
   * @returns {ConnectionStatus} 当前连接状态枚举值
   *
   * 注意：如果需要响应式状态（如在 Vue 组件中使用），
   * 请直接访问暴露的 status Ref（通过 getStatusRef 方法或后续扩展）
   */
  getStatus(): ConnectionStatus {
    return this.status.value;
  }

  /**
   * 获取响应式的连接状态引用
   * 可在 Vue 组件中直接 watch 或在模板中使用
   *
   * @returns {Ref<ConnectionStatus>} Vue 响应式引用
   *
   * @example
   * ```vue
   * <script setup lang="ts">
   * import { getWebSocketManager } from '@/utils/websocket';
   * import { watch } from 'vue';
   *
   * const ws = getWebSocketManager();
   * const connectionStatus = ws.getStatusRef();
   *
   * watch(connectionStatus, (newStatus) => {
   *   console.log('连接状态变更:', newStatus);
   * });
   * </script>
   *
   * <template>
   *   <div :class="`status-${connectionStatus}`">
   *     {{ connectionStatus }}
   *   </div>
   * </template>
   * ```
   */
  getStatusRef(): Ref<ConnectionStatus> {
    return this.status;
  }

  // ==================== 私有方法：重连失败降级处理 ====================

  /**
   * 重连失败的降级处理逻辑
   *
   * 当达到最大重连次数仍无法恢复连接时调用此方法：
   *   1. 输出明确的错误提示到控制台
   *   2. 建议用户刷新页面或检查网络环境
   *   3. 未来可扩展为：弹出全局 Toast 通知、跳转错误页等
   *
   * 此方法为内部降级策略的入口点，可根据业务需求扩展
   */
  private _handleReconnectFailure(): void {
    console.group("[ws] [ERROR] 连接降级警告");
    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    console.error("[WARN]  WebSocket 连接已彻底丢失");
    console.error(
      `[WARN]  已尝试重连 ${this.MAX_RECONNECT_ATTEMPTS} 次均未成功`,
    );
    console.error("");
    console.error("建议操作：");
    console.error("  1. 检查网络连接是否正常");
    console.error("  2. 刷新页面重新建立连接");
    console.error("  3. 若问题持续，请联系技术支持");
    console.error(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    );
    console.groupEnd();

    // TODO: 未来可扩展的降级方案
    // - 方案 A：触发全局事件，由 UI 层弹出 Toast 提示用户
    //   window.dispatchEvent(new CustomEvent('ws:connection-lost'));
    //
    // - 方案 B：调用全局消息通知库（如 Element Plus ElMessage）
    //   ElMessage.warning('实时连接已断开，部分功能可能不可用');
    //
    // - 方案 C：自动跳转到维护/离线页面
    //   router.push('/offline');

    console.warn(
      "[ws] [INFO] 提示：可在此处扩展全局通知或页面跳转等降级逻辑",
    );
  }
}

// ==================== 心跳机制说明 ====================

/**
 * 关于心跳机制的说明
 *
 * socket.io 内置了基于 ping/pong 的心跳检测机制（默认 25 秒间隔）：
 *
 * 工作原理：
 *   1. 服务端定期向客户端发送 ping 包
 *   2. 客户端收到后自动回复 pong 包
 *   3. 若服务端在超时时间内未收到 pong，判定连接失效并断开
 *
 * 本实现的处理方式：
 *   - 不自行实现自定义心跳定时器（避免与 socket.io 内置机制冲突）
 *   - 利用 socket.io 原生心跳检测连接活性
 *   - 通过监听 disconnect 事件（reason === "ping timeout"）感知心跳超时
 *   - 如需应用层心跳日志，可监听 SocketEvent.PONG 事件（需服务端配合发送）
 *
 * 配置建议（在服务端 socket.io 配置中调整）：
 *   - pingInterval: 25000（ping 发送间隔，默认 25s）
 *   - pingTimeout: 20000（等待 pong 的超时时间，默认 20s）
 *   - 若网络环境较差可适当增大这两个值
 */

// ==================== 导出便捷函数 ====================

/**
 * 获取 WebSocketManager 单例实例的便捷函数
 * 推荐使用此函数而非直接调用 WebSocketManager.getInstance()
 *
 * @returns {WebSocketManager} 全局唯一的 WebSocket 管理器实例
 *
 * @example
 * ```ts
 * import { getWebSocketManager, SocketEvent, ConnectionStatus } from '@/utils/websocket';
 *
 * const ws = getWebSocketManager();
 * await ws.connect(import.meta.env.VITE_WS_URL, token);
 * ```
 */
export function getWebSocketManager(): WebSocketManager {
  return WebSocketManager.getInstance();
}

// ==================== 默认导出 ====================

export default WebSocketManager;
