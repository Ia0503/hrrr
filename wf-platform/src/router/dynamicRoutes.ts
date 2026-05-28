/**
 * 动态路由转换模块
 * 将后端返回的菜单树数据转换为 Vue Router 可用的路由配置
 *
 * 功能说明：
 *   - 递归遍历菜单树，将字符串组件路径转换为实际的组件导入
 *   - 使用 import.meta.glob 实现动态导入和按需加载
 *   - 提供降级方案：当组件找不到时使用空白占位组件
 *   - 所有有 component 的顶级路由自动包裹在 DefaultLayout 布局中
 *
 * 使用场景：
 *   - 在路由守卫中调用 generateRoutes() 生成动态路由
 *   - 根据用户权限动态添加/移除路由
 */

import type { RouteRecordRaw } from "vue-router";
import { h } from "vue";

// ==================== 类型定义 ====================

/** 菜单项接口 */
export interface MenuListItem {
  name: string;
  path: string;
  component: string | null;
  redirect?: string | null;
  meta: {
    title: string;
    icon?: string;
    hidden?: boolean;
    [key: string]: unknown;
  };
  children?: MenuListItem[];
}

// ==================== 常量定义 ====================

/** 布局组件路径常量（DefaultLayout 提供侧边栏+顶栏+内容区） */
export const LAYOUT_COMPONENT = () =>
  import("@/layouts/DefaultLayout.vue");

/** 空白占位组件（降级方案） */
const PlaceholderComponent = {
  name: "PlaceholderComponent",
  render() {
    return h(
      "div",
      {
        style: "padding: 20px; text-align: center; color: #999;",
      },
      [
        h("p", null, "⚠️ 组件加载失败"),
        h(
          "p",
          { style: "font-size: 12px;" },
          "请检查组件文件是否存在",
        ),
      ],
    );
  },
};

// ==================== 工具函数 ====================

/** Vite glob 动态导入所有视图组件 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viewModules = import.meta.glob("../views/**/*.vue", {
  eager: false,
} as any);

/** 所有可用的 glob 键名 */
const availableModuleKeys = Object.keys(viewModules);

/**
 * 多模式匹配：尝试多种路径格式来匹配 glob 模块
 *
 * 后端返回的 componentPath 格式："views/task/board" 或 "views/dashboard/index"
 * 需要转换为 viewModules 中实际存在的键名
 *
 * @param componentPath - 后端返回的组件路径字符串
 * @returns 匹配到的加载函数，未找到返回 null
 */
function tryResolveComponent(componentPath: string): (() => Promise<unknown>) | null {
  const basePath = componentPath.replace(/^views\//, "");

  /** 覆盖 Vite 各版本/配置的常见键名格式 */
  const candidates: string[] = [
    `../views/${basePath}.vue`,
    `/src/views/${basePath}.vue`,
    `./views/${basePath}.vue`,
    `src/views/${basePath}.vue`,
  ];

  for (const candidate of candidates) {
    if (viewModules[candidate]) {
      console.log(`[dynamic-routes] ✅ 组件匹配：${componentPath} → ${candidate}`);
      return viewModules[candidate];
    }
  }

  console.error(
    `[dynamic-routes] ❌ 组件未找到：${componentPath}`,
    `\n  候选路径：${candidates.join(" / ")}`,
    `\n  可用键名（前5）：${availableModuleKeys.slice(0, 5).map(k => `"${k}"`).join(", ")}`,
  );

  return null;
}

/**
 * 解析组件路径，返回加载函数或占位组件
 */
function resolveComponent(componentPath: string): ReturnType<typeof LAYOUT_COMPONENT> {
  const loader = tryResolveComponent(componentPath);
  if (loader) {
    return loader as ReturnType<typeof LAYOUT_COMPONENT>;
  }
  return PlaceholderComponent as unknown as ReturnType<typeof LAYOUT_COMPONENT>;
}

// ==================== 核心函数 ====================

/**
 * 将菜单树转换为 Vue Router 路由配置数组
 *
 * 关键设计：所有有 component 的顶级路由都会被自动包裹在 DefaultLayout 布局中，
 * 确保侧边栏、顶栏等布局元素正确渲染。
 *
 * 转换规则：
 *   - component 为 null 的顶级菜单 → 使用 LAYOUT_COMPONENT 作为 component，children 保持不变
 *   - component 有值的顶级菜单 → 创建一个使用 LAYOUT_COMPONENT 的父路由，原路由作为唯一 child
 *   - 子菜单（children）→ 直接转换，不再额外包裹布局（避免嵌套重复）
 *
 * @param menuList - 从后端获取的菜单树数据
 * @returns RouteRecordRaw[] - Vue Router 可用的路由配置数组
 */
export function generateRoutes(menuList: MenuListItem[]): RouteRecordRaw[] {
  console.log(`[dynamic-routes] 开始生成动态路由，共 ${menuList.length} 个菜单项`);

  /**
   * 将单个菜单项转换为路由记录（不做布局包裹）
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
      // 直接使用布局组件，children 正常递归
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
      console.log(`[dynamic-routes] 📦 父级布局路由：${item.name} (${item.path})`);
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
      console.log(`[dynamic-routes] 📄 页面包裹路由：${item.name} (${item.path}) → 已包裹 DefaultLayout`);
    } else {
      // 情况 C：既无 component 也无 children（异常情况，降级处理）
      console.warn(`[dynamic-routes] ⚠️ 异常菜单项（无 component 无 children）：${item.name}，跳过`);
    }
  }

  console.log(`[dynamic-routes] ✅ 动态路由生成完成，共 ${routes.length} 个顶级路由`);

  return routes;
}
