/**
 * Schema 驱动动态表单引擎 — 类型定义与核心逻辑层
 *
 * @功能描述：提供 JSON Schema 驱动的表单系统的完整类型定义（枚举/接口）与核心 composable 函数。
 *           包含表单数据管理、校验规则生成、联动规则执行、嵌套路径工具、以及表单提交/重置等功能。
 *           支持扁平字段和树形嵌套结构，通过点分路径（如 "address.city"）映射嵌套对象。
 *
 * @技术栈：Vue 3 Composition API（ref / computed / watch）、TypeScript、Element Plus Form
 *
 * 【对外导出】
 *   - 枚举：ComponentType / SchemaNodeType / ContainerType / LinkageActionType
 *   - 接口：LinkageCondition / LinkageRule / SchemaFormItem / SchemaFormProps / SchemaFormEmits / UseSchemaFormOptions / UseSchemaFormReturn
 *   - 函数：useSchemaForm（主入口 composable）
 */

import { ref, watch } from "vue";

/* ============================================================
 * 一、枚举定义
 * ============================================================ */

/** 支持的表单控件类型枚举 */
export enum ComponentType {
  /** 单行文本输入（对应 el-input） */
  INPUT = "input",
  /** 多行文本域（对应 el-input type="textarea"） */
  TEXTAREA = "textarea",
  /** 数字输入（对应 el-input-number） */
  INPUT_NUMBER = "inputNumber",
  /** 单选按钮组（对应 el-radio-group） */
  RADIO = "radio",
  /** 多选框组（对应 el-checkbox-group） */
  CHECKBOX = "checkbox",
  /** 下拉选择（对应 el-select） */
  SELECT = "select",
  /** 级联选择（对应 el-cascader） */
  CASCADER = "cascader",
  /** 开关（对应 el-switch） */
  SWITCH = "switch",
  /** 滑块（对应 el-slider） */
  SLIDER = "slider",
  /** 时间选择器（对应 el-time-picker） */
  TIME_PICKER = "timePicker",
  /** 日期选择器（对应 el-date-picker） */
  DATE_PICKER = "datePicker",
  /** 日期范围选择器（对应 el-date-picker type="daterange" 等） */
  DATE_RANGE_PICKER = "dateRangePicker",
  /** 评分组件（对应 el-rate） */
  RATE = "rate",
  /** 颜色选择器（对应 el-color-picker） */
  COLOR_PICKER = "colorPicker",
}

/** Schema 节点类型枚举：区分叶子字段与容器节点 */
export enum SchemaNodeType {
  /** 叶子字段：对应一个具体的表单控件（input/select/radio 等），拥有 field/component 属性 */
  FIELD = "field",
  /** 容器节点：用于逻辑分组或 UI 包裹，自身不渲染控件，通过 children 持有子字段集合 */
  CONTAINER = "container",
}

/**
 * 容器节点渲染类型枚举
 * 决定容器节点在页面上的视觉呈现形式，每种类型对应不同的 HTML 结构和 Element Plus 组件
 */
export enum ContainerType {
  /**
   * 逻辑分组（无特殊 UI 包裹）
   * 子字段直接平铺渲染，仅作为 schema 层级的逻辑分组存在
   * 适用于不需要额外视觉边框的场景
   */
  GROUP = "group",

  /**
   * 字段集（原生 <fieldset> + <legend>）
   * 使用 HTML 原生 fieldset 元素包裹，带 legend 标题
   * 语义化良好，适合"地址信息"、"联系方式"等语义明确的分组
   */
  FIELDSET = "fieldset",

  /**
   * 卡片面板（el-card）
   * 使用 Element Plus 的 Card 组件包裹，带标题头和阴影/边框
   * 适合"高级选项"、"配置详情"等需要视觉隔离的区块
   */
  CARD = "card",

