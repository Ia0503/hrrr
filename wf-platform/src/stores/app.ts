/**
 * App Store - 应用级全局状态管理
 * ============================
 *
 * 职责范围：
 *   - 主题模式切换（亮色 / 暗色）
 *   - 持久化到 localStorage
 *   - 系统暗色偏好跟随
 *
 * 技术栈：Pinia Setup Store 风格
 */
import { ref } from "vue";
import { defineStore } from "pinia";

/* ==================== 常量定义 ==================== */

/** localStorage 中存储主题偏好的键名 */
const THEME_STORAGE_KEY = "wf-theme";

/** 主题类型（联合类型，仅限两种值）*/
type ThemeMode = "light" | "dark";

/* ==================== Store 定义 ==================== */

export const useAppStore = defineStore("app", () => {
  /* ---------- 状态（State）---------- */

  /**
   * 当前主题模式
   * 默认值为 "light"，由 initTheme() 在应用启动时修正
   */
  const theme = ref<ThemeMode>("light");

  /** 系统媒体查询监听器引用（用于组件卸载时清理）*/
  let systemMediaQuery: MediaQueryList | null = null;
  let systemChangeListener: ((e: MediaQueryListEvent) => void) | null = null;

  /* ---------- 方法（Actions）---------- */

  /**
   * 切换主题模式
   * 在亮色和暗色之间来回切换，并同步更新：
   *   1. Pinia 状态（theme.value）
   *   2. DOM 元素类名（document.documentElement.classList）
   *   3. localStorage 持久化
   */
  function toggleTheme(): void {
    const newTheme: ThemeMode = theme.value === "light" ? "dark" : "light";

    applyTheme(newTheme);

    console.log(`[app-store] 🎨 主题已切换: ${theme.value} → ${newTheme}`);
  }

  /**
   * 应用指定主题（核心方法）
   * 统一处理状态更新、DOM 操作、持久化三件事
   *
   * @param targetTheme - 目标主题模式（'light' 或 'dark'）
   */
  function applyTheme(targetTheme: ThemeMode): void {
    /* 更新响应式状态 */
    theme.value = targetTheme;

    /* 同步修改 <html> 标签的 class（触发 CSS 变量切换）*/
    const htmlElement = document.documentElement;
    if (targetTheme === "dark") {
      htmlElement.classList.add("dark");
    } else {
      htmlElement.classList.remove("dark");
    }

    /* 持久化到 localStorage（防刷新丢失）*/
    try {
      localStorage.setItem(THEME_STORAGE_KEY, targetTheme);
    } catch (error: unknown) {
      console.warn("[app-store] ⚠️ 无法写入 localStorage:", error);
      /* 隐私模式下可能抛出异常，静默降级 */
    }
  }

  /**
   * 初始化主题
   * 应用启动时调用，按优先级确定初始主题：
   *
   * 优先级链：
   *   1. localStorage 中用户手动保存的偏好（最高）
   *   2. 操作系统/浏览器系统偏好（prefers-color-scheme）
   *   3. 默认亮色（兜底）
   *
   * 同时注册系统偏好变化监听器，实现实时跟随
   */
  function initTheme(): void {
    let resolvedTheme: ThemeMode = "light"; /* 默认兜底值 */

    /* 步骤1：尝试从 localStorage 读取用户保存的偏好 */
    const savedTheme = readSavedTheme();
    if (savedTheme) {
      resolvedTheme = savedTheme;
      console.log(`[app-store] 📖 从 localStorage 读取到保存的主题: ${resolvedTheme}`);
    } else {
      /* 步骤2：无本地记录时，读取系统偏好 */
      const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      resolvedTheme = systemPrefersDark ? "dark" : "light";
      console.log(
        `[app-store] 💻 无本地记录，跟随系统偏好: ${resolvedTheme} (prefers-color-scheme: ${
          systemPrefersDark ? "dark" : "light"
        })`,
      );
    }

    /* 应用最终确定的主题 */
    applyTheme(resolvedTheme);

    /* 步骤3：注册系统偏好变化监听（仅在用户未手动设置过时自动跟随）*/
    setupSystemPreferenceListener();

    console.log(`[app-store] ✅ 主题初始化完成，当前模式: ${theme.value}`);
  }

  /**
   * 从 localStorage 读取保存的主题
   *
   * @returns ThemeMode | null - 返回有效的主题值，无效或不存在返回 null
   */
  function readSavedTheme(): ThemeMode | null {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "dark" || raw === "light") {
        return raw;
      }
      return null; /* 值不合法视为无记录 */
    } catch (error: unknown) {
      /* localStorage 不可读（如隐私模式）*/
      console.warn("[app-store] ⚠️ 无法读取 localStorage:", error);
      return null;
    }
  }

  /**
   * 设置系统偏好变化监听器
   * 当用户在操作系统层面切换暗色/亮色模式时，
   * 如果用户之前没有手动选择过主题（即 localStorage 无记录），
   * 则自动跟随系统变化
   */
  function setupSystemPreferenceListener(): void {
    if (!window.matchMedia) {
      console.warn("[app-store] ⚠️ 当前环境不支持 matchMedia API");
      return;
    }

    systemMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    /**
     * 系统偏好变化回调
     * 仅在用户未手动覆盖时生效（检查 localStorage 是否有记录）
     */
    systemChangeListener = (event: MediaQueryListEvent): void => {
      /* 如果用户已手动保存过偏好，不跟随系统变化 */
      const hasManualOverride = localStorage.getItem(THEME_STORAGE_KEY) !== null;
      if (hasManualOverride) {
        console.log(
          `[app-store] 🔒 系统暗色偏好变化(${event.matches ? "dark" : "light"})，但用户已手动设置，忽略`,
        );
        return;
      }

      /* 自动跟随系统 */
      const newTheme: ThemeMode = event.matches ? "dark" : "light";
      applyTheme(newTheme);
      console.log(
        `[app-store] 🔄 跟随系统偏好变化 → ${newTheme}`,
      );
    };

    /* 注册监听（现代浏览器使用 addEventListener，旧版使用 addListener）*/
    if ("addEventListener" in systemMediaQuery) {
      systemMediaQuery.addEventListener("change", systemChangeListener);
    } else {
      /* 兼容 Safari < 14 等旧版浏览器 */
      (systemMediaQuery as MediaQueryList & { addListener: (fn: (e: MediaQueryListEvent) => void) => void }).addListener(systemChangeListener!);
    }

    console.log("[app-store] 👂 已注册系统偏好变化监听器");
  }

  /**
   * 清理系统偏好监听器
   * 在应用卸载时调用，防止内存泄漏
   */
  function cleanupSystemListener(): void {
    if (systemMediaQuery && systemChangeListener) {
      if ("removeEventListener" in systemMediaQuery) {
        systemMediaQuery.removeEventListener("change", systemChangeListener);
      } else {
        (systemMediaQuery as MediaQueryList & { removeListener: (fn: (e: MediaQueryListEvent) => void) => void }).removeListener(systemChangeListener);
      }
      systemMediaQuery = null;
      systemChangeListener = null;
      console.log("[app-store] 🧹 已清理系统偏好监听器");
    }
  }

  /* ---------- 返回值 ---------- */

  return {
    // 状态
    theme,
    // 方法
    toggleTheme, // 手动切换主题（点击按钮时调用）
    initTheme, // 初始化主题（App.vue 启动时调用）
    cleanupSystemListener, // 清理监听器（可选，用于卸载时）
  };
});
