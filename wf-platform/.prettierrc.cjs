/**
 * Prettier 格式化配置文件
 * 严格遵循团队编码规范：双引号、分号、2空格、尾逗号all、80字符换行
 */

module.exports = {
  // ==================== 基础格式规则 ====================

  /**
   * 是否在语句末尾添加分号
   * true = 强制分号（符合团队规范）
   */
  semi: true,

  /**
   * 使用单引号还是双引号
   * false = 使用双引号（符合团队规范）
   */
  singleQuote: false,

  /**
   * 缩进空格数
   * 2 = 2 空格缩进（符合团队规范）
   */
  tabWidth: 2,

  /**
   * 使用 tab 还是空格缩进
   * false = 使用空格缩进
   */
  useTabs: false,

  // ==================== 尾逗号与换行 ====================

  /**
   * 尾逗号策略
   * "all" = 在所有可能的场景添加尾逗号（对象、数组、函数参数、import 等）
   * 符合团队规范，便于 git diff 和版本控制
   */
  trailingComma: "all",

  /**
   * 行宽限制（字符数）
   * 80 = 约80字符换行（符合团队规范）
   * 超过此长度将尝试折行
   */
  printWidth: 80,

  // ==================== 换行符与括号 ====================

  /**
   * 换行符类型
   * "lf" = Unix 风格（\n）—— 跨平台一致性推荐
   * "crlf" = Windows 风格（\r\n）
   * "auto" = 根据操作系统自动选择
   */
  endOfLine: "lf",

  /**
   * 对象字面量括号内是否加空格
   * true = { foo: bar }
   * false = {foo: bar}
   */
  bracketSpacing: true,

  /**
   * JSX 标签的 > 是否另起一行
   * false = <div>
   * true = <div
   *        >
   */
  bracketSameLine: false,

  /**
   * 箭头函数单个参数是否加括号
   * "always" = (x) => x
   * "avoid" = x => x（当单个参数时可省略括号）
   */
  arrowParens: "always",

  // ==================== Vue/HTML 特定规则 ====================

  /**
   * Vue 文件中 script 和 style 标签是否缩进
   * false = 不缩进（保持标签顶格，符合大多数编辑器习惯）
   */
  vueIndentScriptAndStyle: false,

  /**
   * HTML 标签属性是否垂直排列
   * false = 尽量放在同一行
   */
  htmlWhitespaceSensitivity: "css",
};