  /**
   * 标签页分组（el-tabs + el-tab-pane）
   * 将子字段按 tab 分页展示，每个 children 元素作为一个 tab-pane
   * 适用于字段过多需要分页组织，或存在互斥信息组的场景
   *
   * ⚠️ 特殊约定：children 中每个元素的 label 作为 tab 标题，
   * 其 ownChildren（如有）为该 tab 下的实际字段
   */
  TABS = "tabs",

  /**
   * 栅格布局容器（el-row + el-col）
   * 使用 Element Plus 栅格系统对子字段进行行列排布
   * 通过 span 属性控制每行列数，适用于需要精确控制布局的复杂表单
   */
  GRID = "grid",
}

/** 联动动作类型枚举：定义联动规则触发后可执行的操作种类 */
export enum LinkageActionType {
  /** 控制目标字段显隐状态（true 显示 / false 隐藏） */
  VISIBLE = "visible",
  /** 控制目标字段禁用状态（true 禁用 / false 启用） */
  DISABLED = "disabled",
  /** 动态替换目标字段的选项列表（适用于 select/radio/checkbox/cascader 等选项类控件） */
  OPTIONS = "options",
  /** 动态修改目标字段的必填校验规则（true 添加必填规则 / false 移除必填规则） */
  REQUIRED = "required",
  /** 直接设置目标字段的值为指定值 */
  SET_VALUE = "setValue",
}

/* ============================================================
 * 二、接口定义
 * ============================================================ */

/** 联动触发条件：监听某个字段的变化，当其值满足条件时执行对应的联动动作 */
export interface LinkageCondition {
  /** 要监听的字段名（即"依赖"哪个字段的变化），该字段值发生改变时会重新评估 condition 条件 */
  watchField: string;

  /**
   * 条件判断逻辑，支持三种形式：
   * - **函数**：接收被监听字段的当前值作为参数，返回 boolean 表示是否满足条件
   * - **具体值**：使用严格等于 (===) 与被监听字段当前值进行匹配
   * - **数组**：检查被监听字段当前值是否在数组中 (Array.includes)
   */
  condition: unknown | ((value: unknown) => boolean) | unknown[];
}

/** 单条联动规则：当条件满足时，对目标字段执行指定的动作 */
export interface LinkageRule {
  /** 联动规则唯一标识（可选），主要用于日志追踪和调试 */
  id?: string;
  /** 触发条件定义，决定何时执行本条联动规则 */
  condition: LinkageCondition;
  /** 满足条件后执行的动作类型，取值来自 LinkageActionType 枚举 */
  action: LinkageActionType;

  /**
   * 联动动作的目标字段名（可选）
   * 指定本条联动规则执行时实际作用于哪个字段。
   * 若不填，则默认作用于规则所在的字段自身（即 item.field）。
   * 使用场景：
   *   - 跨字段联动：如 taskType 字段的联动规则控制 container-bugInfo 的显隐
   *   - 统一管理：将所有联动规则集中写在"监听源字段"上，通过 targetField 指向被控字段
   */
  targetField?: string;

  /**
   * 动作参数，根据 action 类型的不同而具有不同的含义：
   * | action 类型 | actionParams 类型 | 含义 |
   * |---|---|---|
   * | VISIBLE | `boolean` | 设置目标字段是否可见 |
   * | DISABLED | `boolean` | 设置目标字段是否禁用 |
   * | OPTIONS | `Array<{label, value}>` | 替换目标字段的选项列表 |
   * | REQUIRED | `boolean` | 设置目标字段是否必填 |
   * | SET_VALUE | `any` | 直接设置目标字段的值 |
   */
  actionParams: unknown;

  /** 规则描述文本（可选），仅用于日志输出和调试，不影响运行逻辑 */
  description?: string;
}

/**
 * 表单字段 Schema 定义（单个字段）
 *
 * 每个 SchemaFormItem 对应页面上的一个 `el-form-item` 及其内部的表单控件。
 * 这是整个 SchemaForm 系统的核心数据结构，通过声明式配置驱动表单渲染。
 */
