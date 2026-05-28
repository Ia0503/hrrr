/**
 * 路由配置统一模块
 * 合并路由实例创建、静态路由定义、路由守卫、动态路由转换功能
 *
 * 功能说明：
 *   - 使用 HTML5 History 模式（去除 URL 中的 # 号）
 *   - 定义静态路由（登录页、根路径重定向等）
 *   - 实现全局前置守卫，控制页面访问权限和动态路由加载
 *   - 将后端返回的菜单树数据转换为 Vue Router 可用的路由配置
 *   - 动态路由在路由守卫中按需添加（首次访问时触发）
 *
 * 模块结构：
 *   1. 类型定义 - MenuListItem 接口
 *   2. 常量定义 - 路由基础路径、白名单、布局组件等
 *   3. 工具函数 - 组件解析、路径匹配等辅助函数
 *   4. 静态路由表 - 无需权限验证的路由配置
 *   5. 核心函数 - generateRoutes() / setupRouterGuards()
 *   6. Router 实例 - 创建并导出 Vue Router 实例
 */

import { createRouter, createWebHistory } from "vue-router";
import type { RouteRecordRaw, Router } from "vue-router";
import { h } from "vue";
import { useUserStore } from "@/stores/user";

// ==================== 类型定义 ====================

/**
 * 菜单项接口
 * 对应后端返回的菜单树节点数据结构
 */
export interface MenuListItem {
  /** 路由名称（唯一标识符） */
  name: string;
  /** 路由路径（URL 路径段） */
  path: string;
  /** 组件路径字符串（相对于 views 目录），null 表示无独立组件的父级容器 */
  component: string | null;
  /** 重定向目标路径（可选） */
  redirect?: string | null;
  /** 路由元信息（标题、图标、隐藏状态等） */
  meta: {
    /** 页面标题（用于浏览器标签页和面包屑） */
    title: string;
    /** 图标名称（可选，用于侧边栏菜单图标） */
    icon?: string;
    /** 是否在侧边栏隐藏（可选，默认 false） */
    hidden?: boolean;
    /** 扩展字段（允许自定义元数据） */
    [key: string]: unknown;
  };
  /** 子菜单列表（递归结构，支持多级嵌套） */
  children?: MenuListItem[];
}

// ==================== 常量定义 ====================

/** 路由基础路径（HTML5 History 模式的根路径） */
const ROUTER_BASE_PATH = "/";

/**
 * 路由白名单数组
 * 列出无需身份验证即可访问的路径
 *
 * 使用场景：
 *   - 登录页（用户未登录时的入口）
 *   - 公开页面（如帮助文档、关于我们等）
 *   - 第三方回调页（如 OAuth 授权回调）
 *
 * 注意事项：
 *   - 路径需与路由配置中的 path 完全匹配（区分大小写）
 *   - 如需支持子路径，请使用正则表达式或通配符
 *   - 新增公开页面时必须同步更新此数组
 */
const WHITE_LIST: string[] = ["/login"];

/** 布局组件路径常量（DefaultLayout 提供侧边栏+顶栏+内容区） */
export const LAYOUT_COMPONENT = () =>
  import("@/layouts/DefaultLayout.vue");

// ==================== 工具函数与模块级变量 ====================

/**
 * 空白占位组件（降级方案）
 * 当后端指定的组件文件不存在时使用此组件作为兜底
 */
const PlaceholderComponent = {
  name: "PlaceholderComponent",
  render() {
    return h(
      "div",
      {
        style: "padding: 20px; text-align: center; color: #999;",
      },
      [
        h("p", null, "[WARN] 组件加载失败"),
        h(
          "p",
          { style: "font-size: 12px;" },
          "请检查组件文件是否存在",
        ),
      ],
    );
  },
};

/** Vite glob 动态导入所有视图组件（预加载模式，确保路由守卫执行时键名可用） */
// 使用绝对路径模式（从项目根目录解析），避免 Vite 8 下根目录文件相对路径漂移
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewModules = import.meta.glob("/src/views/**/*.vue", {
  eager: true,
} as any);

/** 所有可用的 glob 键名（用于调试日志输出） */
const availableModuleKeys = Object.keys(viewModules);

/* [DEBUG] 启动时输出 glob 匹配结果，便于排查路径问题 */
if (availableModuleKeys.length > 0) {
  console.log(`[DYNAMIC-ROUTES] [INFO] Glob 预加载完成，共 ${availableModuleKeys.length} 个视图组件`);
} else {
  console.error("[DYNAMIC-ROUTES] [ERROR] Glob 未匹配到任何视图组件，请检查路径模式");
}

