/**
 * @file 权限控制自定义指令
 * @module directives/permission
 * @description 实现 v-permission 指令，用于按钮/元素级别的权限控制。根据用户权限码动态显示或移除 DOM 元素，
 *             支持单个权限码或权限码数组（满足任一即显示），无权限时自动从 DOM 中移除元素（而非隐藏）。
 *
 * 依赖关系：
 *   - 被引用于: main.ts（全局注册），需要权限控制的组件
 *   - 依赖于: stores/user.ts, vue（Directive 类型）
 */

/**
 * 权限控制自定义指令
 * 实现 v-permission 指令，用于按钮/元素级别的权限控制
 *
 * 功能说明：
 *   - 根据用户权限码动态显示或移除 DOM 元素
 *   - 支持单个权限码或权限码数组（满足任一即显示）
 *   - 无权限时自动从 DOM 中移除元素（而非隐藏）
 *
 * 使用方式：
 * ```vue
 * <!-- 单个权限码 -->
 * <button v-permission="'user:create'">创建用户</button>
 *
 * <!-- 多个权限码（满足任一即可） -->
 * <button v-permission="['user:delete', 'admin:manage']">删除</button>
 *
 * <!-- 管理员通配符 -->
 * <button v-permission="['*']">管理员专属功能</button>
 * ```
 *
 * 设计原理：
 *   - 使用 DOM 移除（removeChild）而非 CSS 隐藏（display: none）
 *   - 原因：隐藏的元素仍可通过开发者工具看到，存在安全隐患
 *   - 移除后元素完全不存在于 DOM 树中，更安全可靠
 */

import type { Directive, DirectiveBinding } from "vue";
import { useUserStore } from "@/stores/user";

// ==================== 类型定义 ====================

/**
 * 指令绑定值类型
 * v-permission 的参数可以是字符串或字符串数组
 *
 * @example
 * // 单个权限码
 * v-permission="'task:create'"
 *
 * // 多个权限码（OR 逻辑）
 * v-permission="['task:delete', 'admin:all']"
 */
type PermissionValue = string | string[];

// ==================== 指令实现 ====================

/**
 * v-permission 自定义指令配置对象
 * 实现基于权限码的 DOM 元素显隐控制
 *
 * 指令生命周期：
 *   - mounted: 元素首次插入 DOM 时触发（执行权限检查）
 *   - updated: 绑定值更新时重新检查（可选实现）
 *
 * @property mounted - 元素挂载时的回调函数
 *
 * 执行流程：
 *   1. 从 binding.value 获取所需的权限码列表
 *   2. 从 userStore 获取当前用户的实际权限列表
 *   3. 判断是否存在交集（用户拥有任一所需权限）
 *   4. 有权限 → 保持元素不变
 *   5. 无权限 → 从 DOM 中移除元素并输出警告日志
 */
