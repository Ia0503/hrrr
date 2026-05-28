<!--
  DefaultLayout 默认布局组件
  ============================
  基于 Element Plus Container 构建的经典后台管理系统布局

  布局结构：
    ┌──────────────────────────────────────────────┐
    │              Header（顶部导航栏）               │  ← el-header: Logo + 用户信息
    ├─────────────┬─────────────────────────────────┤
    │             │                                 │
    │   Aside     │           Main                  │  ← el-main: <router-view />
    │ （侧边栏菜单）│       （主内容区域）             │
    │             │                                 │
    └─────────────┴─────────────────────────────────┘

  核心功能：
    - 左侧边栏：从 userStore.menuList 动态渲染多级导航菜单（递归组件）
    - 顶部导航：展示系统 Logo 与当前登录用户信息
    - 内容区域：通过 <router-view /> 渲染匹配的路由页面组件
-->
<script setup lang="ts">
/**
 * DefaultLayout 组件 - 应用主布局容器
 *
 * 技术栈：
 *   - Vue 3 Composition API（<script setup> 语法糖）
 *   - TypeScript 类型安全
 *   - Element Plus UI 组件库（Container 布局体系）
 *   - Tailwind CSS v4 原子化工具类
 *   - Pinia 状态管理（userStore）
 *   - Vue Router 路由管理
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { useUserStore } from "@/stores/user";

/* ==================== 实例初始化 ==================== */

/** Vue Router 路由实例，用于编程式导航 */
const router = useRouter();

/** Pinia 用户状态管理实例，获取菜单列表与用户信息 */
const userStore = useUserStore();

/* ==================== 响应式状态 ==================== */

/**
 * 当前激活的菜单项索引
 * 用于 el-menu 的 :default-active 属性，高亮显示当前路由对应的菜单项
 * @type {import("vue").Ref<string>}
 */
const activeMenu = ref("");

/**
 * 菜单是否折叠状态
 * @type {import("vue").Ref<boolean>}
 */
const isCollapse = ref(false);

/* ==================== 计算属性 ==================== */

/**
 * 过滤后的可见菜单列表
 * 从 userStore.userInfo?.menuList 中过滤掉 hidden 为 true 的菜单项
 * 仅展示用户有权限访问的菜单
 */
const visibleMenuList = computed(() => {
  const menuList = userStore.userInfo?.menuList || [];
  const filtered = menuList.filter(
    (item) => item.meta.hidden !== true,
  );
  console.log("[DefaultLayout] 可见菜单列表:", filtered);
  return filtered;
});

/**
 * 当前登录用户的昵称
 * 从 userStore.userInfo 中获取，用于顶部导航栏右侧展示
 */
const username = computed(() => {
  return userStore.userInfo?.nickname || "未登录";
});

/* ==================== 方法定义 ==================== */

/**
 * 处理菜单项点击事件
 * 使用 router.push 进行编程式导航到目标路由路径
 *
 * @param path - 目标路由路径（来自 MenuListItem.path）
 * @param name - 菜单项名称（用于日志记录）
 */
const handleMenuClick = (path: string, name: string) => {
  console.log(`[DefaultLayout] 菜单点击: ${name} -> ${path}`);
  router.push(path);
};

/**
 * 切换侧边栏折叠/展开状态
 * 折叠时宽度收缩为 64px，展开时恢复为 220px
 */
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value;
  console.log(
    `[DefaultLayout] 侧边栏${isCollapse.value ? "已折叠" : "已展开"}`,
  );
};
</script>

