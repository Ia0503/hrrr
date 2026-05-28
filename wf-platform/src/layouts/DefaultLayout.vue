<!--
  DefaultLayout 默认布局组件
  ============================
  响应式双模式布局：

  大屏（≥1024px）经典后台：
    ┌──────────────────────────────────────┐
    │  Header: Logo + 用户名               │
    ├──────────┬───────────────────────────┤
    │          │                           │
    │ 侧边栏   │      主内容区              │
    │（不折叠）│                           │
    │          │                           │
    └──────────┴───────────────────────────┘

  小屏（<1024px）移动端：
    ┌──────────────────────────────────────┐
    │  Logo        [仪表盘] [看板] [系统▾]  │  ← 水平导航
    ├──────────────────────────────────────┤
    │                                      │
    │           主内容区                    │
    │         （纵向全宽）                  │
    │                                      │
    └──────────────────────────────────────┘
-->
<script setup lang="ts">
/**
 * DefaultLayout 组件 - 应用主布局容器（响应式双模式）
 *
 * 技术栈：Vue 3 Composition API + TypeScript + Element Plus + Pinia
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessageBox, ElMessage } from "element-plus";
import { useUserStore } from "@/stores/user";

/* ==================== 实例初始化 ==================== */

const router = useRouter();
const userStore = useUserStore();

/* ==================== 响应式状态 ==================== */

/** 当前激活的菜单项索引 */
const activeMenu = ref("");

/** 移动端导航是否展开 */
const isMobileNavOpen = ref(false);

/* ==================== 计算属性 ==================== */

/** 过滤后的可见菜单列表 */
const visibleMenuList = computed(() => {
  const menuList = userStore.userInfo?.menuList || [];
  return menuList.filter((item) => item.meta.hidden !== true);
});

/** 当前登录用户的昵称 */
const username = computed(() => {
  return userStore.userInfo?.nickname || "未登录";
});

/** 判断当前路由是否为系统管理下的子页面 */
const isInSystemPage = computed(() => {
  return router.currentRoute.value.path.startsWith("/system");
});

/* ==================== 方法定义 ==================== */

/** 菜单点击 */
const handleMenuClick = (path: string, name: string) => {
  console.log(`[DefaultLayout] 菜单点击: ${name} -> ${path}`);
  router.push(path);
  isMobileNavOpen.value = false; /* 移动端点击后关闭导航 */
};

/** 移动端切换导航显示 */
const toggleMobileNav = () => {
  isMobileNavOpen.value = !isMobileNavOpen.value;
};

/**
 * 退出登录
 * 二次确认后清除用户状态并跳转到登录页
 */
async function handleLogout(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      "确定要退出登录吗？",
      "退出确认",
      { confirmButtonText: "确定退出", cancelButtonText: "取消", type: "warning" },
    );

    /* 调用 userStore 的 logout 方法清除 Token 和用户状态 */
    userStore.logout();

    ElMessage.success("已退出登录");

    /* 跳转到登录页（不携带 redirect 参数，因为已要求统一跳转仪表盘）*/
    router.push("/login");
  } catch (error: unknown) {
    if ((error as Error)?.message !== "cancel") {
      console.error("[DefaultLayout] 退出失败:", error);
    }
    /* 用户点击"取消"时不做任何操作 */
  }
}
</script>

<template>
  <el-container class="wf-default-layout">

    <!-- ==================== 顶部导航栏区域 ==================== -->
    <el-header class="wf-default-layout__header">
      <!-- 左侧：Logo + 移动端汉堡按钮 -->
      <div class="wf-default-layout__header-left">
        <h1 class="wf-default-layout__logo">WF Platform</h1>

        <!-- 移动端汉堡菜单按钮（仅小屏显示） -->
        <button
          class="wf-default-layout__mobile-toggle"
          :class="{ 'wf-default-layout__mobile-toggle--active': isMobileNavOpen }"
          @click="toggleMobileNav"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      <!-- 右侧：用户信息 + 退出按钮 -->
      <div class="wf-default-layout__header-right">
        <span class="wf-default-layout__username">{{ username }}</span>
        <button
          class="wf-default-layout__logout-btn"
          type="button"
          @click="handleLogout"
        >
          退出
        </button>
      </div>
    </el-header>

    <!-- ==================== 主体区域（侧边栏 + 主内容） ==================== -->
    <el-container class="wf-default-layout__body">

      <!-- ==================== 左侧边栏（大屏） / 顶部横条导航（小屏） ==================== -->
      <el-aside
        width="180px"
        class="wf-default-layout__aside"
        :class="{ 'wf-default-layout__aside--hidden': isMobileNavOpen === false }"
      >
        <el-menu
          :collapse="false"
          router
          :default-active="activeMenu"
          background-color="#001529"
          text-color="#ffffffa6"
          active-text-color="#409eff"
          :unique-opened="true"
          class="wf-default-layout__menu"
        >
          <template v-for="menuItem in visibleMenuList" :key="menuItem.path">
            <!-- 有子菜单 → sub-menu -->
            <el-sub-menu
              v-if="menuItem.children && menuItem.children.length > 0"
              :index="menuItem.path"
            >
              <template #title>
                <span>{{ menuItem.meta.title }}</span>
              </template>
              <template v-for="child in menuItem.children" :key="child.path">
                <!-- 三级及以上 -->
                <el-sub-menu
                  v-if="child.children && child.children.length > 0"
                  :index="child.path"
                >
                  <template #title>
                    <span>{{ child.meta.title }}</span>
                  </template>
                  <el-menu-item
                    v-for="grandChild in child.children"
                    :key="grandChild.path"
                    :index="grandChild.path"
                    @click="handleMenuClick(grandChild.path, grandChild.meta.title)"
                  >
                    {{ grandChild.meta.title }}
                  </el-menu-item>
                </el-sub-menu>

                <!-- 二级叶子 -->
                <el-menu-item
                  v-else
                  :index="child.path"
                  @click="handleMenuClick(child.path, child.meta.title)"
                >
                  {{ child.meta.title }}
                </el-menu-item>
              </template>
            </el-sub-menu>

            <!-- 无子菜单 → 直接渲染 -->
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

      <!-- ==================== 移动端遮罩层（点击关闭导航） ==================== -->
      <div
        v-if="isMobileNavOpen"
        class="wf-default-layout__overlay"
        @click="isMobileNavOpen = false"
      />

      <!-- ==================== 主内容区域 ==================== -->
      <el-main class="wf-default-layout__main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