export const permissionDirective: Directive = {
  /**
   * 指令钩子：元素挂载到 DOM 后调用
   * 在此时机执行权限校验，决定是否保留该元素
   *
   * @param el - 指令绑定的 DOM 元素（HTMLElement）
   * @param binding - 指令绑定对象，包含以下属性：
   *   - value: 指令的绑定值（v-permission="value" 中的 value）
   *   - oldValue: 之前的绑定值（仅在 updated 时可用）
   *   - arg: 指令的参数（v-permission:arg 中的 arg）
   *   - modifiers: 包含修饰符的对象（v-permission.modifier 中的 modifier）
   *   - instance: 使用该指令的组件实例
   *
   * ⚠️ 重要说明：
   *   - 此函数在组件渲染阶段同步执行
   *   - 避免在此进行异步操作（如 API 请求），可能导致闪烁
   *   - 权限数据应在路由守卫阶段预先加载完成
   */
  mounted(el: HTMLElement, binding: DirectiveBinding<PermissionValue>) {
    console.log(
      "[permission-directive] 正在执行权限检查...",
      el,
      binding.value,
    );

    // 获取用户 Store 实例（访问当前用户的权限列表）
    const userStore = useUserStore();

    // 提取指令绑定的权限码（支持字符串和数组格式）
    const requiredPermissions: string[] = Array.isArray(binding.value)
      ? binding.value
      : [binding.value];

    // 校验绑定值是否有效（防御性编程）
    if (requiredPermissions.length === 0 || !requiredPermissions[0]) {
      console.warn(
        "[permission-directive] [WARN] v-permission 绑定值为空，默认显示元素",
      );
      return; // 空值时默认放行（不移除元素）
    }

    // 获取当前用户的实际权限列表（从 Store 中读取）
    const userPermissions: string[] = userStore.permissions;

    console.log(
      `[permission-directive] 所需权限: [${requiredPermissions.join(", ")}], 用户权限: [${userPermissions.join(", ")}]`,
    );

    /**
     * 权限判断逻辑（OR 关系）
     * 检查用户是否拥有所需权限中的任一个
     *
     * 判断规则：
     *   1. 用户拥有 "*" 通配符权限（管理员）→ 直接通过
     *   2. 用户权限与所需权限存在交集 → 通过
     *   3. 完全不匹配 → 移除元素
     *
     * some() 方法说明：
     *   - 数组方法，测试是否至少有一个元素通过测试
     *   - 找到符合条件的元素后立即返回 true（短路求值）
     *   - 性能优于 filter().length > 0（无需遍历全部）
     */
    const hasPermission: boolean = requiredPermissions.some(
      (requiredPerm: string) => {
        // 管理员通配符检查（"*" 表示所有权限）
        if (requiredPerm === "*") {
          return userPermissions.includes("*");
        }

        // 具体权限码检查
        return userPermissions.includes(requiredPerm);
      },
    );

    // 根据判断结果处理 DOM 元素
    if (!hasPermission) {
      // ==================== 无权限处理逻辑 ====================
      console.warn(
        `[permission-directive] [ERROR] 权限不足，已移除元素。缺少权限: [${requiredPermissions.join(", ")}]`,
      );

      /**
       * 从 DOM 中移除元素
       * 使用 parentNode.removeChild() 彻底删除节点
       *
       * 为什么选择 removeChild 而非 display:none？
       *   安全性：
       *     - display:none 只是视觉隐藏，DOM 仍存在
       *     - 开发者工具可轻松修改样式使其可见
       *     - 存在越权操作的安全隐患
       *
       *   性能：
       *     - 移除后的元素不再参与布局计算
     *     - 减少不必要的 DOM 节点数量
     *
       *   用户体验：
       *     - 页面加载时无权限元素不会短暂闪现
     *     - 避免用户看到无权操作的按钮/链接
       *
       * ⚠️ 注意事项：
       *   - 一旦移除无法恢复（除非重新渲染组件）
       *   - 如果需要动态切换权限，建议使用 v-if 替代本指令
       */
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      } else {
        // 极端情况：元素没有父节点（理论上不应发生）
        console.error(
          "[permission-directive] [ERROR] 无法移除元素：parentNode 不存在",
        );

        /* 降级方案：
         * 当 removeChild 失败时，回退到 CSS 隐藏方式
         * 虽然安全性较低，但能保证基本功能正常
         */
        el.style.display = "none";
        el.setAttribute("data-permission-denied", "true"); // 标记已隐藏
      }
    } else {
      // ==================== 有权限处理逻辑 ====================
      console.log(
        `[permission-directive] [INFO] 权限检查通过，保留元素`,
      );

      // 可选：为有权限的元素添加标记（便于调试）
      el.setAttribute("data-permission-granted", "true");
    }
  },

  /* 可选增强：updated 钩子（当前未启用）
   * 当指令的绑定值更新时重新执行权限检查
   * 适用场景：动态切换权限码（较少使用）
   *
   * updated(el: HTMLElement, binding: DirectiveBinding<PermissionValue>) {
   *   // 重新执行权限检查逻辑（与 mounted 相同）
   *   // 注意：如果元素已被移除，此钩子不会被调用
   * },
   */
};

// ==================== 导出 ====================

/**
 * 导出指令配置对象
 * 供 main.ts 注册到全局 Vue 应用实例
 *
 * 注册方式：
 * ```ts
 * import { permissionDirective } from '@/directives/permission';
 *
 * app.directive('permission', permissionDirective);
 * ```
 *
 * 或者在组件中局部注册：
 * ```ts
 * directives: {
 *   permission: permissionDirective,
 * }
 * ```
 */
export default permissionDirective;