<template>
  <!--
    Element Plus Container 布局根容器
    el-container 是外层容器，当子元素中含有 el-header 或 el-footer 时，
    全部子元素会垂直上下排列，否则会水平左右排列
  -->
  <el-container class="wf-default-layout">

    <!-- ==================== 顶部导航栏区域 ==================== -->
    <!--
      el-header 顶栏容器
      固定高度 60px，包含左侧 Logo 区域和右侧用户信息区域
    -->
    <el-header class="wf-default-layout__header">
      <!-- 左侧：Logo + 系统名称 + 折叠按钮 -->
      <div class="wf-default-layout__header-left">
        <!-- 系统 Logo 文字标识 -->
        <h1 class="wf-default-layout__logo">WF Platform</h1>

        <!--
          侧边栏折叠/展开切换按钮
          点击后触发 toggleCollapse 方法切换 isCollapse 状态
        -->
        <button
          class="wf-default-layout__collapse-btn"
          :title="isCollapse ? '展开菜单' : '折叠菜单'"
          @click="toggleCollapse"
        >
          {{ isCollapse ? "☰" : "✕" }}
        </button>
      </div>

      <!-- 右侧：用户信息操作区 -->
      <div class="wf-default-layout__header-right">
        <!-- 当前登录用户昵称展示 -->
        <span class="wf-default-layout__username">{{ username }}</span>
      </div>
    </el-header>

    <!-- ==================== 主体区域（侧边栏 + 主内容） ==================== -->
    <el-container class="wf-default-layout__body">

      <!-- ==================== 左侧边栏导航区域 ==================== -->
      <!--
        el-aside 侧边栏容器
        宽度根据折叠状态动态变化：
          - 展开状态：220px
          - 折叠状态：64px（Element Plus el-menu 折叠默认宽度）
        深色背景主题（#001529），与经典后台管理系统风格一致
      -->
      <el-aside
        :width="isCollapse ? '64px' : '220px'"
        class="wf-default-layout__aside"
      >
        <!--
          el-menu 导航菜单组件
          配置说明：
            - collapse: 是否折叠模式（影响图标/文字显示方式）
            - router: 启用 vue-router 模式，点击菜单项会自动调用 router.push
            - default-active: 当前激活菜单的 index，用于高亮显示
            - background-color: 菜单背景色（深色主题）
            - text-color: 菜单文字颜色（白色）
            - active-text-color: 激活菜单文字颜色（品牌蓝色）
            - unique-opened: 同时只展开一个子菜单
        -->
        <el-menu
          :collapse="isCollapse"
          router
          :default-active="activeMenu"
          background-color="#001529"
          text-color="#ffffffa6"
          active-text-color="#409eff"
          :unique-opened="true"
          class="wf-default-layout__menu"
        >
          <!--
            遍历可见菜单列表，逐个渲染菜单项
            使用动态组件 :is 判断当前项是否有子菜单：
              - 有 children 且长度 > 0 → 渲染 WfSubMenu（可展开的子菜单组）
              - 无 children 或为空数组 → 渲染 WfMenuItem（叶子节点菜单项）
          -->
          <template v-for="menuItem in visibleMenuList" :key="menuItem.path">
            <!-- 有子菜单的情况：使用 el-sub-menu 包裹 -->
            <el-sub-menu
              v-if="menuItem.children && menuItem.children.length > 0"
              :index="menuItem.path"
            >
              <!-- 子菜单标题插槽：显示父级菜单的标题和图标 -->
              <template #title>
                <span>{{ menuItem.meta.title }}</span>
              </template>

              <!--
                递归渲染子菜单项
                通过作用域插槽传递子菜单数据，内部再次判断是否有嵌套子菜单
                实现无限层级菜单的递归渲染能力
              -->
              <template v-for="child in menuItem.children" :key="child.path">
                <!-- 三级及以上菜单：继续使用 sub-menu 包裹 -->
                <el-sub-menu
                  v-if="child.children && child.children.length > 0"
                  :index="child.path"
                >
                  <template #title>
                    <span>{{ child.meta.title }}</span>
                  </template>
                  <!-- 递归渲染三级子菜单的叶子节点 -->
                  <el-menu-item
                    v-for="grandChild in child.children"
                    :key="grandChild.path"
                    :index="grandChild.path"
                    @click="handleMenuClick(grandChild.path, grandChild.meta.title)"
                  >
                    {{ grandChild.meta.title }}
                  </el-menu-item>
                </el-sub-menu>

                <!-- 二级叶子菜单：直接渲染 menu-item -->
                <el-menu-item
                  v-else
                  :index="child.path"
                  @click="handleMenuClick(child.path, child.meta.title)"
                >
                  {{ child.meta.title }}
                </el-menu-item>
              </template>
            </el-sub-menu>

            <!-- 无子菜单的情况：直接渲染叶子菜单项 -->
            <el-menu-item
              v-else
              :index="menuItem.path"
              @click="handleMenuClick(menuItem.path, menuItem.meta.title)"
            >
              {{ menuItem.meta.title }}
            </el-menu-item>
          </template>
        </el-menu>
      </el-aside>

      <!-- ==================== 主内容区域 ==================== -->
      <!--
        el-main 主要内容区容器
        自动占满 aside 之外的所有剩余空间
        内部放置 <router-view /> 作为路由出口，渲染当前 URL 匹配的页面组件
      -->
      <el-main class="wf-default-layout__main">
        <!--
          Vue Router 路由视图出口
          当 URL 变化时，Vue Router 会自动在此处渲染对应路由配置中的 component 组件

          工作流程示例：
            1. 用户点击菜单项 "系统管理" -> path="/system"
            2. Vue Router 匹配 /system 路由规则
            3. 将 SystemManage 组件渲染到此处
            4. 页面内容即时更新，无需刷新浏览器
        -->
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* ==================== 布局根容器样式 ==================== */