export interface SchemaFormItem {
  /** 字段名（对应 formModel 的 key），必须在整个 schema 数组中唯一 */
  field: string;
  /** 字段标签（显示在 el-form-item 的 label 位置） */
  label: string;
  /** 控件类型标识，可使用 ComponentType 枚举值或自定义注册的字符串标识 */
  component: string | ComponentType;

  /* ---------- 控件属性 ---------- */
  /** 组件 props 对象（透传给底层 UI 组件），value/modelValue 不在此处设置 */
  componentProps?: Record<string, unknown>;

  /* ---------- 选项类控件专属配置 ---------- */
  /** 选项列表（适用于 select / radio / checkbox / cascader 等选项类控件），联动 OPTIONS 会动态替换此数组 */
  options?: Array<{ label: string; value: unknown; disabled?: boolean }>;

  /* ---------- 校验规则配置 ---------- */
  /** 是否必填（快捷方式），设为 true 时自动注入 `{ required: true, message: "${label}不能为空" }` */
  required?: boolean;
  /** Element Plus FormRules 格式的校验规则数组 */
  rules?: Array<{
    required?: boolean;
    message?: string;
    trigger?: "blur" | "change";
    type?: string;
    min?: number;
    max?: number;
    pattern?: RegExp;
    validator?: (rule: any, value: any, callback: (...args: unknown[]) => void) => void;
    [key: string]: unknown;
  }>;

  /* ---------- 联动配置 ---------- */
  /** 联动规则数组，本字段作为被控方，当其他字段变化且条件满足时执行动作 */
  linkageRules?: LinkageRule[];

  /* ---------- 布局与展示 ---------- */
  /** 默认值，表单初始化或重置时使用 */
  defaultValue?: unknown;
  /** 字段是否隐藏（基础隐藏状态，不受联动控制） */
  hidden?: boolean;
  /** 字段是否禁用（基础禁用状态，不受联动控制） */
  disabled?: boolean;
  /** el-form-item 的标签宽度（如 "80px"、"100px"、"auto"） */
  labelWidth?: string;
  /** el-form-item 的栅格占用列数（span），配合 el-row/el-col 使用 */
  span?: number;
  /** 自定义插槽名称，设置后渲染时不使用内置组件而是父组件提供的插槽内容 */
  slotName?: string;
  /** 提示文本，显示在标签下方或输入框下方的辅助说明文字 */
  tips?: string;
  /** 字段说明（以 tooltip 形式展示，通常在标签旁显示问号图标） */
  description?: string;

  /* ---------- 高级配置（嵌套支持） ---------- */
  /**
   * 节点类型（区分叶子字段与容器节点）
   * 不设置时默认为 "field"，保证与现有扁平 schema 向后兼容
   */
  type?: SchemaNodeType | string;

  /**
   * 容器渲染类型（仅当 type === "container" 时生效）
   * 决定容器的视觉呈现：GROUP/FIELDSET/CARD/TABS/GRID
   */
  containerType?: ContainerType | string;

  /**
   * 子节点数组（仅当 type === "container" 时有效）
   * 支持任意深度的递归嵌套，形成 schema 树形结构
   * 叶子字段的 field 支持路径写法（如 "address.city"）
   */
  children?: SchemaFormItem[];

  /** 自定义 CSS 类名，附加到 el-form-item 外层容器元素上 */
  className?: string;
  /** 内联样式对象，附加到 el-form-item 外层容器元素上 */
  style?: Record<string, string>;

  /** 渲染前钩子函数，在每次渲染该字段之前调用，可动态调整 schema 属性 */
  beforeRender?: (schema: SchemaFormItem, model: Record<string, unknown>) => SchemaFormItem | void;
}

/* ============================================================
 * 三、组件 Props / Emits / Composable 参数接口
 * ============================================================ */

/**
 * SchemaForm 组件的外部 Props 接口
 * 定义了父组件向 SchemaForm 传递的所有配置项
 */
