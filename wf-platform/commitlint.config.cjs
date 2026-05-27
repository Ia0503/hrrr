/**
 * Commitlint 配置文件
 * 采用 Conventional Commits 规范，用于强制 Git 提交信息格式化
 *
 * Conventional Commits 格式：
 * <type>(<scope>): <subject>
 *
 * 示例：
 * feat(auth): 添加 JWT Token 自动刷新机制
 * fix(login): 修复验证码输入框无法粘贴的问题
 * docs(readme): 更新项目部署文档
 *
 * type（类型）可选值：
 *   feat     - 新功能（feature）
 *   fix      - Bug 修复（bugfix）
 *   docs     - 文档变更（documentation）
 *   style    - 代码格式调整（不影响代码运行）
 *   refactor - 重构（非新功能、非 Bug 修复的代码变更）
 *   perf     - 性能优化（performance）
 *   test     - 测试相关（添加或修改测试）
 *   chore    - 构建/工具链/辅助工具变更
 *
 * scope（作用域）：可选，标识本次提交影响的模块
 * subject（主题）：必填，简明描述本次变更内容
 */

/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  // 继承 Conventional Commits 规范配置
  extends: ["@commitlint/config-conventional"],

  // 自定义规则覆盖
  rules: {
    // ==================== type-body 规则 ====================

    /**
     * type 枚举值白名单
     * 2 = always（必须匹配枚举值之一）
     */
    "type-enum": [
      2,
      "always",
      [
        "feat", // 新功能
        "fix", // Bug 修复
        "docs", // 文档更新
        "style", // 格式调整
        "refactor", // 重构
        "perf", // 性能优化
        "test", // 测试相关
        "chore", // 构建/工具链
        // 以下为扩展类型（按需启用）
        // "ci",       // CI/CD 配置变更
        // "build",    // 构建系统或外部依赖变更
        // "revert",   // 回滚提交
      ],
    ],

    /**
     * type 最小长度
     * 2 = always（始终生效）
     */
    "type-min-length": [2, "always", 2],

    /**
     * type 最大长度（防止过长）
     * 2 = always（始终生效）
     */
    "type-max-length": [2, "always", 10],

    // ==================== scope 规则 ====================

    /**
     * scope 是否必填
     * 2 = always（强制填写作用域）
     * 可改为 1 = warning 或 0 = disable（按团队规范调整）
     */
    "scope-case": [2, "always", "lower-case"], // scope 必须小写

    // ==================== subject 规则 ====================

    /**
     * subject 最大长度（建议不超过 72 字符，适配 GitHub 显示）
     * 2 = always（始终限制）
     */
    "subject-max-length": [2, "always", 72],

    /**
     * subject 结尾不允许句号
     * 2 = never（禁止句号）
     */
    "subject-full-stop": [2, "never", "."],

    /**
     * subject 大小写规则
     * 2 = always（首字母小写，除非专有名词）
     */
    "subject-case": [
      2,
      "never",
      [
        "upper-case",
        "sentence-case",
        "start-case",
        "pascal-case",
      ],
    ],

    // ==================== body/footer 规则 ====================

    /**
     * body 换行最大长度
     * 2 = always（始终限制为 100 字符）
     */
    "body-max-line-length": [2, "always", 100],

    /**
     * footer 最大长度
     * 2 = always（始终限制）
     */
    "footer-max-line-length": [2, "always", 100],
  },

  // 自定义提示信息（提交不规范时显示的友好提示）
  formatter: "@commitlint/format",
};

/*
 * ========== 使用示例 ==========
 *
 * ✅ 合法提交示例：
 *   feat(auth): 添加 JWT Token 自动刷新机制
 *   fix(login): 修复验证码输入框无法粘贴的问题
 *   docs(readme): 更新项目部署文档
 *   style(format): 统一代码缩进风格
 *   refactor(user): 重构用户信息获取逻辑
 *   perf(list): 优化虚拟列表渲染性能
 *   test(unit): 补充认证模块单元测试
 *   chore(deps): 升级 Vue 至 3.4 版本
 *
 * ❌ 非法提交示例：
 *   update something                    → 缺少 type(scope) 前缀
 *   feat: 添加功能                     → 缺少 scope
 *   FEAT(auth): 新功能                 → type 大写
 *   fix(auth): Fix bug.                → subject 大写且结尾有句号
 *   fix(a very long module name that exceeds limit): xxx  → subject 过长
 */
