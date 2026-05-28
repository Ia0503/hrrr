/**
 * @file SchemaForm 表单引擎 Composable（核心逻辑层）
 * @module composables/useSchemaForm
 * @description 基于 JSON Schema 驱动的动态表单 composable，提供表单数据管理、校验规则生成、联动规则执行、
 *             以及表单提交/重置等功能。是 SchemaForm 组件的核心逻辑实现。
 *
 * 依赖关系：
 *   - 被引用于: components/SchemaForm/SchemaForm.vue, views/task/board.vue（新建/编辑任务弹窗）
 *   - 依赖于: vue（ref, reactive, computed, watch）, async-validator, components/SchemaForm/types.ts
 */

/**
 * Schema 驱动表单核心 Composable（组合式函数）
 *
 * 封装所有响应式状态与联动逻辑，是 schema-driven form engine 的核心入口。
 * 职责包括：
 *   - 深拷贝 schema 并维护可变工作副本
 *   - 从 schema 自动初始化表单模型（含组件类型默认值推断）
 *   - 从 schema.required / schema.rules 自动构建校验规则
 *   - 核心：evaluateLinkages() —— 遍历所有联动规则并执行对应动作
 *   - 监听 formModel 变化自动触发联动评估
 *   - 暴露 validate / resetFields / clearValidate 等表单操作方法
 *
 * @example
 * ```ts
 * const {
 *   formSchemas,
 *   formModel,
 *   formRules,
 *   formRef,
 *   validate,
 *   resetFields,
 *   setFieldValue,
 *   getFormData,
 * } = useSchemaForm({
 *   schema: mySchemaArray,
 *   initialModel: { name: "张三" },
 * });
 * ```
 */

import { ref, watch } from "vue";
import type {
  SchemaFormItem,
  UseSchemaFormOptions,
  UseSchemaFormReturn,
} from "@/components/SchemaForm/types";

/* ============================================================
 * 内部辅助函数区域
 * ============================================================ */

/**
 * 根据组件类型返回合理的默认值
 *
 * 当 schema 中未指定 defaultValue 且 initialModel 中也无对应字段时，
 * 使用此函数为各组件类型提供默认初始值。
 *
 * @param component - 组件名称字符串（如 "input"、"select" 等）
 * @returns 对应组件类型的默认值
 */
function getDefaultForComponentType(component: string): unknown {
  switch (component) {
    case "input":
    case "textarea":
      return "";
    case "inputNumber":
      return 0;
    case "select":
    case "cascader":
      return null;
    case "radio":
      return "";
    case "checkbox":
      return [];
    case "switch":
      return false;
    case "slider":
      return 0;
    case "rate":
      return 0;
    case "datePicker":
    case "timePicker":
      return null;
    default:
      return undefined;
  }
}

/* ============================================================
 * 主函数：useSchemaForm
 * ============================================================ */

/**
 * Schema 驱动表单核心 Composable
 *
 * 接收 schema 配置与可选的初始模型，返回完整的表单状态与操作方法集合。
 * 内部自动完成：schema 深拷贝、模型初始化、规则构建、联动监听器注册。
 *
 * @param options - 表单配置选项
 * @param options.schema          - 原始 SchemaFormItem 数组（将被深拷贝）
 * @param options.initialModel    - 可选的外部初始值对象，优先级低于 schema.defaultValue
 * @returns 表单状态与方法集合（符合 UseSchemaFormReturn 接口）
 */
