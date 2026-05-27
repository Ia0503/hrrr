/**
 * 动态路由转换模块
 * 将后端返回的菜单树数据转换为 Vue Router 可用的路由配置
 *
 * 功能说明：
 *   - 递归遍历菜单树，将字符串组件路径转换为实际的组件导入
 *   - 使用 import.meta.glob 实现动态导入和按需加载
 *   - 提供降级方案：当组件找不到时使用空白占位组件
 *   - 支持父级布局组件（如 DefaultLayout）的自动嵌套
 *
 * 使用场景：
 *   - 在路由守卫中调用 generateRoutes() 生成动态路由
 *   - 根据用户权限动态添加/移除路由
 */

import type { RouteRecordRaw } from "vue-router";
import { h } from "vue";

// ==================== 类型定义 ====================

/**
 * 菜单项接口（与 stores/user.ts 中的定义保持一致）
 * 用于描述后端返回的每个菜单节点结构
 *
 * @property name - 路由名称（唯一标识符）
 * @property path - 路由路径（如 "/dashboard" 或 "/system/user"）
 * @property component - 组件路径字符串或 null（父级菜单为 null）
 * @property redirect - 重定向路径（可选，通常用于父级菜单）
 * @property meta - 路由元信息对象
 * @property children - 子菜单数组（支持多级嵌套）
 */
export interface MenuListItem {
  name: string;
  path: string;
  component: string | null;
  redirect?: string | null;
  meta: {
    title: string;
    icon?: string;
    hidden?: boolean;
    [key: string]: unknown; // 允许扩展其他元数据字段
  };
  children?: MenuListItem[];
}

// ==================== 常量定义 ====================

/**
 * 布局组件路径常量
 * 指向默认布局组件文件（DefaultLayout.vue）
 *
 * 使用说明：
 *   - 所有需要侧边栏+顶栏+内容区的页面都应嵌套在此布局下
 *   - 父级菜单（component 为 null）会自动使用此布局
 *   - 如需更换布局风格，修改此路径即可全局生效
 */
export const LAYOUT_COMPONENT = () =>
  import("@/layouts/DefaultLayout.vue");

/**
 * 空白占位组件
 * 当动态导入的组件找不到时使用此降级方案
 *
 * 设计目的：
 *   - 避免因单个组件缺失导致整个路由注册失败
 *   - 提供友好的错误提示界面
 *   - 保证应用不会白屏崩溃
 *
 * 降级触发条件：
 *   - 组件文件不存在于 views 目录中
 *   - import.meta.glob 未匹配到对应路径
 *   - 组件加载失败（网络问题等）
 */
const PlaceholderComponent = {
  name: "PlaceholderComponent",
  /**
   * 使用 Vue 的 h() 函数渲染占位组件
   * 避免在 .ts 文件中使用 JSX 导致 ESLint 解析错误
   */
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

/**
 * 使用 Vite 的 import.meta.glob 动态导入所有视图组件
 * 返回一个映射表：相对路径 → 异步加载函数
 *
 * glob 模式说明：
 *   - 匹配 src/views 目录下所有 .vue 文件（递归子目录）
 *   - { eager: false } 表示懒加载（按需导入，非立即执行）
 *   - 返回值类型：Record<string, () => Promise<unknown>>
 *
 * ⚠️ 注意：import.meta.glob 为 Vite 特有语法，
 * ESLint 的 TS 解析器无法识别，此处已禁用该行检查
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vite glob 语法，TS 无法解析
const viewModules = import.meta.glob("../views/**/*.vue", {
  eager: false,
} as any);

/**
 * 将后端返回的组件路径字符串转换为 Vite glob 可识别的文件路径
 *
 * 转换规则：
 *   输入："views/dashboard/index"
 *   输出："../views/dashboard/index.vue"（加上前缀和扩展名）
 *
 * @param componentPath - 后端返回的组件路径（如 "views/dashboard/index"）
 * @returns string - 转换后的 glob 匹配路径
 *
 * ⚠️ 注意事项：
 *   - 此函数依赖固定的目录约定：所有页面组件必须放在 src/views 下
 *   - 如果后端返回的路径格式变化，需同步修改此转换逻辑
 */
