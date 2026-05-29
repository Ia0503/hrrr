/**
 * @file SchemaForm 表单引擎 Composable（核心逻辑层）
 * @module composables/useSchemaForm
 * @description 基于 JSON Schema 驱动的动态表单 composable，提供表单数据管理、校验规则生成、联动规则执行、
 *             以及表单提交/重置等功能。支持扁平字段和嵌套树形结构（通过路径式 field 如 "address.city"）。
 *             是 SchemaForm 组件的核心逻辑实现。
 *
 * 依赖关系：
 *   - 被引用于: components/SchemaForm/SchemaForm.vue, views/task/board.vue（新建/编辑任务弹窗）
 *   - 依赖于: vue（ref, reactive, computed, watch）、async-validator、components/SchemaForm/types.ts
 *
 * 嵌套支持说明：
 *   本版本新增对树形嵌套 schema 的完整支持，包括：
 *   - 路径式字段名："address.city" 自动映射为 formModel.address.city 的嵌套对象
 *   - 递归初始化：自动创建中间层级对象，无需手动构建初始嵌套结构
 *   - 递归校验：el-form 原生支持 "address.city" 格式的 prop 路径校验
 *   - 递归联动：联动引擎递归遍历所有层级的 linkageRules
 */

/**
 * Schema 驱动表单核心 Composable（组合式函数）
 *
 * 封装所有响应式状态与联动逻辑，是 schema-driven form engine 的核心入口。
 * 职责包括：
 *   - 深拷贝 schema 并维护可变工作副本
 *   - 从 schema 自动初始化表单模型（含组件类型默认值推断 + 嵌套路径展开）
 *   - 从 schema.required / schema.rules 自动构建校验规则（递归收集）
 *   - 核心：evaluateLinkages() —— 递归遍历所有层级执行联动动作
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
import { SchemaNodeType } from "@/components/SchemaForm/types";

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
 * 路径工具函数（支持嵌套字段的点分路径操作）
 * ============================================================ */

/**
 * 将点分路径字符串解析为路径段数组
 *
 * @example parsePath("address.city")       → ["address", "city"]
 * @example parsePath("user.profile.name")  → ["user", "profile", "name"]
 * @example parsePath("title")              → ["title"]
 *
 * @param path - 点分路径字符串（如 "address.city"）
 * @returns 路径段字符串数组
 */
function parsePath(path: string): string[] {
  return path.split(".");
}

/**
 * 从嵌套对象中按路径取值
 *
 * 沿路径逐层深入对象，返回最终目标值。
 * 若路径中途遇到 undefined/null，安全地返回 undefined 而非抛异常。
 *
 * @example getByPath({ address: { city: "北京" } }, "address.city") → "北京"
 * @example getByPath({}, "address.city")                          → undefined
 *
 * @param obj - 目标对象（通常是 formModel.value）
 * @param path - 点分路径字符串
 * @returns 路径指向的值，不存在时返回 undefined
 */