export function useSchemaForm(options: UseSchemaFormOptions): UseSchemaFormReturn {

  /* ---------- 1. Schema 深拷贝 ----------
   * 使用 JSON.parse(JSON.stringify()) 进行深拷贝：
   * - 目的：创建可变的工作副本，联动逻辑会直接修改 hidden/disabled/options 等属性
   * - 原始 schema 不应被污染，保持声明式配置的纯净性
   * - 局限性：无法处理 Date/RegExp/Function 等特殊类型，但本项目 schema 为纯数据结构，足够使用 */
  const formSchemas = ref<SchemaFormItem[]>(
    JSON.parse(JSON.stringify(options.schema)),
  );

  /* ---------- 1.5 字段可见性字典（扁平响应式，解决数组内对象深层属性变更不触发更新的问题）----------
   *
   * 【为什么需要独立的 visibleFields】
   * Vue 3 的 Proxy 可以追踪 Ref<SchemaFormItem[]> 数组引用的变化，
   * 但无法可靠追踪数组内部对象的深层属性（如 item.hidden）的变更。
   * 即使在联动评估后执行 formSchemas.value = formSchemas.value.map(item => ({...item}))
   * 创建新引用，某些边界情况下 computed 仍不会重新求值。
   *
   * 【解决方案】使用扁平的 Record<string, boolean> 结构：
   *   key = 字段名（如 "severity"）
   *   value = 是否可见（true/false）
   * 这是单层结构，Vue 的 Proxy 可以完美追踪每个属性的赋值操作。
   * SchemaForm 组件的 visibleSchemas 计算属性基于此字典过滤字段，保证联动显隐 100% 可靠。
   */
  const visibleFields = ref<Record<string, boolean>>({});
  /* 初始化：根据 schema 中的 hidden 属性设置初始可见性 */
  options.schema.forEach((item) => {
    visibleFields.value[item.field] = !item.hidden;
  });

  /* ---------- 2. 表单模型初始化 ----------
   * 遍历深拷贝后的 schema，为每个字段设置初始值：
   * 优先级：schema.defaultValue > options.initialModel > 组件类型默认值 */
  const initialModel = options.initialModel || {};
  const formModel = ref<Record<string, unknown>>({});

  formSchemas.value.forEach((item) => {
    if (!(item.field in formModel.value)) {
      const defaultValue =
        item.defaultValue ??
        initialModel[item.field] ??
        getDefaultForComponentType(item.component);

      formModel.value[item.field] = defaultValue;

      console.log(
        `[schema-form] 字段 [${item.field}] 使用默认值: ${JSON.stringify(defaultValue)}`,
      );
    }
  });

  /* ---------- 3. 校验规则构建 ---------- */
  const formRules = ref<Record<string, Array<any>>>({});

  /**
   * 从当前 formSchemas 重新构建校验规则
   *
   * 遍历每个 schema 项：
   * - 若 item.required === true → 自动注入必填校验规则
   * - 合并用户在 schema 中自定义的 item.rules
   * - 结果存入 formRules.value[item.field]
   */
  function buildRules(): void {
    // 先清空已有规则，避免增量构建导致旧规则残留
    formRules.value = {};

    formSchemas.value.forEach((item) => {
      const rules: Array<any> = [];

      /* 必填规则：当 schema 声明 required 时自动生成 */
      if (item.required === true) {
        rules.push({
          required: true,
          message: `${item.label}不能为空`,
          trigger: "blur",
        });
      }

      /* 合并 schema 中用户自定义的校验规则 */
      if (item.rules && Array.isArray(item.rules)) {
        rules.push(...item.rules);
      }

      /* 仅在有规则时才赋值，避免空数组占用内存 */
      if (rules.length > 0) {
        formRules.value[item.field] = rules;
      }

      console.log(
        `[schema-form] 构建校验规则: [${item.field}] (${rules.length} 条规则)`,
      );
    });
  }

  // 首次调用构建规则
  buildRules();
  console.log("[SchemaForm] [INFO] 初始化校验规则:", JSON.stringify(formRules.value, null, 2));

  /* ---------- 4. 表单引用（用于调用 el-form 的 validate/resetFields 等）---------- */
  const formRef = ref<any>(null);

  /* ============================================================
   * 核心：联动评估引擎 evaluateLinkages()
   * ============================================================
   *
   * 【设计思路】
   * 这是整个 composable 最核心的函数。每当 formModel 发生变化时被 watch 触发，
   * 遍历 formSchemas 中每个字段的 linkageRules，逐条评估条件并执行对应动作。
   *
   * 【支持的联动动作类型】
   * - VISIBLE   : 控制字段显示/隐藏（修改 item.hidden）
   * - DISABLED  : 控制字段禁用/可用（修改 item.disabled）
   * - OPTIONS   : 动态替换字段选项列表（修改 item.options）
   * - REQUIRED  : 动态增删必填校验规则（修改 formRules）
   * - SET_VALUE : 联动设置字段值（修改 formModel）
   *
   * 【响应式保证】
   * - Vue 3 基于 Proxy 的响应式系统可以追踪到数组内部对象属性的变更
   * - 但对于 options 替换，必须创建新数组引用 [...newOptions] 才能可靠触发视图更新
   * ============================================================ */

  /**
   * 执行全量联动规则评估
   *
   * 遍历 formSchemas 中每个拥有 linkageRules 的字段，
   * 逐一评估每条规则的 condition，若满足则执行对应 action。
   *
   * 条件判断支持三种模式：
   *   1. 函数型：rule.condition(watchedValue) → 返回 boolean
   *   2. 数组型：rule.condition.includes(watchedValue) → 值是否在候选列表中
   *   3. 字面量型：watchedValue === rule.condition → 严格相等比较
   */
  function evaluateLinkages(): void {
    let evaluatedCount = 0; // 累计评估的规则总数

    console.log("[schema-form] [联动] ====== 开始评估联动规则 ======");

    /* ---- 外层循环：遍历每个 schema 字段 ---- */
    for (const item of formSchemas.value) {

      /* 跳过没有联动规则的字段 */
      if (!item.linkageRules || item.linkageRules.length === 0) {
        continue;
      }

      /* ---- 内层循环：遍历该字段下的每条联动规则 ---- */
      for (const rule of item.linkageRules) {
        evaluatedCount++;

        /**
         * 步骤一：获取被监听字段的当前值
         * rule.condition.watchField 指定了本条规则依赖哪个字段的值变化
         */
        const watchedValue = formModel.value[rule.condition.watchField];

        /**
         * 步骤二：评估条件是否满足
         * 根据 condition 的类型选择不同的比较策略
         * 返回布尔值表示条件是否成立
         */
        const evaluateCondition = (): boolean => {
          /**
           * 【条件值提取】
           *
           * 联动规则的 condition 字段支持两种格式：
           *   1. 条件描述符对象（当前 TaskForm 使用的格式）：
           *      { watchField: "xxx", condition: "bug" | fn | [...] }
           *      此时需从嵌套的 .condition 属性中取实际条件值
           *   2. 直接值（向后兼容，简化场景可直接传值）：
           *      "bug" | true | fn | [...]
           *      直接用作比较目标
           */
          const rawCondition = rule.condition;
          /* 判断是否为条件描述符对象（同时拥有 watchField + condition 属性） */
          const isConditionDescriptor =
            rawCondition !== null &&
            typeof rawCondition === "object" &&
            "watchField" in (rawCondition as object) &&
            "condition" in (rawCondition as object);
          /* 从嵌套结构中提取实际条件值，或直接使用原始值 */
          const actualCondition = isConditionDescriptor
            ? (rawCondition as LinkageCondition).condition
            : rawCondition;

          if (typeof actualCondition === "function") {
            return (actualCondition as (val: unknown) => boolean)(watchedValue);
          } else if (Array.isArray(actualCondition)) {
            return (actualCondition as unknown[]).includes(watchedValue);
          } else {
            return watchedValue === actualCondition;
          }
        };

        /**
         * 步骤三：根据条件结果执行对应动作
         *
         * action 值规范化流程（兼容多种写法）：
         *   "visible" / "VISIBLE" / "Visible"     →  "VISIBLE"
         *   "setValue" / "SET_VALUE" / "set_value" →  "SET_VALUE"
         *   "disabled" / "DISABLED"               →  "DISABLED"
         *
         * 实现原理（关键顺序：先检测驼峰边界 → 再统一大写）：
         *   1. 在驼峰边界处插入下划线：匹配"小写字母+大写字母"的模式
         *      "setValue" → "set_Value"（t 和 V 之间插入 _）
         *      "visible"  → "visible"（无驼峰边界，不变）
         *   2. 全部转大写：
         *      "set_Value" → "SET_VALUE"（示例：转换成功）
         *      "visible"   → "VISIBLE"（示例：转换成功）
         *
         * ⚠️ 必须先插入下划线再转大写，反过来会导致全大写字符串无法区分驼峰边界
         */
        const rawAction = rule.action as string;
        const normalizedAction = rawAction
          .replace(/([a-z])([A-Z])/g, "$1_$2")
          .toUpperCase();

        if (evaluateCondition()) {
          switch (normalizedAction) {

            /* ------ VISIBLE：控制显隐 ------ */
            case "VISIBLE": {
              // actionParams 为布尔值：true 表示可见，false 表示隐藏
              // 写入独立的 visibleFields 扁平字典（而非 item.hidden），
              // 确保 Vue 3 响应式系统能可靠追踪到变化并触发视图更新
              const isVisible = !!rule.actionParams;
              visibleFields.value[item.field] = isVisible;

              console.log(
                `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                `字段 [${item.field}] → 设为${isVisible ? "可见" : "隐藏"} ` +
                `(监听 [${rule.condition.watchField}] = ${JSON.stringify(watchedValue)})`,
              );
              break;
            }

            /* ------ DISABLED：控制禁用 ------ */
            case "DISABLED": {
              // actionParams 为布尔值：true 表示禁用，false 表示启用
              item.disabled = !!rule.actionParams;

              console.log(
                `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                `字段 [${item.field}] → 设为${rule.actionParams ? "禁用" : "可用"}`,
              );
              break;
            }

            /* ------ OPTIONS：动态替换选项列表 ------ */
            case "OPTIONS": {
              // 关键：必须创建新数组引用，确保 Vue 响应式系统能检测到变化
              // 直接修改原数组引用的内容可能不会触发重新渲染
              if (Array.isArray(rule.actionParams)) {
                item.options = [...rule.actionParams];
              }

              console.log(
                `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                `字段 [${item.field}] → 选项已更新 (${Array.isArray(rule.actionParams) ? rule.actionParams.length : 0} 个)`,
              );
              break;
            }

            /* ------ REQUIRED：动态增删必填校验 ------ */
            case "REQUIRED": {
              const shouldRequired = !!rule.actionParams;
              const currentRules = formRules.value[item.field] || [];
              const hasRequiredRule = currentRules.some((r) => r.required === true);

              if (shouldRequired && !hasRequiredRule) {
                /* 需要变为必填但当前无必填规则 → 注入必填规则后重建 */
                currentRules.unshift({
                  required: true,
                  message: `${item.label}不能为空`,
                  trigger: "blur",
                });
                formRules.value[item.field] = currentRules;

                console.log(
                  `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                  `字段 [${item.field}] → 已添加必填校验`,
                );
              } else if (!shouldRequired && hasRequiredRule) {
                /* 需要移除必填但当前存在必填规则 → 过滤掉后重建 */
                formRules.value[item.field] = currentRules.filter(
                  (r) => r.required !== true,
                );

                console.log(
                  `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                  `字段 [${item.field}] → 已移除必填校验`,
                );
              } else {
                console.log(
                  `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                  `字段 [${item.field}] → 必填状态未变（当前=${hasRequiredRule}，目标=${shouldRequired}）`,
                );
              }
              break;
            }

            /* ------ SET_VALUE：联动设值 ------ */
            case "SET_VALUE": {
              // 直接写入 formModel，这会触发 watch → 再次进入 evaluateLinkages
              // 形成链式联动：A 变化 → 设置 B 的值 → B 的变化触发 C 的联动规则
              formModel.value[item.field] = rule.actionParams;

              console.log(
                `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                `字段 [${item.field}] → 值已设为 ${JSON.stringify(rule.actionParams)}`,
              );
              break;
            }

            default: {
              console.warn(
                `[schema-form] [联动] [WARN] 未知的联动动作类型: ${String(rule.action)}，` +
                `规则 ID: ${rule.id || "anonymous"}`,
              );
              break;
            }
          }
        }
        /* ---- 条件不满足时的处理 ----
         * 当前实现：对于 VISIBLE/DISABLED/OPTIONS 类型的动作，
         * 条件为假时不做回退处理（保持上一次联动设置的最终状态）。
         *
         * 如需支持"恢复默认状态"功能，可在后续版本中引入 defaultState 快照机制：
         *   - 在初始化时记录每个字段的原始 hidden/disabled/options 状态
         *   - 条件为假时从快照中恢复对应属性
         */
      }
    }

    /* 输出本次联动评估汇总日志 */
    console.log(
      `[schema-form] [联动] 本次联动评估完成，共扫描 ${evaluatedCount} 条规则`,
    );
  }

  /* ============================================================
   * Watch 监听器：formModel 变化 → 自动触发联动评估
   * ============================================================ */

  /**
   * 深度监听 formModel 的变化
   *
   * 当任意字段值发生变化时：
   *   1. 通过新旧值对比精确定位变化的字段名
   *   2. 输出变化字段列表日志
   *   3. 调用 evaluateLinkages() 执行全量联动评估
   *
   * { deep: true } 确保嵌套对象/数组内的变化也能被捕获
   */
  watch(
    formModel,
    (newVal, oldVal) => {
      /** 逐字段对比新旧值，收集实际发生变化的字段名 */
      const changedFields: string[] = [];
      for (const key of Object.keys(newVal)) {
        if (newVal[key] !== oldVal?.[key]) {
          changedFields.push(key);
        }
      }

      if (changedFields.length > 0) {
        console.log(
          `[schema-form] [联动] 检测到字段变化: [${changedFields.join(", ")}]，开始评估联动规则...`,
        );
        evaluateLinkages();
      }
    },
    { deep: true },
  );

  /* ============================================================
   * 公共方法区域
   * ============================================================ */

  /**
   * 执行表单校验
   *
   * 委托给底层 el-form 实例的 validate() 方法。
   * 若 formRef 尚未挂载（如组件还未渲染），输出警告并返回 false。
   *
   * @returns Promise<boolean> 校验是否通过（true=通过，false=未通过或无法校验）
   */
  async function validate(): Promise<boolean> {
    if (!formRef.value) {
      console.warn("[schema-form] [WARN] 表单 ref 未挂载，无法执行校验");
      return false;
    }

    try {
      await formRef.value.validate();
      console.log("[schema-form] [INFO] 表单校验通过");
      return true;
    } catch (errors) {
      console.warn("[schema-form] [ERROR] 表单校验未通过:", errors);
      return false;
    }
  }

  /**
   * 重置表单所有字段至默认值
   *
   * 将每个字段重置为其 schema 中声明的 defaultValue，
   * 或组件类型的默认值（当 defaultValue 未定义时）。
   * 同时委托给 el-form 的 resetFields 清除校验状态。
   */
  function resetFields(): void {
    formSchemas.value.forEach((item) => {
      const resetValue =
        item.defaultValue ?? getDefaultForComponentType(item.component);
      formModel.value[item.field] = resetValue;
    });

    /* 委托给 el-form 实例清除校验状态（红色提示文字等） */
    if (formRef.value?.resetFields) {
      formRef.value.resetFields();
    }

    console.log("[schema-form] [INFO] 表单已重置，所有字段恢复默认值");
  }

  /**
   * 清除指定字段的校验状态
   *
   * 委托给 el-form 实例的 clearValidate 方法。
   * 不传参数时清除全部字段的校验状态。
   *
   * @param fields - 可选，要清除校验的字段名数组；不传则清除全部
   */
  function clearValidate(fields?: string[]): void {
    if (!formRef.value) {
      console.warn("[schema-form] [WARN] 表单 ref 未挂载，无法清除校验状态");
      return;
    }

    formRef.value.clearValidate(fields);

    console.log(
      `[schema-form] 🧹 已清除校验状态` +
        (fields ? `: [${fields.join(", ")}]` : "（全部字段）"),
    );
  }

  /**
   * 获取当前表单数据快照
   *
   * 返回 formModel 的浅拷贝，避免外部直接修改响应式对象。
   * 适用于提交表单前获取数据、导出等场景。
   *
   * @returns Record<string, unknown> 当前表单数据的副本
   */
  function getFormData(): Record<string, unknown> {
    const data = { ...formModel.value };
    console.log(
      `[schema-form] [INFO] 获取表单数据快照，共 ${Object.keys(data).length} 个字段`,
    );
    return data;
  }

  /**
   * 手动设置某个字段的值
   *
   * 直接写入 formModel，**会自动触发 watch 监听器**
   * 进而调用 evaluateLinkages() 执行联动评估。
   * 这意味着通过此方法设值可以驱动链式联动反应。
   *
   * @param field - 目标字段名（对应 schema 中的 field 属性）
   * @param value - 要设置的值
   */
  function setFieldValue(field: string, value: unknown): void {
    formModel.value[field] = value;

    console.log(
      `[schema-form] 手动设置字段 [${field}] = ${JSON.stringify(value)}`,
    );
  }

  /* ============================================================
   * 返回值：暴露给调用方的完整接口
   * ============================================================ */
  return {
    // --- 响应式状态 ---
    formSchemas,       // 可变的 schema 工作副本（联动会修改其 hidden/disabled/options 等）
    formModel,         // 表单数据模型（字段名→值的映射）
    formRules,         // 校验规则集（字段名→规则数组）
    visibleFields,     // 字段可见性字典（扁平 Record<field, boolean>，联动显隐专用）
    formRef,           // el-form 组件实例引用（需由调用方通过 ref 绑定）

    // --- 操作方法 ---
    validate,          // 异步校验表单，返回是否通过
    resetFields,       // 重置所有字段至默认值
    clearValidate,     // 清除校验提示状态
    getFormData,       // 获取表单数据快照
    setFieldValue,     // 手动设置字段值（触发联动）
    triggerLinkages: evaluateLinkages, // 手动触发联动评估（供外部事件驱动调用）
  };
}