export interface SchemaFormProps {
  /** Schema 定义数组（每个元素是一个字段的完整描述），数组顺序即为页面上字段的排列顺序 */
  schema: SchemaFormItem[];
  /** 响应式 Schema 引用（由 useSchemaForm 返回的 formSchemas），包含联动引擎动态修改后的最新状态 */
  reactiveSchemas?: import("vue").Ref<SchemaFormItem[]>;
  /** 字段可见性字典（由 useSchemaForm 返回的 visibleFields），key 为字段名，value 为是否可见 */
  visibleFields?: import("vue").Ref<Record<string, boolean>>;
  /**
   * 外部传入的校验规则（由 useSchemaForm 返回的 formRules）
   * 包含了联动 REQUIRED 动作动态增删后的最新规则集。
   * 传入后 el-form 的 :rules 将优先使用此数据源，不传时 fallback 到组件内部从 schema 推导的静态规则
   */
  formRules?: import("vue").Ref<Record<string, Array<any>>>;
  /** 表单数据模型（v-model 双向绑定） */
  modelValue: Record<string, unknown>;
  /** 表单整体标签宽度（作用于所有未单独设置 labelWidth 的字段） */
  labelWidth?: string;
  /** 表单尺寸："large" | "default" | "small" | "" */
  size?: "" | "large" | "default" | "small";
  /** 标签位置："left" | "right" | "top" */
  labelPosition?: "left" | "right" | "top";
  /** 是否禁用整个表单 */
  disabled?: boolean;
  /** 是否隐藏必填标记（* 号） */
  hideRequiredAsterisk?: boolean;
  /** 是否内联模式（标签和控件在同一行排列） */
  inline?: boolean;
  /** 表单字段校验状态改变时的回调函数 */
  onValidate?: (prop: string, isValid: boolean, message: string) => void;
}

/** SchemaForm 组件的事件接口 */
export interface SchemaFormEmits {
  /** 表单数据变更事件（v-model:modelValue 的更新通道） */
  "update:modelValue": [value: Record<string, unknown>];
  /** 表单提交事件（全校验通过后触发） */
  submit: [data: Record<string, unknown>];
  /** 字段值变更事件 */
  fieldChange: [field: string, value: unknown, oldValue: unknown];
}

/** useSchemaForm composable 的参数接口 */
export interface UseSchemaFormOptions {
  /** 原始 Schema 定义数组，composable 内部会基于此创建响应式副本以支持联动动态修改 */
  schema: SchemaFormItem[];
  /** 初始表单数据（可选），用于编辑场景；优先级高于 schema 中的 defaultValue */
  initialModel?: Record<string, unknown>;
}

/** useSchemaForm composable 的返回值接口 */
export interface UseSchemaFormReturn {
  /** 响应式表单数据模型 */
  formModel: import("vue").Ref<Record<string, unknown>>;
  /** 响应式校验规则集合（联动 REQUIRED 会动态增删其中的规则） */
  formRules: import("vue").Ref<Record<string, Array<any>>>;
  /** 响应式 Schema 数组（深拷贝工作副本，联动会修改其 hidden/disabled/options 等） */
  formSchemas: import("vue").Ref<SchemaFormItem[]>;
  /** 字段可见性字典（扁平 Record<field, boolean>，联动显隐专用） */
  visibleFields: import("vue").Ref<Record<string, boolean>>;
  /** 表单 DOM 引用（指向 el-form 组件实例） */
  formRef: import("vue").Ref<any>;
  /** 执行表单全校验，返回 Promise<boolean> */
  validate: () => Promise<boolean>;
  /** 重置表单至默认值并清除校验状态 */
  resetFields: () => void;
  /** 清除指定字段的校验状态（不清空字段值） */
  clearValidate: (fields?: string[]) => void;
  /** 手动触发一次全量联动计算 */
  evaluateLinkages: () => void;
  /** 获取当前表单数据的快照（非响应式普通对象） */
  getFormData: () => Record<string, unknown>;
  /** 设置指定字段的值并自动触发联动重新评估 */
  setFieldValue: (field: string, value: unknown) => void;
}

/* ============================================================
 * 四、内部辅助函数
 * ============================================================ */

