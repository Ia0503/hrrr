/**
 * ESLint Flat Config 配置文件
 * 适配 Vue3 + TypeScript + Prettier 工程规范
 *
 * 使用 ESLint v9+ 的扁平化配置格式 (flat config)
 * 替代已废弃的 .eslintrc.* 格式
 *
 * 规则集说明：
 * - @eslint/js: ESLint 基础推荐规则
 * - plugin:vue/vue3-recommended: Vue3 最佳实践规则
 * - @typescript-eslint/recommended: TypeScript 类型检查规则
 * - eslint-config-prettier: 关闭与 Prettier 冲突的格式化规则
 */

import js from "@eslint/js";
import pluginVue from "eslint-plugin-vue";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import vueParser from "vue-eslint-parser";

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ==================== 基础配置：忽略文件 ====================
  {
    ignores: [
      "dist/**", // 构建输出目录
      "node_modules/**", // 依赖目录
      "*.min.*", // 压缩文件
      ".husky/**", // Git Hooks 目录
    ],
  },

  // ==================== CommonJS 配置文件（.cjs） ====================
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs", // CommonJS 模块格式
      ecmaVersion: 2022,
      globals: {
        /** CommonJS 全局变量 */
        module: "writable",
        require: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
      },
    },
  },

  // ==================== 全局配置：JavaScript 规则 ====================
  js.configs.recommended,

  // ==================== Vue3 配置（含规则） ====================
  ...pluginVue.configs["flat/recommended"],

  // ==================== TypeScript 配置 ====================
  ...tseslint.configs.recommended,

  // ==================== Prettier 兼容：关闭冲突规则 ====================
  prettierConfig,

  // ==================== 自定义规则与覆盖 ====================
  {
    files: ["**/*.{js,ts,vue}"], // 匹配所有业务代码文件
    languageOptions: {
      globals: {},
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },

    rules: {
      // ==================== Vue 相关规则 ====================

      /** 组件名强制多单词，忽略索引和布局组件 */
      "vue/multi-word-component-names": [
        "error",
        {
          ignores: ["index", "DefaultLayout", "AuthLayout", "404", "board"],
        },
      ],

      /** v-html 存在 XSS 风险，仅警告不报错 */
      "vue/no-v-html": "warn",

      /** 关闭 prop 必须设默认值的要求 */
      "vue/require-default-prop": "off",

      /** 强制 prop 声明类型 */
      "vue/require-prop-types": "error",

      // ==================== TypeScript 相关规则 ====================

      /** 禁止使用 any 类型（复杂场景允许但需注释说明） */
      "@typescript-eslint/no-explicit-any": [
        "warn",
        {
          fixToUnknown: false,
          ignoreRestArgs: true,
        },
      ],

      /** 禁止空函数体 */
      "@typescript-eslint/no-empty-function": "warn",

      /** 允许显式返回类型注解冗余（提升可读性） */
      "@typescript-eslint/no-inferrable-types": "off",

      /** 禁止未使用的变量（以 _ 开头可豁免） */
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ==================== 通用规则 ====================

      /** console 保留（开发调试用） */
      "no-console": "off",

      /** debugger 仅在生产环境报错 */
      "no-debugger": process.env.NODE_ENV === "production" ? "error" : "off",

      /** 由 TS 的 noImplicitAny 处理，此处关闭避免重复 */
      "no-undef": "off",
    },
  },

  // ==================== TS 文件专属规则 ====================
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "no-redeclare": "off",
    },
  },

  // ==================== Vue SFC 解析器（最高优先级，放最后确保不被覆盖）====================
  {
    files: ["**/*.vue"],
    languageOptions: {
      /**
       * 强制使用 vue-eslint-parser 解析 .vue 文件
       * 该解析器能正确处理 <template>、<script>、<style> 块
       * 必须放在配置数组末尾，防止被其他配置的解析器设置覆盖
       */
      parser: vueParser,
      parserOptions: {
        /** <script> 内的 TS 代码由 @typescript-eslint/parser 处理 */
        parser: "@typescript-eslint/parser",
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  },
];
