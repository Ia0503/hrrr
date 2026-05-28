/**
 * 路由配置模块
 * 创建并配置 Vue Router 实例，定义静态路由表
 *
 * 功能说明：
 *   - 使用 HTML5 History 模式（去除 URL 中的 # 号）
 *   - 定义静态路由（登录页、404 兜底等）
 *   - 动态路由在路由守卫中按需添加（见 guards.ts）
 *
 * 路由结构：
 *   静态路由（本文件定义）:
 *     /login → 登录页面
 *     /:pathMatch(.*)* → 404 未找到页面（必须在动态路由之后添加）
 *
 *   动态路由（由后端菜单生成，见 dynamicRoutes.ts）:
 *     /dashboard → 仪表盘
 *     /system → 系统管理（父级）
 *     /system/user → 用户管理
 */

import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw } from "vue-router";

// ==================== 类型导入 ====================

// 路由记录类型（Vue Router 内置类型，用于类型注解）

// ==================== 常量定义 ====================

/**
 * 应用基础路径（Base URL）
 * 用于部署到子目录时的路径前缀
 *
 * 使用场景：
 *   - 根目录部署："/" （默认值，最常见）
 *   - 子目录部署："/app/" 或 "/admin/"
 *
 * ⚠️ 注意事项：
 *   - 必须以 "/" 开头和结尾（子目录模式）
 *   - 修改后需同步更新 vite.config.ts 的 base 配置
 *   - Nginx/Apache 也需配置对应的 rewrite 规则
 */
const ROUTER_BASE_PATH = "/";

// ==================== 静态路由定义 ====================

/**
 * 静态路由表数组
 * 包含所有不需要权限验证或固定存在的路由
 *
 * 设计原则：
 *   - 登录页必须放在静态路由中（未登录时需要访问）
 *   - 404 页面放在最后作为兜底（通配符匹配）
 *   - 业务页面通过动态路由按需加载（根据用户权限）
 */
const staticRoutes: RouteRecordRaw[] = [
  // ==================== 根路径重定向 ====================
  /**
   * 根路径重定向到仪表盘
   * 访问 http://localhost:5177/ 时自动跳转到 /dashboard
   */
  {
    path: "/",
    redirect: "/dashboard",
  },

  // ==================== 登录页路由 ====================
  {
    /**
     * 登录页路由配置
     * 路径：/login
     * 组件：views/login/index.vue
     *
     * 元信息说明：
     *   - title: 页面标题（用于浏览器标签、面包屑等）
     *   - hidden: 是否在侧边栏隐藏（true=隐藏，false=显示）
     */
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: {
      title: "登录",
      hidden: true, // 登录页不在侧边栏菜单中显示
    },
  },

  /* 404 兜底路由说明：
   * 此路由不能在此处直接注册！
   * 必须在动态路由全部添加完成后再注册，否则会拦截所有动态路由。
   *
   * 正确做法：
   *   1. 在 src/router/guards.ts 的 setupRouterGuards() 函数末尾添加
   *   2. 或者在 main.ts 中 router 守卫初始化之后添加
   *
   * 404 路由配置示例（供参考）：
   *   {
   *     path: '/:pathMatch(.*)*',
   *     name: 'NotFound',
   *     component: () => import('@/views/error/404.vue'),
   *     meta: {
   *       title: '页面未找到',
   *       hidden: true,
   *     },
   *   },
   */
];

// ==================== Router 实例创建 ====================

/**
 * 创建 Vue Router 实例
 * 使用 HTML5 History 模式实现客户端路由
 *
 * History 模式 vs Hash 模式对比：
 *   - History 模式：URL 更美观（无 # 号），但需要服务器配置支持
 *   - Hash 模式：兼容性更好（无需服务器配置），但 URL 不够优雅
 *
 * 当前选择 History 模式（createWebHistory），适合现代 SPA 应用
 *
 * @returns Router - 配置好的 Vue Router 实例对象
 */
const router = createRouter({
  // 使用 HTML5 History API（去除 URL 中的 #）
  history: createWebHistory(ROUTER_BASE_PATH),

  // 静态路由表（初始路由列表，后续可动态添加）
  routes: staticRoutes,

  /**
   * 路由滚动行为配置
   * 控制页面跳转时的滚动位置
   *
   * 可选值：
   *   - 返回 { top: 0, left: 0 } → 滚动到页面顶部
   *   - 返回 el 选择器 → 滚动到指定元素
   *   - 返回 false → 保持原位置不滚动
   *
   * 当前配置：每次导航都滚动到顶部（适合多页面应用）
   */
  scrollBehavior(_to, _from, savedPosition) {
    // 如果有保存的位置（浏览器前进/后退），恢复该位置
    if (savedPosition) {
      return savedPosition;
    }

    // 否则滚动到页面顶部
    return { top: 0, left: 0 };
  },

  /* 其他可配置项（当前使用默认值）：
   * strictQuery: boolean - 是否严格区分查询参数（默认 false）
   * parseQuery: (search: string) => Record<string, string> - 自定义查询参数解析
   * stringifyQuery: (query: Record<string, string>) => string - 自定义查询参数序列化
   */
});

// ==================== 导出 ====================

/**
 * 导出 Router 实例
 * 供 main.ts 和其他模块使用
 *
 * 使用方式：
 * ```ts
 * import router from '@/router';
 *
 * app.use(router);
 * ```
 */
export default router;