/**
 * 根据组件类型返回合理的默认值
 * 当 schema 中未指定 defaultValue 且 initialModel 中也无对应字段时使用
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

/* ---- 路径工具函数（支持嵌套字段的点分路径操作）---- */

/** 将点分路径字符串解析为路径段数组，如 parsePath("address.city") → ["address", "city"] */
function parsePath(path: string): string[] {
  return path.split(".");
}

/** 从嵌套对象中按路径取值，中途遇到 undefined/null 时安全返回 undefined */
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

/** 向嵌套对象中按路径设值，中间层级不存在时自动创建空对象 */
function setByPath(obj: Record<string, any>, path: string, value: unknown): void {
  const keys = parsePath(path);
  const lastKey = keys[keys.length - 1];
  const parentKeys = keys.slice(0, -1);
  let current: any = obj;
  for (const key of parentKeys) {
    if (current[key] === undefined || current[key] === null || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key];
  }
  current[lastKey] = value;
}

/** 确保路径上的所有中间对象都已存在（不写入值，仅确保结构完整） */
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

/* ---- Schema 树递归遍历工具 ---- */

/**
 * 递归遍历 Schema 树的所有节点，对每个叶子字段执行回调
 * 容器节点判断仅以 type 字段为准（不依赖 children 存在性兜底）
 */
function traverseLeafFields(
  items: SchemaFormItem[],
  callback: (item: SchemaFormItem) => void,
): void {
  for (const item of items) {
    const isContainer =
      item.type === SchemaNodeType.CONTAINER ||
      item.type === "container";

    if (isContainer && Array.isArray(item.children) && item.children.length > 0) {
      traverseLeafFields(item.children, callback);
    } else {
      callback(item);
    }
  }
}

/**
 * 在 schema 树中按 field 名查找对应的 SchemaFormItem（递归搜索）
 * 用于联动回退时定位目标字段/容器，修改其 disabled/options 等属性
 */
