/**
 * 路由守卫模块
 * 实现全局前置守卫，控制页面访问权限和动态路由加载
 *
 * 功能说明：
 *   - 白名单路径放行（无需登录即可访问）
 *   - 未登录用户重定向到登录页
 *   - 已登录用户访问登录页时重定向到首页
 *   - 首次访问时自动获取用户信息并生成动态路由
 *   - 确保动态路由只添加一次（避免重复注册）
 *
 * 执行流程图：
 *   用户访问 → 检查白名单 → 是 → 直接放行
 *              ↓ 否
 *           检查 Token → 无 → 跳转登录页
 *              ↓ 有
 *           目标是 /login? → 是 → 跳转首页
 *              ↓ 否
 *           已有用户信息? → 是 → 放行
 *              ↓ 否
 *           获取用户信息 → 生成动态路由 → 添加到 router → 重新导航
 */

import type { Router } from "vue-router";
import { useUserStore } from "@/stores/user";
import { generateRoutes } from "./dynamicRoutes";

// ==================== 常量定义 ====================

/**
 * 路由白名单数组
 * 列出无需身份验证即可访问的路径
 *
 * 使用场景：
 *   - 登录页（用户未登录时的入口）
 *   - 公开页面（如帮助文档、关于我们等）
 *   - 第三方回调页（如 OAuth 授权回调）
 *
 * ⚠️ 注意事项：
 *   - 路径需与路由配置中的 path 完全匹配（区分大小写）
 *   - 如需支持子路径，请使用正则表达式或通配符
 *   - 新增公开页面时必须同步更新此数组
 */
const WHITE_LIST: string[] = ["/login"];

// ==================== 核心函数 ====================

/**
 * 设置路由守卫
 * 在 Vue Router 实例上注册全局前置守卫（beforeEach）
 *
 * @param router - Vue Router 实例对象（从 src/router/index.ts 导出）
 * @param userStore - 用户状态管理 Store 实例（可选，内部会自动获取）
 *
 * 调用时机：
 *   - 通常在 main.ts 或应用入口文件中调用
 *   - 必须在 router 创建之后、app.mount() 之前调用
 *
 * 使用示例：
 * ```ts
 * // main.ts
 * import { createApp } from 'vue';
 * import App from './App.vue';
 * import router from './router';
 * import { setupRouterGuards } from './router/guards';
 *
 * const app = createApp(App);
 * setupRouterGuards(router);
 * app.use(router);
 * app.mount('#app');
 * ```
 */