function getByPath(obj: Record<string, any>, path: string): unknown {
  const keys = parsePath(path);
  let current: any = obj;

  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * 向嵌套对象中按路径设值
 *
 * 沿路径逐层深入对象，若中间层级不存在则自动创建空对象 {}，
 * 最终在目标位置写入值。会触发 Vue 3 Proxy 的响应式追踪。
 *
 * @example
 * // 设值前: formModel = {}
 * // setByPath(formModel, "address.city", "北京")
 * // 设值后: formModel = { address: { city: "北京" } }
 *
 * @param obj - 目标对象（通常是 formModel.value）
 * @param path - 点分路径字符串
 * @param value - 要设置的值
 */
function setByPath(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = parsePath(path);
  /* 最后一个键是实际赋值目标，前面的键都是中间层级 */
  const lastKey = keys[keys.length - 1];
  const parentKeys = keys.slice(0, -1);

  let current: any = obj;

  /* 逐层创建不存在的中间对象 */
  for (const key of parentKeys) {
    if (current[key] === undefined || current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }

  /* 在最终位置写入值 */
  current[lastKey] = value;
}

/**
 * 确保路径上的所有中间对象都已存在（不写入值，仅确保结构完整）
 *
 * 用于初始化阶段预构建嵌套对象结构，避免后续 setByPath 创建新对象
 * 时丢失响应性（Vue 3 的 Proxy 对后续添加的属性也能追踪，但显式初始化更安全）。
 *
 * @param obj - 目标对象
 * @param path - 点分路径字符串
 */
function ensurePathExists(obj: Record<string, any>, path: string): void {
  const keys = parsePath(path);
  const parentKeys = keys.slice(0, -1);

  let current: any = obj;
  for (const key of parentKeys) {
    if (current[key] === undefined || current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
}

/* ============================================================
 * Schema 树递归遍历工具
 * ============================================================ */

/**
 * 递归遍历 Schema 树的所有节点，对每个叶子字段执行回调
 *
 * 支持任意深度的嵌套结构，自动跳过容器节点只处理叶子字段。
 * 回调函数接收当前叶子字段的 SchemaFormItem 作为参数。
 *
 * @param items - 当前层级的 Schema 数组
 * @param callback - 对每个叶子字段执行的回调函数
 */
function traverseLeafFields(
  items: SchemaFormItem[],
  callback: (item: SchemaFormItem) => void,
): void {
  for (const item of items) {
    /* 容器节点判断：仅以 type 字段为准，不依赖 children 存在性兜底（问题七修复） */
    const isContainer =
      item.type === SchemaNodeType.CONTAINER ||
      item.type === "container";

    if (isContainer && Array.isArray(item.children) && item.children.length > 0) {
      /* 容器节点：递归处理子节点 */
      traverseLeafFields(item.children, callback);
    } else {
      /* 叶子字段：执行回调 */
      callback(item);
    }
  }
}

/**
 * 在 schema 树中按 field 名查找对应的 SchemaFormItem（递归搜索）
 * 用于联动回退时定位目标字段/容器，修改其 disabled/options 等属性
 *
 * @param items - 当前层级的 schema 数组
 * @param targetField - 要查找的字段名（支持叶子字段和容器节点的 field）
 * @returns 找到的 schema 项，未找到时返回 undefined
 */
function findFieldInSchema(
  items: SchemaFormItem[],
  targetField: string,
): SchemaFormItem | undefined {
  for (const item of items) {
    /* 精确匹配 field 名（叶子字段和容器节点都通过 field 定位） */
    if (item.field === targetField) {
      return item;
    }

    /* 容器节点：递归进入子层级查找 */
    if (
      (item.type === SchemaNodeType.CONTAINER || item.type === "container") &&
      Array.isArray(item.children) &&
      item.children.length > 0
    ) {
      const found = findFieldInSchema(item.children, targetField);
      if (found) {
        return found;
      }
    }
  }

  return undefined;
}

/* ============================================================
 * 主函数：useSchemaForm
 * ============================================================ */

/**
 * Schema 驱动表单核心 Composable
 *
 * 接收 schema 配置与可选的初始模型，返回完整的表单状态与操作方法集合。
 * 内部自动完成：schema 深拷贝、模型初始化（含嵌套路径展开）、规则构建、联动监听器注册。
 *
 * @param options - 表单配置选项
 * @param options.schema          - 原始 SchemaFormItem 数组（将被深拷贝，支持嵌套结构）
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

  /* ---------- 1.5 默认状态快照（联动回退基线，必须在 visibleFields 之前初始化）----------
   *
   * 在联动评估前记录每个字段/容器的"出厂状态"，用于条件不满足时自动回退。
   * 快照内容包括：
   *   - visibleDefault: 字段/容器初始可见性（来自 schema 的 hidden 属性）
   *   - disabledDefault: 字段初始禁用状态
   *   - optionsDefault: 字段初始选项列表（浅拷贝，防止引用污染）
   *   - rulesDefault: 字段初始校验规则（用于 REQUIRED 回退时重建）
   *
   * 【回退机制】每次 evaluateLinkages() 执行时：
   *   1. 先将所有被联动控制的字段重置为快照中的默认值
   *   2. 再对条件满足的规则执行动作（覆盖默认值）
   *   这样每轮评估都是幂等的，不依赖"对端规则反向操作"
   */
  const defaultState = {
    /** 字段/容器 → 初始可见性（true=可见, false=隐藏） */
    visibleDefault: {} as Record<string, boolean>,
    /** 字段 → 初始禁用状态 */
    disabledDefault: {} as Record<string, boolean>,
    /** 字段 → 初始选项列表 */
    optionsDefault: {} as Record<string, Array<{ label: string; value: unknown }> | undefined>,
    /** 字段 → 初始校验规则数组（深拷贝，REQUIRED 回退时使用） */
    rulesDefault: {} as Record<string, Array<any>>,
  };

  /**
   * 遍历 schema 树的所有节点（含容器节点和叶子字段），记录默认状态到快照
   * @param items - 当前层级的 schema 数组
   */
  function snapshotDefaults(items: SchemaFormItem[]): void {
    for (const item of items) {
      /* 容器节点：记录可见性默认值 + 递归进入子层级 */
      if (
        item.type === SchemaNodeType.CONTAINER ||
        item.type === "container"
      ) {
        if (item.field) {
          defaultState.visibleDefault[item.field] = item.hidden !== true;
        }
        if (Array.isArray(item.children) && item.children.length > 0) {
          snapshotDefaults(item.children);
        }
        continue;
      }

      /* 叶子字段：记录全部默认属性 */
      if (item.field) {
        defaultState.visibleDefault[item.field] = item.hidden !== true;
        defaultState.disabledDefault[item.field] = !!item.disabled;
        defaultState.optionsDefault[item.field] = item.options ? [...item.options] : undefined;
        /* 记录初始校验规则（合并 required 自动生成 + 自定义 rules） */
        const initialRules: any[] = [];
        if (item.required === true) {
          initialRules.push({ required: true, message: `${item.label}不能为空`, trigger: "blur" });
        }
        if (item.rules && Array.isArray(item.rules)) {
          initialRules.push(...item.rules);
        }
        defaultState.rulesDefault[item.field] = initialRules;
      }
    }
  }

  /* 立即执行快照（基于原始 schema，尚未被联动修改） */
  snapshotDefaults(options.schema);
  console.log(
    "[SchemaForm] [INFO] 默认状态快照已建立:",
    Object.keys(defaultState.visibleDefault).join(", "),
  );

  /* ---------- 1.6 字段可见性字典（扁平响应式）---------- */
  const visibleFields = ref<Record<string, boolean>>({});
  /* 从默认状态快照初始化可见性（已包含容器节点和叶子字段） */
  for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
    visibleFields.value[field] = defaultVisible;
  }

  /* ---------- 2. 表单模型初始化（支持嵌套路径） ----------
   * 遍历深拷贝后的 schema 树，为每个叶子字段设置初始值：
   * 优先级：schema.defaultValue > options.initialModel > 组件类型默认值
   *
   * 【嵌套支持】当 field 包含 "." 路径时（如 "address.city"）：
   *   1. 先调用 ensurePathExists() 预构建中间对象结构
   *   2. 再用 setByPath() 写入最终值到正确位置
   *   结果：formModel.value.address = { city: "默认值" } */
  const initialModel = options.initialModel || {};
  const formModel = ref<Record<string, unknown>>({});

  traverseLeafFields(formSchemas.value, (item) => {
    /* 检查该字段是否已被初始化过（避免重复赋值） */
    const existingValue = getByPath(formModel.value, item.field);
    if (existingValue !== undefined) {
      return; // 已存在则跳过（可能被上层 initialModel 或前序字段已设置）
    }

    /* 按优先级确定默认值 */
    const defaultValue =
      item.defaultValue ??
      getByPath(initialModel as any, item.field) ??
      getDefaultForComponentType(item.component);

    /* 统一使用扁平 key 存储（与模板 v-model="ctx.modelValue.value[schemaItem.field]" 一致）
     * 模板对 "bugInfo.severity" 这样的路径字段使用 modelValue.value["bugInfo.severity"] 访问
     * 因此 formModel 必须用扁平 key 存储，不能创建嵌套对象 */
    formModel.value[item.field] = defaultValue;

    console.log(
      `[schema-form] 字段 [${item.field}] 使用默认值: ${JSON.stringify(defaultValue)}`,
    );
  });

  /* ---------- 3. 校验规则构建（递归收集）---------- */
  const formRules = ref<Record<string, Array<any>>>({});

  /**
   * 从当前 formSchemas 重新构建校验规则（递归遍历所有层级）
   *
   * 遍历每个叶子字段：
   * - 若 item.required === true → 自动注入必填校验规则
   * - 合并用户在 schema 中自定义的 item.rules
   * - 结果存入 formRules.value[item.field]（key 支持嵌套路径如 "address.city"）
   */
  function buildRules(): void {
    // 先清空已有规则，避免增量构建导致旧规则残留
    formRules.value = {};

    traverseLeafFields(formSchemas.value, (item) => {
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
   * 递归遍历 formSchemas 树中每个拥有 linkageRules 的叶子字段，逐条评估条件并执行对应动作。
   *
   * 【支持的联动动作类型】
   * - VISIBLE   : 控制字段显示/隐藏（修改 visibleFields 字典）
   * - DISABLED  : 控制字段禁用/可用（修改 item.disabled）
   * - OPTIONS   : 动态替换字段选项列表（修改 item.options）
   * - REQUIRED  : 动态增删必填校验规则（修改 formRules）
   * - SET_VALUE : 联动设置字段值（修改 formModel，支持嵌套路径）
   *
   * 【响应式保证】
   * - Vue 3 基于 Proxy 的响应式系统可以追踪到数组内部对象属性的变更
   * - 但对于 options 替换，必须创建新数组引用 [...newOptions] 才能可靠触发视图更新
   * ============================================================ */

  /**
   * 执行全量联动规则评估（递归遍历所有层级的 schema 节点）
   *
   * 递归遍历 formSchemas 树中每个拥有 linkageRules 的叶子字段，
   * 逐一评估每条规则的 condition，若满足则执行对应 action。
   *
   * 条件判断支持三种模式：
   *   1. 函数型：rule.condition(watchedValue) → 返回 boolean
   *   2. 数组型：rule.condition.includes(watchedValue) → 值是否在候选列表中
   *   3. 字面量型：watchedValue === rule.condition → 严格相等比较
   *
   * watchField 和 target field 均支持嵌套路径写法（如 "address.city"）
   */
  function evaluateLinkages(): void {
    let evaluatedCount = 0;

    console.log("[schema-form] [联动] ====== 开始评估联动规则 ======");

    /* ---- 步骤零：将所有联动控制的字段/容器重置为默认状态快照 ----
     * 这样每轮评估都是幂等的：从干净基线开始，只应用当前条件满足的规则
     * 不再依赖"对端规则反向隐藏"的手动对冲 */
    for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
      visibleFields.value[field] = defaultVisible;
    }
    for (const [field, defaultDisabled] of Object.entries(defaultState.disabledDefault)) {
      /* 从 formSchemas 中找到对应字段并恢复 disabled 状态 */
      const targetItem = findFieldInSchema(formSchemas.value, field);
      if (targetItem) {
        targetItem.disabled = defaultDisabled;
      }
    }
    for (const [field, defaultOptions] of Object.entries(defaultState.optionsDefault)) {
      const targetItem = findFieldInSchema(formSchemas.value, field);
      if (targetItem) {
        targetItem.options = defaultOptions ? [...defaultOptions] : undefined;
      }
    }
    /* REQUIRED 回退：用快照中的初始规则覆盖 formRules */
    for (const [field, defaultRules] of Object.entries(defaultState.rulesDefault)) {
      if (defaultRules.length > 0) {
        formRules.value[field] = JSON.parse(JSON.stringify(defaultRules));
      } else {
        delete formRules.value[field];
      }
    }

    /**
     * 递归评估某层级的所有字段的联动规则
     * @param items - 当前层级的 schema 数组
     */
    function evaluateLevel(items: SchemaFormItem[]): void {
      for (const item of items) {
        /* 判断是否为容器节点（仅以 type 字段为准，不依赖 children 兜底） */
        const isContainer =
          item.type === SchemaNodeType.CONTAINER ||
          item.type === "container";

        if (isContainer && Array.isArray(item.children) && item.children.length > 0) {
          /* 容器节点：递归进入子层级 */
          evaluateLevel(item.children);
          continue;
        }

        /* ---- 叶子字段：检查是否有联动规则 ---- */
        if (!item.linkageRules || item.linkageRules.length === 0) {
          continue;
        }

        /* ---- 内层循环：遍历该字段下的每条联动规则 ---- */
        for (const rule of item.linkageRules) {
          evaluatedCount++;

          /**
           * 步骤一：获取被监听字段的当前值（支持嵌套路径）
           * rule.condition.watchField 指定了本条规则依赖哪个字段的值变化
           */
          const watchedValue = getByPath(
            formModel.value as any,
            rule.condition.watchField,
          );

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
              ? (rawCondition as import("@/components/SchemaForm/types").LinkageCondition).condition
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
                // 写入目标字段的 visibleFields 字典（rule.targetField），而非规则所有者字段
                const isVisible = !!rule.actionParams;
                const target = (rule.targetField as string) || item.field;
                visibleFields.value[target] = isVisible;

                console.log(
                  "[schema-form] [联动] 规则 \"" + (rule.id || "anonymous") + "\": " +
                  "字段 [" + target + "] → " + (isVisible ? "可见" : "隐藏") + " " +
                  "(监听 [" + rule.condition.watchField + "] = " + JSON.stringify(watchedValue) + ")",
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
                /* 使用 rule.targetField 作为目标字段（支持跨字段联动，如 taskType 控制 bugInfo.severity 必填）*/
                const reqTarget = (rule.targetField as string) || item.field;
                const currentRules = formRules.value[reqTarget] || [];
                const hasRequiredRule = currentRules.some((r) => r.required === true);

                if (shouldRequired && !hasRequiredRule) {
                  currentRules.unshift({
                    required: true,
                    message: (reqTarget.includes(".") ? reqTarget.split(".").pop() : item.label) + "不能为空",
                    trigger: "blur",
                  });
                  formRules.value[reqTarget] = currentRules;

                  console.log(
                    "[schema-form] [联动] 规则 \"" + (rule.id || "anonymous") + "\": " +
                    "字段 [" + reqTarget + "] → 已添加必填校验",
                  );
                } else if (!shouldRequired && hasRequiredRule) {
                  formRules.value[reqTarget] = currentRules.filter(
                    (r) => r.required !== true,
                  );

                  console.log(
                    "[schema-form] [联动] 规则 \"" + (rule.id || "anonymous") + "\": " +
                    "字段 [" + reqTarget + "] → 已移除必填校验",
                  );
                } else {
                  console.log(
                    `[schema-form] [联动] 规则 "${rule.id || "anonymous"}": ` +
                    `字段 [${item.field}] → 必填状态未变（当前=${hasRequiredRule}，目标=${shouldRequired}）`,
                  );
                }
                break;
              }

              /* ------ SET_VALUE：联动设值（支持嵌套路径）------ */
              case "SET_VALUE": {
                // 通过 setByPath 写入，自动处理嵌套路径（如 "address.city"）
                // 这会触发 watch → 再次进入 evaluateLinkages，形成链式联动
                setByPath(formModel.value as any, item.field, rule.actionParams);

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
          /* 条件不满足时无需处理：步骤零已将所有字段重置为默认状态，
           * 只有条件满足的规则才会覆盖默认值 */
        }
      }
    }

    /* 启动递归评估 */
    evaluateLevel(formSchemas.value);

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
   * 当任意字段值发生变化时（包括嵌套路径字段如 address.city）：
   *   1. 通过新旧值对比精确定位变化的字段名
   *   2. 输出变化字段列表日志
   *   3. 调用 evaluateLinkages() 执行全量联动评估
   *
   * { deep: true } 确保嵌套对象/数组内的变化也能被捕获
   */
  watch(
    formModel,
    (newVal, oldVal) => {
      /** 递归对比新旧值，收集所有发生变化的叶节点路径 */
      const changedPaths: string[] = [];

      /**
       * 递归对比两个对象的差异，收集变化的路径
       * @param prefix - 当前路径前缀（如 "address"）
       * @param newObj - 新值对象
       * @param oldObj - 旧值对象
       */
      function collectChanges(prefix: string, newObj: any, oldObj: any): void {
        const allKeys = new Set([
          ...Object.keys(newObj || {}),
          ...Object.keys(oldObj || {}),
        ]);

        for (const key of allKeys) {
          const fullPath = prefix ? `${prefix}.${key}` : key;
          const newValAtPath = newObj?.[key];
          const oldValAtPath = oldObj?.[key];

          /* 如果两边都是对象/数组，递归深入比较 */
          if (
            typeof newValAtPath === "object" &&
            newValAtPath !== null &&
            !Array.isArray(newValAtPath) &&
            typeof oldValAtPath === "object" &&
            oldValAtPath !== null &&
            !Array.isArray(oldValAtPath)
          ) {
            collectChanges(fullPath, newValAtPath, oldValAtPath);
          } else if (newValAtPath !== oldValAtPath) {
            changedPaths.push(fullPath);
          }
        }
      }

      collectChanges("", newVal, oldVal);

      if (changedPaths.length > 0) {
        console.log(
          `[schema-form] [联动] 检测到字段变化: [${changedPaths.join(", ")}]，开始评估联动规则...`,
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
   * 重置表单所有字段至默认值（递归处理嵌套字段）
   *
   * 遍历 schema 树中的所有叶子字段，将每个字段重置为其 schema 中声明的 defaultValue，
   * 或组件类型的默认值（当 defaultValue 未定义时）。
   * 同时委托给 el-form 的 resetFields 清除校验状态。
   */
  function resetFields(): void {
    traverseLeafFields(formSchemas.value, (item) => {
      const resetValue =
        item.defaultValue ?? getDefaultForComponentType(item.component);

      /* 统一使用扁平 key 存储（与模板绑定一致）*/
      (formModel.value as any)[item.field] = resetValue;
    });

    /* 清除校验状态（仅移除 error 提示，不改字段值）
     * 不再调用 el-form 原生 resetFields()，因为它会将 model 还原到挂载时快照
     * 会覆盖上面手动赋值的默认值（问题四修复） */
    clearValidate();

    /* 重置可见性字典：从默认状态快照恢复（而非重新遍历 schema，保证与快照一致） */
    for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
      visibleFields.value[field] = defaultVisible;
    }

    console.log("[schema-form] [INFO] 表单已重置，所有字段恢复默认值（含可见性字典）");
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
      "[schema-form] [INFO] 已清除校验状态" +
        (fields ? ": [" + fields.join(", ") + "]" : "(全部字段)"),
    );
  }

  /**
   * 获取当前表单数据快照（扁平 key → 嵌套结构转换）
   *
   * formModel 内部统一使用扁平 key 存储（如 "bugInfo.severity"）以匹配模板绑定，
   * 但提交到后端 API 时需要转换为嵌套对象结构（如 { bugInfo: { severity: "major" } }）。
   *
   * 转换规则：
   * - 扁平 key 不含 "." → 保持原样（如 title, priority）
   * - 扁平 key 含 "." → 沿路径段逐层构建嵌套对象（如 bugInfo.severity → { bugInfo: { severity: value } }）
   *
   * @returns Record<string, unknown> 嵌套结构的数据副本，可直接提交给 API
   */
  function getFormData(): Record<string, unknown> {
    const flatData = JSON.parse(JSON.stringify(formModel.value));
    const nestedData: Record<string, unknown> = {};

    for (const [flatKey, value] of Object.entries(flatData)) {
      if (!flatKey.includes(".")) {
        /* 扁平字段：直接复制 */
        nestedData[flatKey] = value;
      } else {
        /* 路径字段：拆分路径并逐层构建嵌套对象 */
        const parts = flatKey.split(".");
        let current: Record<string, any> = nestedData;

        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;

          if (isLast) {
            /* 最后一段：写入值 */
            current[part] = value;
          } else {
            /* 中间段：确保中间对象存在 */
            if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
              current[part] = {};
            }
            current = current[part];
          }
        }
      }
    }

    console.log(
      "[schema-form] [INFO] getFormData: 扁平→嵌套转换完成，顶层键:",
      Object.keys(nestedData).join(", "),
    );
    return nestedData;
  }

  /**
   * 手动设置某个字段的值（支持嵌套路径）
   *
   * 通过 setByPath 写入值，**会自动触发 watch 监听器**
   * 进而调用 evaluateLinkages() 执行联动评估。
   * 这意味着通过此方法设值可以驱动链式联动反应。
   *
   * @param field - 目标字段名（支持嵌套路径如 "address.city"，必须存在于 schema 中）
   * @param value - 要设置的新值
   */
  function setFieldValue(field: string, value: unknown): void {
    /* 统一使用扁平 key 存储（与模板绑定一致）*/
    (formModel.value as any)[field] = value;

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
    formModel,         // 表单数据模型（支持嵌套结构，字段名→值的映射）
    formRules,         // 校验规则集（字段名→规则数组，key 支持嵌套路径）
    visibleFields,     // 字段可见性字典（扁平 Record<field, boolean>，联动显隐专用）
    formRef,           // el-form 组件实例引用（需由调用方通过 ref 绑定）

    // --- 操作方法 ---
    validate,          // 异步校验表单，返回是否通过
    resetFields,       // 重置所有字段至默认值（含嵌套字段）
    clearValidate,     // 清除校验提示状态
    getFormData,       // 获取表单数据快照（含嵌套结构的深拷贝）
    setFieldValue,     // 手动设置字段值（支持嵌套路径，触发联动）
    triggerLinkages: evaluateLinkages, // 手动触发联动评估（供外部事件驱动调用）
  };
}