/* ==================== 布局根容器样式 ==================== */

.wf-default-layout {
  width: 100%;
  height: 100vh;
}

/* ==================== 顶部导航栏样式 ==================== */

.wf-default-layout__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background-color: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  z-index: 100;
  position: relative;
}

.wf-default-layout__header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wf-default-layout__logo {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #1890ff;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

/* 移动端汉堡菜单按钮（默认隐藏，≤1024px 显示）*/
.wf-default-layout__mobile-toggle {
  display: none;
  flex-direction: column;
  justify-content: space-around;
  width: 28px;
  height: 22px;
  padding: 0;
  border: none;
  background-color: transparent;
  cursor: pointer;
  transition: all 0.2s ease;
}

.wf-default-layout__mobile-toggle span {
  display: block;
  width: 100%;
  height: 2.5px;
  background-color: #333;
  border-radius: 2px;
  transition: all 0.3s ease;
  transform-origin: center;
}

/* 汉堡变 X 动画 */
.wf-default-layout__mobile-toggle--active span:nth-child(1) {
  transform: translateY(9.5px) rotate(45deg);
}
.wf-default-layout__mobile-toggle--active span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}
.wf-default-layout__mobile-toggle--active span:nth-child(3) {
  transform: translateY(-9.5px) rotate(-45deg);
}

.wf-default-layout__header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.wf-default-layout__username {
  font-size: 14px;
  color: #333;
}

/** 退出登录按钮 */
.wf-default-layout__logout-btn {
  padding: 5px 14px;
  font-size: 13px;
  color: #666;
  background-color: transparent;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.wf-default-layout__logout-btn:hover {
  color: #f56c6c;
  border-color: #f56c6c;
  background-color: #fef0f0;
}

.wf-default-layout__logout-btn:active {
  transform: scale(0.97);
}

/* ==================== 主体区域样式 ==================== */

.wf-default-layout__body {
  overflow: hidden;
}

/* ==================== 侧边栏样式 ==================== */

.wf-default-layout__aside {
  background-color: #001529;
  overflow-x: hidden;
  overflow-y: auto;
  /* 大屏固定宽度，不折叠 */
  width: 180px !important;
  min-width: 180px !important;
  max-width: 180px !important;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

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

.wf-default-layout__menu {
  border-right: none;
}

/* ==================== 遮罩层（移动端侧边栏打开时显示） ==================== */

.wf-default-layout__overlay {
  display: none;
}

/* ==================== 主内容区域样式 ==================== */

.wf-default-layout__main {
  background-color: #f5f7fa;
  overflow-y: auto;
  padding: 16px;
}

/* ============================================================
 * 响应式断点：< 1024px — 移动端/平板竖屏
 * ============================================================ */
@media screen and (max-width: 1023px) {

  /* ---- 顶部导航栏 ---- */
  .wf-default-layout__header {
    padding: 0 12px;
  }

  .wf-default-layout__logo {
    font-size: 15px;
  }

  /* 显示汉堡按钮 */
  .wf-default-layout__mobile-toggle {
    display: flex;
  }

  .wf-default-layout__username {
    font-size: 13px;
  }

  .wf-default-layout__logout-btn {
    padding: 4px 10px;
    font-size: 12px;
  }

  /* ---- 侧边栏变为滑出式抽屉 ---- */
  .wf-default-layout__aside {
    position: fixed;
    top: 60px; /* header 高度 */
    left: 0;
    bottom: 0;
    z-index: 200;
    width: 200px !important;
    min-width: 200px !important;
    max-width: 200px !important;
    transform: translateX(-100%); /* 默认滑出屏幕左侧 */
    box-shadow: 4px 0 16px rgba(0, 0, 0, 0.2);
  }

  /* 打开时滑入 */
  .wf-default-layout__aside:not(.wf-default-layout__aside--hidden) {
    transform: translateX(0);
  }

  /* 显示遮罩 */
  .wf-default-layout__overlay {
    display: block;
    position: fixed;
    top: 60px;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.35);
    z-index: 150;
  }

  /* ---- 主内容区占满宽度 ---- */
  .wf-default-layout__main {
    padding: 12px;
  }
}

/* ============================================================
 * 超小屏：< 640px — 手机竖屏
 * ============================================================ */
@media screen and (max-width: 639px) {
  .wf-default-layout__header {
    padding: 0 10px;
  }

  .wf-default-layout__logo {
    font-size: 14px;
  }

  .wf-default-layout__main {
    padding: 8px;
  }
}
</style>