/**
 * 多模式匹配：尝试多种路径格式来匹配 glob 模块
 *
 * 后端返回的 componentPath 格式示例："views/task/board" 或 "views/dashboard/index"
 * 需要转换为 viewModules 中实际存在的键名以实现动态导入
 *
 * @param componentPath - 后端返回的组件路径字符串（如 "views/dashboard/index"）
 * @returns 匹配到的加载函数（Promise 返回组件），未找到返回 null
 */
function tryResolveComponent(componentPath: string): (() => Promise<unknown>) | null {
  const basePath = componentPath.replace(/^views\//, "");

  /** 覆盖 Vite 各版本/配置的常见键名格式候选列表（按匹配概率排序） */
  const candidates: string[] = [
    `/src/views/${basePath}.vue`,
    `./views/${basePath}.vue`,
    `../views/${basePath}.vue`,
    `src/views/${basePath}.vue`,
  ];

  for (const candidate of candidates) {
    if (viewModules[candidate]) {
      console.log(`[dynamic-routes][INFO] 组件匹配成功: ${componentPath} -> ${candidate}`);
      return viewModules[candidate];
    }
  }

  console.error(
    `[dynamic-routes][ERROR] 组件未找到: ${componentPath}`,
    `\n  候选路径: ${candidates.join(" / ")}`,
    `\n  可用键名(前5): ${availableModuleKeys.slice(0, 5).map(k => `"${k}"`).join(", ")}`,
  );

  return null;
}

/**
 * 解析组件路径，返回组件定义或占位组件
 *
 * @param componentPath - 后端返回的组件路径字符串
 * @returns 组件对象（成功匹配时）或 PlaceholderComponent（未找到时降级）
 *
 * 兼容说明：
 *   - eager: false 模式：glob 返回 () => Promise<Component>（加载函数）
 *   - eager: true  模式：glob 返回 { default: Component }（模块对象）
 *   本函数自动检测并统一为 Vue Router 可用的组件格式
 */
function resolveComponent(componentPath: string): ReturnType<typeof LAYOUT_COMPONENT> {
  const moduleOrLoader = tryResolveComponent(componentPath);
  if (!moduleOrLoader) {
    return PlaceholderComponent as unknown as ReturnType<typeof LAYOUT_COMPONENT>;
  }

  /* 情况 A：函数类型（eager: false 懒加载模式）→ 直接返回 */
  if (typeof moduleOrLoader === "function") {
    return moduleOrLoader as unknown as ReturnType<typeof LAYOUT_COMPONENT>;
  }

  /* 情况 B：对象类型（eager: true 预加载模式）→ 提取 .default 导出 */
  if (
    typeof moduleOrLoader === "object" &&
    moduleOrLoader !== null &&
    "default" in moduleOrLoader
  ) {
    return (moduleOrLoader as { default: unknown }).default as ReturnType<typeof LAYOUT_COMPONENT>;
  }

  /* 情况 C：已经是组件对象（兜底） */
  console.warn(
    `[DYNAMIC-ROUTES] [WARN] 组件模块格式异常: ${componentPath}，尝试直接使用`,
  );
  return moduleOrLoader as unknown as ReturnType<typeof LAYOUT_COMPONENT>;
}

// ==================== 静态路由表 ====================

/**
 * 静态路由配置数组
 * 这些路由在应用启动时即注册，不依赖用户权限
 *
 * 当前包含：
 *   - 根路径 "/" 重定向到仪表盘
 *   - "/login" 登录页（白名单放行，无需 Token）
 */
const staticRoutes: RouteRecordRaw[] = [
  {
    path: "/",
    redirect: "/dashboard",
  },
  {
    path: "/login",
    name: "Login",
    component: () => import("@/views/login/index.vue"),
    meta: {
      title: "登录",
      hidden: true,
    },
  },
];

// ==================== 核心函数 ====================

/**
 * 将菜单树转换为 Vue Router 路由配置数组
 *
 * 关键设计：所有有 component 的顶级路由都会被自动包裹在 DefaultLayout 布局中，
 * 确保侧边栏、顶栏等布局元素正确渲染。
 *
 * 转换规则：
 *   - component 为 null 的顶级菜单 -> 使用 LAYOUT_COMPONENT 作为 component，children 保持不变
 *   - component 有值的顶级菜单 -> 创建一个使用 LAYOUT_COMPONENT 的父路由，原路由作为唯一 child
 *   - 子菜单（children）-> 直接转换，不再额外包裹布局（避免嵌套重复）
 *
 * @param menuList - 从后端获取的菜单树数据（用户权限对应的可访问菜单）
 * @returns RouteRecordRaw[] - Vue Router 可用的路由配置数组（可直接 addRoute）
 *
 * 使用示例：
 * ```ts
 * const menuList = await api.getUserMenu();
 * const routes = generateRoutes(menuList);
 * routes.forEach(route => router.addRoute(route));
 * ```
 */
export function generateRoutes(menuList: MenuListItem[]): RouteRecordRaw[] {
  console.log(`[dynamic-routes][INFO] 开始生成动态路由，共 ${menuList.length} 个菜单项`);

  /**
   * 将单个菜单项转换为路由记录（不做布局包裹）
   * 仅处理基本属性映射和子项递归
   *
   * @param item - 单个菜单项数据
   * @returns 转换后的 RouteRecordRaw 对象
   */
  function transformMenuItem(item: MenuListItem): RouteRecordRaw {
    const route: RouteRecordRaw = {
      name: item.name,
      path: item.path,
      meta: item.meta,
    };

    if (item.component) {
      route.component = resolveComponent(item.component);
    }

    if (item.redirect) {
      route.redirect = item.redirect;
    }

    if (item.children && item.children.length > 0) {
      route.children = item.children.map((child) => transformMenuItem(child));
    }

    return route;
  }

  /**
   * 处理顶级菜单项：为有 component 的路由自动包裹 DefaultLayout
   *
   * 返回的路由结构示例：
   *   无 component（如 System 父级）:
   *     { path: "/system", component: Layout, children: [UserManage] }
   *
   *   有 component（如 Dashboard）:
   *     { path: "/dashboard", component: Layout, children: [{ path: "", component: DashboardPage }] }
   */
  const routes: RouteRecordRaw[] = [];

  for (const item of menuList) {
    if (item.component === null && (item.children?.length || 0) > 0) {
      // 情况 A：父级容器菜单（无自身组件，有子菜单）
      // 直接使用布局组件，children 正常递归转换
      const layoutRoute: RouteRecordRaw = {
        name: item.name,
        path: item.path,
        component: LAYOUT_COMPONENT,
        meta: item.meta,
        children: item.children!.map((child) => transformMenuItem(child)),
      };

      if (item.redirect) {
        layoutRoute.redirect = item.redirect;
      }

      routes.push(layoutRoute);
      console.log(`[dynamic-routes][INFO] 父级布局路由已生成: ${item.name} (${item.path})`);
    } else if (item.component) {
      // 情况 B：有具体组件的叶子/独立页面（需要包裹布局）
      // 创建一个以 Layout 为 component 的父路由，原路由作为空路径 child
      const pageRoute: RouteRecordRaw = {
        name: item.name,
        path: "", // 空路径，继承父级 path（如 /dashboard + "" = /dashboard）
        component: resolveComponent(item.component),
        meta: item.meta,
      };

      const layoutRoute: RouteRecordRaw = {
        path: item.path,
        component: LAYOUT_COMPONENT,
        children: [pageRoute],
      };

      // 如果有重定向，加到布局路由上
      if (item.redirect) {
        layoutRoute.redirect = item.redirect;
      }

      routes.push(layoutRoute);
      console.log(`[dynamic-routes][INFO] 页面包裹路由已生成: ${item.name} (${item.path}) -> DefaultLayout`);
    } else {
      // 情况 C：既无 component 也无 children（异常情况，降级处理）
      console.warn(`[dynamic-routes][WARN] 异常菜单项(无component无children): ${item.name}，已跳过`);
    }
  }

  console.log(`[dynamic-routes][INFO] 动态路由生成完成，共 ${routes.length} 个顶级路由`);

  return routes;
}

/**
 * 设置路由守卫
 * 在 Vue Router 实例上注册全局前置守卫（beforeEach）和后置钩子（afterEach）
 *
 * 执行流程图：
 *   用户访问 -> 检查白名单 -> 是 -> 直接放行
 *              | 否
 *           检查 Token -> 无 -> 跳转登录页
 *              | 有
 *           目标是 /login? -> 是 -> 跳转首页
 *              | 否
 *           已有用户信息? -> 是 -> 放行
 *              | 否
 *           获取用户信息 -> 生成动态路由 -> 添加到 router -> 重新导航
 *
 * @param router - Vue Router 实例对象（从本模块导出的 router 实例）
 * @param userStore - 用户状态管理 Store 实例（可选，内部会自动通过 useUserStore() 获取）
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
 * import router, { setupRouterGuards } from './router';
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
  console.log("[router-guards][INFO] 正在初始化路由守卫...");

  /**
   * 全局前置守卫函数
   * 在每次路由跳转前执行，用于权限校验和动态路由加载
   *
   * @param to - 即将进入的目标路由对象（RouteLocationNormalized）
   * @param _from - 当前离开的路由对象（RouteLocationNormalized，未使用）
   * @param next - 导航控制函数，决定是否允许跳转或重定向
   *
   * next() 的使用方式：
   *   - next() -> 允许导航（放行）
   *   - next('/path') -> 重定向到指定路径
   *   - next(false) -> 取消当前导航
   *   - next({ ...to, replace: true }) -> 用新目标替换当前历史记录
   */
  router.beforeEach(async (to, _from, next) => {
    console.log(
      `[router-guards][INFO] 路由跳转: ${_from.path} -> ${to.path}`,
    );

    // 获取用户 Store 实例（如果外部未传入则内部创建）
    const store = userStore || useUserStore();

    // ==================== 步骤 1: 白名单检查 ====================
    // 白名单中的路径直接放行，无需验证 Token
    if (WHITE_LIST.includes(to.path)) {
      console.log(`[router-guards][INFO] 白名单路径放行: ${to.path}`);
      return next();
    }

    // ==================== 步骤 2: Token 存在性检查 ====================
    // 从 Store 中获取当前 Token（Token 来源：localStorage 或内存状态）
    const token = store.token;

    if (!token) {
      // 无 Token -> 用户未登录 -> 重定向到登录页
      console.warn(
        `[router-guards][WARN] 无有效Token，重定向到登录页: ${to.path}`,
      );

      // 将目标路径作为查询参数传递，方便登录后回跳
      // 示例：/login?redirect=/dashboard
      return next({
        path: "/login",
        query: { redirect: to.fullPath },
      });
    }

    // ==================== 步骤 3: 登录页重复访问检查 ====================
    // 已有 Token 但访问登录页 -> 重定向到首页（避免重复登录）
    if (to.path === "/login") {
      console.log(
        "[router-guards][INFO] 已登录用户访问登录页，重定向到首页",
      );
      return next({ path: "/" });
    }

    // ==================== 步骤 4: 用户信息检查与动态路由加载 ====================
    if (!store.userInfo) {
      console.log(
        "[router-guards][INFO] 首次访问，正在获取用户信息和动态路由...",
      );

      try {
        // 调用 getUserInfo() 获取用户详细信息、角色、权限和菜单树
        await store.getUserInfo();

        console.log(
          `[router-guards][INFO] 用户信息获取成功: username=${store.userInfo?.username}`,
        );

        // 检查是否已添加过动态路由（避免重复添加导致警告）
        if (!store.isDynamicRoutesAdded && store.userInfo?.menuList) {
          // 调用 generateRoutes() 将菜单树转换为路由配置
          const dynamicRoutes = generateRoutes(store.userInfo.menuList);

          console.log(
            `[router-guards][INFO] 正在添加 ${dynamicRoutes.length} 个动态路由...`,
          );

          // 遍历生成的路由配置，逐一添加到 router 实例
          dynamicRoutes.forEach((route) => {
            router.addRoute(route);
          });

          // 追加 404 兜底路由（必须放在所有动态路由之后）
          // 确保通配符不会优先于业务路由匹配
          // 此处使用懒加载，仅在实际访问 404 时才加载组件
          router.addRoute({
            path: "/:pathMatch(.*)*",
            name: "NotFound",
            component: () => import("@/views/error/404.vue"),
            meta: { title: "页面未找到", hidden: true },
          });

          // 标记动态路由已添加（防止下次再次执行）
          store.isDynamicRoutesAdded = true;

          console.log(
            "[router-guards][INFO] 动态路由添加完成，重新触发当前导航...",
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
          "[router-guards][ERROR] 获取用户信息或生成动态路由失败:",
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
    // 有 Token + 有用户信息 + 动态路由已加载 -> 允许访问目标页面
    console.log(
      `[router-guards][INFO] 权限校验通过，放行至: ${to.path}`,
    );
    return next();
  });

  /**
   * 全局后置钩子
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

    console.log(`[router-guards][INFO] 导航完成: ${to.path}`);
  });

  console.log("[router-guards][INFO] 路由守卫初始化完成");
}

// ==================== Router 实例创建与导出 ====================

/**
 * Vue Router 实例
 * 使用 HTML5 History 模式，配置静态路由和滚动行为
 *
 * 特性说明：
 *   - History 模式：URL 无 # 号，更美观且对 SEO 友好
 *   - scrollBehavior：控制路由切换时的滚动位置（优先恢复上次位置，否则滚到顶部）
 *   - 静态路由仅包含登录页和根路径重定向
 *   - 动态路由在 setupRouterGuards() 中按需添加
 */
const router = createRouter({
  history: createWebHistory(ROUTER_BASE_PATH),
  routes: staticRoutes,
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    }
    return { top: 0, left: 0 };
  },
});

export default router;