/**
 * DefaultLayout 根容器
 * 使用 Element Plus el-container 作为最外层布局容器
 * 设置全屏高度，确保布局铺满整个浏览器视口
 */
.wf-default-layout {
  width: 100%;
  height: 100vh;
}

/* ==================== 顶部导航栏样式 ==================== */

/**
 * 顶部导航栏
 * 采用 Flexbox 水平布局，左右两端对齐
 * 高度由 el-container 内置样式控制（默认 60px）
 */
.wf-default-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  z-index: 100;
}

/** 顶部左侧区域：Logo + 折叠按钮 */
.wf-default-layout__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

/** 系统 Logo 文字样式 */
.wf-default-layout__logo {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1890ff;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/** 侧边栏折叠/展开按钮 */
.wf-default-layout__collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background-color: transparent;
  color: #666;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

/** 折叠按钮悬停效果 */
.wf-default-layout__collapse-btn:hover {
  background-color: #f0f0f0;
  color: #1890ff;
}

/** 顶部右侧区域：用户信息等操作 */
.wf-default-layout__header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

/** 用户昵称文本 */
.wf-default-layout__username {
  font-size: 14px;
  color: #333;
}

/* ==================== 主体区域样式 ==================== */

/** 主体容器：包裹侧边栏和主内容区 */
.wf-default-layout__body {
  overflow: hidden;
}

/* ==================== 侧边栏样式 ==================== */

/**
 * 左侧边栏
 * 深色背景主题，与 Element Plus el-menu 的暗色模式配合使用
 * 过渡动画确保折叠/展开时宽度平滑变化
 */
.wf-default-layout__aside {
  background-color: #001529;
  transition: width 0.3s ease;
  overflow-x: hidden;
  overflow-y: auto;
}

/**
 * 自定义侧边栏滚动条样式
 * 使滚动条更细、更美观，符合深色背景主题
 */
.wf-default-layout__aside::-webkit-scrollbar {
  width: 4px;
}

.wf-default-layout__aside::-webkit-scrollbar-thumb {
  background-color: #ffffff33;
  border-radius: 2px;
}

.wf-default-layout__aside::-webkit-scrollbar-track {
  background-color: transparent;
}

/**
 * 导航菜单组件样式覆盖
 * 取消 el-menu 默认的右边框，使侧边栏视觉更整洁统一
 */
.wf-default-layout__menu {
  border-right: none;
}

/* ==================== 主内容区域样式 ==================== */

/**
 * 主内容区域
 * 占据侧边栏右侧的所有剩余空间
 * 浅灰色背景与白色内容卡片形成层次对比
 */
.wf-default-layout__main {
  background-color: #f5f7fa;
  overflow-y: auto;
  padding: 16px;
}
</style>