export function setupRouterGuards(
  router: Router,
  userStore?: ReturnType<typeof useUserStore>,
): void {
  console.log("[router-guards] ✅ 正在初始化路由守卫...");

  /**
   * 全局前置守卫函数
   * 在每次路由跳转前执行，用于权限校验和动态路由加载
   *
   * @param to - 即将进入的目标路由对象（RouteLocationNormalized）
   * @param _from - 当前离开的路由对象（RouteLocationNormalized，未使用）
   * @param next - 导航控制函数，决定是否允许跳转或重定向
   *
   * next() 的使用方式：
   *   - next() → 允许导航（放行）
   *   - next('/path') → 重定向到指定路径
   *   - next(false) → 取消当前导航
   *   - next({ ...to, replace: true }) → 用新目标替换当前历史记录
   */
  router.beforeEach(async (to, _from, next) => {
    console.log(
      `[router-guards] 📍 路由跳转: ${_from.path} → ${to.path}`,
    );

    // 获取用户 Store 实例（如果外部未传入则内部创建）
    const store = userStore || useUserStore();

    // ==================== 步骤 1: 白名单检查 ====================
    // 白名单中的路径直接放行，无需验证 Token
    if (WHITE_LIST.includes(to.path)) {
      console.log(`[router-guards] ✅ 白名单路径放行: ${to.path}`);
      return next();
    }

    // ==================== 步骤 2: Token 存在性检查 ====================
    // 从 Store 中获取当前 Token（Token 来源：localStorage 或内存状态）
    const token = store.token;

    if (!token) {
      // 无 Token → 用户未登录 → 重定向到登录页
      console.warn(
        `[router-guards] ⚠️ 无有效 Token，重定向到登录页: ${to.path}`,
      );

      // 将目标路径作为查询参数传递，方便登录后回跳
      // 示例：/login?redirect=/dashboard
      return next({
        path: "/login",
        query: { redirect: to.fullPath },
      });
    }

    // ==================== 步骤 3: 登录页重复访问检查 ====================
    // 已有 Token 但访问登录页 → 重定向到首页（避免重复登录）
    if (to.path === "/login") {
      console.log(
        "[router-guards] 🔄 已登录用户访问登录页，重定向到首页",
      );
      return next({ path: "/" });
    }

    // ==================== 步骤 4: 用户信息检查与动态路由加载 ====================
    if (!store.userInfo) {
      console.log(
        "[router-guards] 🔍 首次访问，正在获取用户信息和动态路由...",
      );

      try {
        // 调用 getUserInfo() 获取用户详细信息、角色、权限和菜单树
        await store.getUserInfo();

        console.log(
          `[router-guards] ✅ 用户信息获取成功: username=${store.userInfo?.username}`,
        );

        // 检查是否已添加过动态路由（避免重复添加导致警告）
        if (!store.isDynamicRoutesAdded && store.userInfo?.menuList) {
          // 调用 generateRoutes() 将菜单树转换为路由配置
          const dynamicRoutes = generateRoutes(store.userInfo.menuList);

          console.log(
            `[router-guards] 🛠️ 正在添加 ${dynamicRoutes.length} 个动态路由...`,
          );

          // 遍历生成的路由配置，逐一添加到 router 实例
          dynamicRoutes.forEach((route) => {
            router.addRoute(route);
          });

          // 追加 404 兜底路由（必须放在所有动态路由之后）
          // 确保通配符不会优先于业务路由匹配
          // ⚠️ 此处使用懒加载，仅在实际访问 404 时才加载组件
          router.addRoute({
            path: "/:pathMatch(.*)*",
            name: "NotFound",
            component: () => import("@/views/error/404.vue"),
            meta: { title: "页面未找到", hidden: true },
          });

          // 标记动态路由已添加（防止下次再次执行）
          store.isDynamicRoutesAdded = true;

          console.log(
            "[router-guards] ✅ 动态路由添加完成，重新触发当前导航...",
          );

          /* 重要说明：
           * addRoute() 之后必须重新调用 next({ ...to, replace: true })
           * 原因：
           *   1. beforeEach 执行时新路由尚未完全生效
           *   2. 需要确保新的路由记录被正确解析
           *   3. replace: true 避免浏览器历史记录中出现无效条目
           *
           * 如果不重新导航，可能会出现：
           *   - 页面空白（组件未正确加载）
           *   - 路由参数丢失
           *   - 权限控制失效
           */

          // 使用 replace: true 替换当前历史记录条目
          return next({ ...to, replace: true });
        }
      } catch (error: unknown) {
        // 获取用户信息失败的处理逻辑
        console.error(
          "[router-guards] ❌ 获取用户信息或生成动态路由失败:",
          error,
        );

        /* 错误处理策略：
         * 方案 A（推荐）：清除无效 Token 并跳转登录页
         *   - 适用于 Token 过期、网络异常等可恢复错误
         *   - 让用户重新登录获取有效凭证
         *
         * 方案 B：显示错误提示但停留在当前页
         *   - 适用于非关键功能（如菜单加载失败但主流程可用）
         *   - 需配合 UI 组件展示友好提示
         *
         * 当前采用方案 A：主动登出并重定向
         */
        store.logout();

        // 终止当前导航（logout() 内部会跳转到 /login）
        return next(false);
      }
    }

    // ==================== 步骤 5: 所有检查通过，正常放行 ====================
    // 有 Token + 有用户信息 + 动态路由已加载 → 允许访问目标页面
    console.log(
      `[router-guards] ✅ 权限校验通过，放行至: ${to.path}`,
    );
    return next();
  });

  /**
   * 全局后置钩子（可选增强）
   * 在路由跳转完成后执行，可用于：
   *   - 页面标题动态修改
   *   - 访问日志统计
   *   - 进度条关闭（如 NProgress）
   *
   * 当前仅输出日志，实际项目中可根据需求扩展
   */
  router.afterEach((to) => {
    // 可在此处设置页面标题（示例）
    // document.title = to.meta.title || 'WF Platform';

    console.log(`[router-guards] ✓ 导航完成: ${to.path}`);
  });

  console.log("[router-guards] ✅ 路由守卫初始化完成");
}