function findFieldInSchema(
  items: SchemaFormItem[],
  targetField: string,
): SchemaFormItem | undefined {
  for (const item of items) {
    if (item.field === targetField) {
      return item;
    }
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
 * 五、主函数：useSchemaForm
 * ============================================================ */

/**
 * Schema 驱动表单核心 Composable
 *
 * 封装所有响应式状态与联动逻辑，是 schema-driven form engine 的核心入口。
 * 内部自动完成：schema 深拷贝、模型初始化（含嵌套路径展开）、规则构建、联动监听器注册。
 *
 * @example
 * ```ts
 * const { formSchemas, formModel, formRules, validate, resetFields } = useSchemaForm({
 *   schema: mySchemaArray,
 *   initialModel: { name: "张三" },
 * });
 * ```
 */
export function useSchemaForm(options: UseSchemaFormOptions): UseSchemaFormReturn {

  /* ---------- 5.1 Schema 深拷贝 ----------
   * 创建可变的工作副本，联动逻辑会直接修改 hidden/disabled/options 等属性
   * 原始 schema 不应被污染 */
  const formSchemas = ref<SchemaFormItem[]>(
    JSON.parse(JSON.stringify(options.schema)),
  );

  /* ---------- 5.2 默认状态快照（联动回退基线）----------
   * 在联动评估前记录每个字段/容器的"出厂状态"，用于条件不满足时自动回退。
   * 每次 evaluateLinkages() 先将所有字段重置到默认值，再执行条件满足的规则覆盖默认值 */
  const defaultState = {
    visibleDefault: {} as Record<string, boolean>,
    disabledDefault: {} as Record<string, boolean>,
    optionsDefault: {} as Record<string, Array<{ label: string; value: unknown }> | undefined>,
    rulesDefault: {} as Record<string, Array<any>>,
  };

  /** 遍历 schema 树的所有节点（含容器节点和叶子字段），记录默认状态到快照 */
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

  snapshotDefaults(options.schema);
  console.log(
    "[SchemaForm] [INFO] 默认状态快照已建立:",
    Object.keys(defaultState.visibleDefault).join(", "),
  );

  /* ---------- 5.3 字段可见性字典（扁平响应式）---------- */
  const visibleFields = ref<Record<string, boolean>>({});
  for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
    visibleFields.value[field] = defaultVisible;
  }

  /* ---------- 5.4 表单模型初始化（支持嵌套路径）---------- */
  const initialModel = options.initialModel || {};
  const formModel = ref<Record<string, unknown>>({});

  traverseLeafFields(formSchemas.value, (item) => {
    const existingValue = getByPath(formModel.value, item.field);
    if (existingValue !== undefined) {
      return;
    }

    const defaultValue =
      item.defaultValue ??
      getByPath(initialModel as any, item.field) ??
      getDefaultForComponentType(item.component);

    /* 统一使用扁平 key 存储（与模板 v-model="ctx.modelValue.value[schemaItem.field]" 一致）*/
    formModel.value[item.field] = defaultValue;

    console.log(
      `[schema-form] 字段 [${item.field}] 使用默认值: ${JSON.stringify(defaultValue)}`,
    );
  });

  /* ---------- 5.5 校验规则构建（递归收集）---------- */
  const formRules = ref<Record<string, Array<any>>>({});

  function buildRules(): void {
    formRules.value = {};

    traverseLeafFields(formSchemas.value, (item) => {
      const rules: Array<any> = [];

      if (item.required === true) {
        rules.push({
          required: true,
          message: `${item.label}不能为空`,
          trigger: "blur",
        });
      }

      if (item.rules && Array.isArray(item.rules)) {
        rules.push(...item.rules);
      }

      if (rules.length > 0) {
        formRules.value[item.field] = rules;
      }

      console.log(
        `[schema-form] 构建校验规则: [${item.field}] (${rules.length} 条规则)`,
      );
    });
  }

  buildRules();
  console.log("[SchemaForm] [INFO] 初始化校验规则:", JSON.stringify(formRules.value, null, 2));

  /* ---------- 5.6 表单引用 ---------- */
  const formRef = ref<any>(null);

  /* ---------- 5.7 联动评估引擎 ---------- */

  /**
   * 执行全量联动规则评估（递归遍历所有层级的 schema 节点）
   *
   * 回退机制：每轮评估开始时先将所有联动控制的字段重置为默认状态快照，
   * 再对条件满足的规则执行动作覆盖默认值。每轮评估都是幂等的。
   */
  function evaluateLinkages(): void {
    let evaluatedCount = 0;

    console.log("[schema-form] [联动] ====== 开始评估联动规则 ======");

    /* 步骤零：将所有联动控制的字段/容器重置为默认状态快照 */
    for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
      visibleFields.value[field] = defaultVisible;
    }
    for (const [field, defaultDisabled] of Object.entries(defaultState.disabledDefault)) {
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
    for (const [field, defaultRules] of Object.entries(defaultState.rulesDefault)) {
      if (defaultRules.length > 0) {
        formRules.value[field] = JSON.parse(JSON.stringify(defaultRules));
      } else {
        delete formRules.value[field];
      }
    }

    /** 递归评估某层级的所有字段的联动规则 */
    function evaluateLevel(items: SchemaFormItem[]): void {
      for (const item of items) {
        const isContainer =
          item.type === SchemaNodeType.CONTAINER ||
          item.type === "container";

        if (isContainer && Array.isArray(item.children) && item.children.length > 0) {
          evaluateLevel(item.children);
          continue;
        }

        if (!item.linkageRules || item.linkageRules.length === 0) {
          continue;
        }

        for (const rule of item.linkageRules) {
          evaluatedCount++;

          /* 步骤一：获取被监听字段的当前值（支持嵌套路径） */
          const watchedValue = getByPath(
            formModel.value as any,
            rule.condition.watchField,
          );

          /* 步骤二：评估条件是否满足 */
          const evaluateCondition = (): boolean => {
            const rawCondition = rule.condition;
            const isConditionDescriptor =
              rawCondition !== null &&
              typeof rawCondition === "object" &&
              "watchField" in (rawCondition as object) &&
              "condition" in (rawCondition as object);
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

          /* 步骤三：根据条件结果执行对应动作（action 值规范化：驼峰→大写下划线） */
          const rawAction = rule.action as string;
          const normalizedAction = rawAction
            .replace(/([a-z])([A-Z])/g, "$1_$2")
            .toUpperCase();

          if (evaluateCondition()) {
            switch (normalizedAction) {

              case "VISIBLE": {
                const isVisible = !!rule.actionParams;
                const target = (rule.targetField as string) || item.field;
                visibleFields.value[target] = isVisible;
                break;
              }

              case "DISABLED": {
                item.disabled = !!rule.actionParams;
                break;
              }

              case "OPTIONS": {
                if (Array.isArray(rule.actionParams)) {
                  item.options = [...rule.actionParams];
                }
                break;
              }

              case "REQUIRED": {
                const shouldRequired = !!rule.actionParams;
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
                } else if (!shouldRequired && hasRequiredRule) {
                  formRules.value[reqTarget] = currentRules.filter((r) => r.required !== true);
                }
                break;
              }

              case "SET_VALUE": {
                setByPath(formModel.value as any, item.field, rule.actionParams);
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
          /* 条件不满足时无需处理：步骤零已将所有字段重置为默认状态 */
        }
      }
    }

    evaluateLevel(formSchemas.value);

    console.log(
      `[schema-form] [联动] 本次联动评估完成，共扫描 ${evaluatedCount} 条规则`,
    );
  }

  /* ---------- 5.8 Watch 监听器：formModel 变化 → 自动触发联动评估 ---------- */
  watch(
    formModel,
    (newVal, oldVal) => {
      const changedPaths: string[] = [];

      function collectChanges(prefix: string, newObj: any, oldObj: any): void {
        const allKeys = new Set([
          ...Object.keys(newObj || {}),
          ...Object.keys(oldObj || {}),
        ]);
        for (const key of allKeys) {
          const fullPath = prefix ? `${prefix}.${key}` : key;
          const newValAtPath = newObj?.[key];
          const oldValAtPath = oldObj?.[key];

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

  /* ---------- 5.9 公共方法 ---------- */

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

  function resetFields(): void {
    traverseLeafFields(formSchemas.value, (item) => {
      const resetValue =
        item.defaultValue ?? getDefaultForComponentType(item.component);
      (formModel.value as any)[item.field] = resetValue;
    });

    clearValidate();

    for (const [field, defaultVisible] of Object.entries(defaultState.visibleDefault)) {
      visibleFields.value[field] = defaultVisible;
    }

    console.log("[schema-form] [INFO] 表单已重置，所有字段恢复默认值（含可见性字典）");
  }

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
   * formModel 内部统一使用扁平 key 存储（如 "bugInfo.severity"）以匹配模板绑定，
   * 但提交到后端 API 时需要转换为嵌套对象结构
   */
  function getFormData(): Record<string, unknown> {
    const flatData = JSON.parse(JSON.stringify(formModel.value));
    const nestedData: Record<string, unknown> = {};

    for (const [flatKey, value] of Object.entries(flatData)) {
      if (!flatKey.includes(".")) {
        nestedData[flatKey] = value;
      } else {
        const parts = flatKey.split(".");
        let current: Record<string, any> = nestedData;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const isLast = i === parts.length - 1;
          if (isLast) {
            current[part] = value;
          } else {
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

  function setFieldValue(field: string, value: unknown): void {
    (formModel.value as any)[field] = value;
    console.log(
      `[schema-form] 手动设置字段 [${field}] = ${JSON.stringify(value)}`,
    );
  }

  /* ---------- 5.10 返回值 ---------- */
  return {
    formSchemas,
    formModel,
    formRules,
    visibleFields,
    formRef,

    validate,
    resetFields,
    clearValidate,
    getFormData,
    setFieldValue,
    triggerLinkages: evaluateLinkages,
  };
}