function convertComponentPath(componentPath: string): string {
  // 移除开头的 "views/" 前缀（mock 数据返回的路径已包含 views/）
  // 避免拼接后出现 "../views/views/xxx.vue" 的双重前缀问题
  const normalizedPath = componentPath.replace(/^views\//, "");
  const result = `../views/${normalizedPath}.vue`;

  // 诊断日志：确认路径转换结果（排查 Vite HMR 缓存问题）
  console.log(
    `[dynamic-routes] 路径转换: "${componentPath}" → "${result}"`,
  );

  return result;
}

/**
 * 根据组件路径查找对应的异步加载函数
 *
 * @param componentPath - 后端返回的组件路径字符串
 * @returns 找到的组件加载函数，未找到时返回占位组件
 *
 * 查找流程：
 *   1. 将后端路径转换为 glob 路径格式
 *   2. 在 viewModules 映射表中查找
 *   3. 找到则返回对应的懒加载函数
 *   4. 未找到则输出错误日志并返回降级组件
 */
function resolveComponent(componentPath: string): ReturnType<typeof LAYOUT_COMPONENT> {
  // 转换路径格式
  const globPath = convertComponentPath(componentPath);

  // 在预加载的模块映射表中查找
  const moduleLoader = viewModules[globPath];

  if (moduleLoader) {
    console.log(
      `[dynamic-routes] ✅ 组件解析成功: ${componentPath} → ${globPath}`,
    );
    return moduleLoader as ReturnType<typeof LAYOUT_COMPONENT>;
  }

  // 降级处理：组件未找到时的容错机制
  console.error(
    `[dynamic-routes] ❌ 组件未找到: ${componentPath} (globPath: ${globPath})`,
  );
  console.error(
    "[dynamic-routes] 已使用占位组件作为降级方案，请确认以下事项：",
  );
  console.error(
    "  1. 组件文件是否存在于 src/views 目录下",
  );
  console.error(
    `  2. 路径 "${componentPath}" 是否正确（需包含完整相对路径）`,
  );
  console.error(
    "  3. 文件名是否为 index.vue 或其他有效 Vue 组件",
  );

  /* 降级方案说明：
   * 当组件文件缺失时，返回 PlaceholderComponent 避免应用崩溃。
   * 生产环境中建议：
   *   - 监控此类错误日志，及时补充缺失的组件
   *   - 或将 PlaceholderComponent 替换为统一的 404 错误页面
   *   - 或直接抛出异常中断路由注册（更严格的模式）
   */
  return PlaceholderComponent as unknown as ReturnType<typeof LAYOUT_COMPONENT>;
}

// ==================== 核心函数 ====================

/**
 * 将菜单树转换为 Vue Router 路由配置数组
 * 递归遍历菜单树，处理组件导入、元信息传递和子路由嵌套
 *
 * @param menuList - 从后端获取的菜单树数据（MenuListItem[]）
 * @returns RouteRecordRaw[] - Vue Router 可用的路由配置数组
 *
 * 执行逻辑：
 *   1. 遍历菜单列表中的每一项
 *   2. 判断 component 字段：
 *      - 为 null/空 → 不设置 component（父级容器，使用布局组件）
 *      - 有值 → 通过 resolveComponent() 动态导入对应组件
 *   3. 构建路由记录（RouteRecordRaw），包含 name, path, meta 等
 *   4. 递归处理 children 数组生成子路由
 *   5. 返回完整的路由配置树
 *
 * 使用示例：
 * ```ts
 * import { generateRoutes } from '@/router/dynamicRoutes';
 * import { useUserStore } from '@/stores/user';
 *
 * const userStore = useUserStore();
 * const routes = generateRoutes(userStore.userInfo?.menuList || []);
 * routes.forEach(route => router.addRoute(route));
 * ```
 */
export function generateRoutes(menuList: MenuListItem[]): RouteRecordRaw[] {
  console.log(
    `[dynamic-routes] 开始生成动态路由，菜单项数量: ${menuList.length}`,
  );

  /**
   * 内部递归函数
   * 处理单个菜单项及其子节点的转换
   *
   * @param item - 当前待处理的菜单项
   * @returns RouteRecordRaw - 转换后的路由记录
   */
  function transformMenuItem(item: MenuListItem): RouteRecordRaw {
    // 构建基础路由配置
    const route: RouteRecordRaw = {
      // 路由名称（用于编程式导航和 <router-link>）
      name: item.name,

      // 路由路径（绝对路径或相对于父路由的路径）
      path: item.path,

      // 路由元信息（用于权限控制、标题显示、缓存控制等）
      meta: item.meta,
    };

    // 处理组件加载（核心逻辑）
    if (item.component) {
      // 有具体组件路径 → 动态导入对应组件
      route.component = resolveComponent(item.component);
    }
    // else: component 为 null → 不设置 component（父级布局容器）

    // 处理重定向（可选属性）
    if (item.redirect) {
      route.redirect = item.redirect;
    }

    // 递归处理子菜单（如果存在）
    if (item.children && item.children.length > 0) {
      console.log(
        `[dynamic-routes] 处理子菜单: ${item.name} (${item.children.length} 个子项)`,
      );

      // 递归调用 transformMenuItem 处理每个子项
      route.children = item.children.map((child) => transformMenuItem(child));
    }

    return route;
  }

  // 对整个菜单列表进行映射转换
  const routes = menuList.map((item) => transformMenuItem(item));

  console.log(
    `[dynamic-routes] ✅ 动态路由生成完成，共 ${routes.length} 个顶级路由`,
  );

  return routes;
}
