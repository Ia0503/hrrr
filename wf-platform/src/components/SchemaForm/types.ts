/**
 * @file SchemaForm 表单引擎 - 类型定义文件
 * @module components/SchemaForm/types
 * @description 定义了 JSON Schema 驱动表单系统的全部类型，包括控件类型枚举（ComponentType）、联动规则（LinkageRule）、
 *             Schema 字段定义（SchemaFormItem）、组件 Props/Emits 接口、以及 composable 函数的参数与返回值接口。
 *             是整个 SchemaForm 表单引擎的类型基础。
 *
 * 依赖关系：
 *   - 被引用于: components/SchemaForm/SchemaForm.vue, composables/useSchemaForm.ts, 所有使用 SchemaForm 的页面
 *   - 依赖于: vue（Ref 类型）
 */

/**
 * SchemaForm 表单引擎 - 类型定义文件
 *
 * 本文件定义了 JSON Schema 驱动表单系统的全部类型，
 * 包括控件类型枚举、联动规则、Schema 字段定义、组件 Props/Emits、
 * 以及 composable 函数的参数与返回值接口。
 */

// ============================================================
// A. ComponentType 枚举 - 支持的表单控件类型
// ============================================================

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

// ============================================================
// B. LinkageActionType 枚举 - 联动动作类型
// ============================================================

/** 联动动作类型枚举，定义联动规则触发后可执行的操作种类 */
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

// ============================================================
// C. LinkageCondition 接口 - 联动触发条件
// ============================================================

/** 联动触发条件：监听某个字段的变化，当其值满足条件时执行对应的联动动作 */
export interface LinkageCondition {
  /**
   * 要监听的字段名（即"依赖"哪个字段的变化）
   * 该字段值发生改变时，会重新评估 condition 条件
   * @example watchField: "category" — 监听 category 字段的变化
   */
  watchField: string;

  /**
   * 条件判断逻辑，支持三种形式：
   * - **函数**：接收被监听字段的当前值作为参数，返回 boolean 表示是否满足条件
   * - **具体值**：使用严格等于 (===) 与被监听字段当前值进行匹配
   * - **数组**：检查被监听字段当前值是否在数组中 (Array.includes)
   * @example condition: (val) => val > 10 — 函数形式：值大于 10 时触发
   * @example condition: "active" — 值匹配形式：值严格等于 "active" 时触发
   * @example condition: ["a", "b", "c"] — 数组形式：值为 a/b/c 中任意一个时触发
   */
  condition: unknown | ((value: unknown) => boolean) | unknown[];
}

// ============================================================
// D. LinkageRule 接口 - 单条联动规则
// ============================================================

/** 单条联动规则：当条件满足时，对目标字段执行指定的动作 */
export interface LinkageRule {
  /**
   * 联动规则唯一标识（可选）
   * 主要用于日志追踪和调试，方便定位是哪条规则产生了副作用
   * 生产环境中建议为每条规则设置有意义的 id
   */
  id?: string;

  /** 触发条件定义，决定何时执行本条联动规则 */
  condition: LinkageCondition;

  /** 满足条件后执行的动作类型，取值来自 LinkageActionType 枚举 */
  action: LinkageActionType;

  /**
   * 动作参数，根据 action 类型的不同而具有不同的含义：
   *
   * | action 类型 | actionParams 类型 | 含义 |
   * |---|---|---|
   * | VISIBLE | `boolean` | 设置目标字段是否可见 |
   * | DISABLED | `boolean` | 设置目标字段是否禁用 |
   * | OPTIONS | `Array<{label, value}>` | 替换目标字段的选项列表 |
   * | REQUIRED | `boolean` | 设置目标字段是否必填 |
   * | SET_VALUE | `any` | 直接设置目标字段的值 |
   *
   * @example { action: LinkageActionType.VISIBLE, actionParams: false } // 隐藏目标字段
   * @example { action: LinkageActionType.OPTIONS, actionParams: [{label:"选项A", value:"a"}] }
   */
  actionParams: unknown;

  /**
   * 规则描述文本（可选）
   * 仅用于日志输出、调试信息展示，不影响任何运行逻辑
   * @example description: "当分类为'电子产品'时显示保修期字段"
   */
  description?: string;
}

// ============================================================
// E. SchemaFormItem 接口 - 核心类型：单个表单字段的 Schema 定义
// ============================================================

/**
 * 表单字段 Schema 定义（单个字段）
 *
 * 每个 SchemaFormItem 对应页面上的一个 `el-form-item` 及其内部的表单控件。
 * 这是整个 SchemaForm 系统的核心数据结构，通过声明式配置驱动表单渲染。
 *
 * @example
 * ```typescript
 * const userField: SchemaFormItem = {
 *   field: "username",
 *   label: "用户名",
 *   component: ComponentType.INPUT,
 *   required: true,
 *   componentProps: { placeholder: "请输入用户名", maxlength: 20 },
 * };
 * ```
 */
export interface SchemaFormItem {
  /**
   * 字段名（对应 formModel 的 key）
   * 同时也是表单提交时的字段名、校验规则的 prop 名、以及联动规则中的 watchField 目标
   * 必须在整个 schema 数组中唯一
   * @example field: "email"
   */
  field: string;

  /**
   * 字段标签（显示在 el-form-item 的 label 位置）
   * 用户看到的字段名称文本
   * @example label: "电子邮箱"
   */
  label: string;

  /**
   * 控件类型标识
   * 可使用 ComponentType 枚举值，也可传入自定义注册的字符串标识（用于扩展第三方组件）
   * 表单引擎根据此值动态渲染对应的表单控件
   * @example component: ComponentType.SELECT
   * @example component: "customUpload" — 自定义注册的组件名
   */
  component: string | ComponentType;

  // ---------- 控件属性（透传给底层组件） ----------

  /**
   * 组件 props 对象（透传给 `<component :is="..." v-bind="componentProps">`）
   *
   * 用于配置底层 UI 组件的各项属性，不同组件支持的 props 不同：
   * - **input**: placeholder, maxlength, clearable, showPassword, prefix-icon 等
   * - **inputNumber**: min, max, step, precision, controls 等
   * - **select**: multiple, clearable, filterable, allow-create, placeholder 等
   * - **datePicker**: type, format, value-format, disabledDate 等
   * - **switch**: active-text, inactive-text, active-value, inactive-value 等
   *
   * ⚠️ 注意：value / modelValue 不在此处设置，由表单引擎统一管理双向绑定
   *
   * @example { placeholder: "请选择", clearable: true, filterable: true }
   */
  componentProps?: Record<string, unknown>;

  // ---------- 选项类控件专属配置 ----------

  /**
   * 选项列表（适用于 select / radio / checkbox / cascader 等选项类控件）
   * 每个选项包含 label（显示文本）和 value（实际值），可选 disabled 标记是否禁用该选项
   * 联动动作 OPTIONS 会动态替换此数组
   * @example [{ label: "启用", value: 1 }, { label: "禁用", value: 0 }]
   */
  options?: Array<{ label: string; value: unknown; disabled?: boolean }>;

  // ---------- 校验规则配置 ----------

  /**
   * 是否必填（快捷方式）
   * 设为 true 时等同于在 rules 数组中添加 `{ required: true, message: "${label}不能为空" }`
   * 若需要自定义 message 或更复杂的校验，请使用 rules 属性
   */
  required?: boolean;

  /**
   * Element Plus FormRules 格式的校验规则数组
   * 每条规则支持以下常用字段：
   * - required: 是否必填
   * - message: 校验失败提示文案
   * - trigger: 触发时机 ("blur" | "change")
   * - type: 值类型约束（string/number/array/email 等）
   * - min/max: 字符串长度或数值范围
   * - pattern: 正则表达式校验
   * - validator: 自定义异步/同步校验函数
   *
   * @example [{ required: true, message: "请输入手机号", trigger: "blur" }, { pattern: /^1\d{10}$/, message: "手机号格式不正确", trigger: "blur" }]
   */
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

  // ---------- 联动配置 ----------

  /**
   * 联动规则数组
   * 本字段作为联动规则的**目标**（被控制方），当其他字段（watchField）变化且条件满足时，
   * 执行本数组中定义的动作来改变自身状态（显隐、禁用、选项、必填、值等）
   * @example 当"订单类型"字段变为"退货单"时，隐藏"收货地址"字段并设置"原因说明"为必填
   */
  linkageRules?: LinkageRule[];

  // ---------- 布局与展示 ----------

  /**
   * 默认值
   * 表单初始化或重置时，若 modelValue 中无对应字段值，则使用此默认值
   * 也用于 resetFields 操作恢复初始状态
   * @example defaultValue: "" — 文本框默认空字符串
   * @example defaultValue: [] — 多选默认空数组
   */
  defaultValue?: unknown;

  /**
   * 字段是否隐藏（基础隐藏状态，不受联动控制）
   * 与联动的 VISIBLE 动作配合使用：
   * - hidden 为 true 时，即使联动设置为 visible=true 也不会显示（除非联动能覆盖此值）
   * - 通常建议仅使用联动来控制显隐，此属性保留给静态场景
   */
  hidden?: boolean;

  /**
   * 字段是否禁用（基础禁用状态，不受联动控制）
   * 与联动的 DISABLED 动作配合使用，逻辑同 hidden
   * @example disabled: true — 编辑模式下只读的字段可设为禁用
   */
  disabled?: boolean;

  /**
   * el-form-item 的标签宽度（如 "80px"、"100px"、"auto"）
   * 不填则继承表单级 labelWidth 配置
   * 用于某些字段需要特殊标签宽度的场景
   * @example labelWidth: "120px"
   */
  labelWidth?: string;

  /**
   * el-form-item 的栅格占用列数（span）
   * 配合 el-row / el-col 栅格布局系统使用时有效
   * Element Plus 栅格系统默认 24 等分，常见值：24(整行)、12(半行)、8(1/3)、6(1/4)
   * @example span: 12 — 占据一半宽度
   */
  span?: number;

  /**
   * 自定义插槽名称
   * 若设置了此属性，则渲染时不使用 component 指定的内置组件，
   * 而是在父组件中通过 `<template #slotName>` 提供的自定义渲染内容
   * 适用于需要高度定制化的复杂表单字段
   * @example slotName: "customUploader"
   */
  slotName?: string;

  /**
   * 提示文本
   * 显示在标签下方或输入框下方的辅助说明文字
   * 用于对字段填写要求做补充说明
   * @example tips: "支持 jpg/png 格式，大小不超过 2MB"
   */
  tips?: string;

  /**
   * 字段说明（以 tooltip 形式展示）
   * 通常在标签旁显示一个问号图标，鼠标悬停时展示详细说明
   * 适合放置较长的解释性文字
   * @example description: "此处填写的手机号将用于接收短信通知"
   */
  description?: string;

  // ---------- 高级配置 ----------

  /**
   * 自定义 CSS 类名
   * 附加到 el-form-item 外层容器元素上，用于样式定制
   * @example className: "form-field-username"
   */
  className?: string;

  /**
   * 内联样式对象
   * 附加到 el-form-item 外层容器元素上，用于精细化的样式控制
   * @example style: { marginBottom: "16px" }
   */
  style?: Record<string, string>;

  /**
   * 渲染前钩子函数
   * 在每次渲染该字段之前调用，接收当前 schema 和整个表单 model，
   * 返回修改后的 schema（或不返回任何值表示不修改）
   * 可用于根据其他字段值动态调整当前字段的属性（props、rules、options 等）
   * 注意：此钩子不应产生副作用（如修改 modelValue），仅用于调整 schema 本身
   *
   * @param schema - 当前字段的 schema 对象（可修改后返回）
   * @param model - 当前表单完整数据模型（只读参考）
   * @returns 修改后的 schema 对象，或 void/undefined 表示不修改
   *
   * @example
   * ```typescript
   * beforeRender: (schema, model) => {
   *   if (model.type === "vip") {
   *     schema.componentProps!.placeholder = "VIP 用户专用输入";
   *   }
   *   return schema;
   * }
   * ```
   */
  beforeRender?: (schema: SchemaFormItem, model: Record<string, unknown>) => SchemaFormItem | void;
}

// ============================================================
// F. SchemaFormProps 接口 - 组件 Props
// ============================================================

/**
 * SchemaForm 组件的外部 Props 接口
 *
 * 定义了父组件向 SchemaForm 传递的所有配置项。
 * 其中 schema 和 modelValue 为必需属性，其余均为可选的表单全局配置。
 */
export interface SchemaFormProps {
  /**
   * Schema 定义数组（每个元素是一个字段的完整描述）
   * 表单引擎遍历此数组，为每个 SchemaFormItem 渲染对应的 el-form-item + 控件
   * 数组顺序即为页面上字段的排列顺序
   *
   * ⚠️ 注意：若同时传入了 reactiveSchemas，则渲染时优先使用 reactiveSchemas
   * （因为联动引擎会动态修改 schema 的 hidden/disabled/options 等属性）
   */
  schema: SchemaFormItem[];

  /**
   * 响应式 Schema 引用（可选）
   * 由 useSchemaForm composable 返回的 formSchemas，包含联动引擎动态修改后的最新状态
   * 若传入此项，visibleSchemas 和 computedRules 将基于此数据计算，而非 props.schema
   *
   * ⚠️ 这是联动功能正常工作的关键：联动引擎修改的是 composable 内部的 formSchemas，
   * 必须将这份响应式数据传入组件才能触发重新渲染
   */
  reactiveSchemas?: import("vue").Ref<SchemaFormItem[]>;

  /**
   * 字段可见性字典（可选，联动显隐专用）
   * 由 useSchemaForm composable 返回的 visibleFields，
   * key 为字段名，value 为是否可见（true/false）。
   *
   * 若传入此项，visibleSchemas 计算属性将基于此字典过滤字段，
   * 优先级高于 schema item 自身的 hidden 属性。
   * 这是联动 VISIBLE 动作生效的关键数据通道。
   */
  visibleFields?: import("vue").Ref<Record<string, boolean>>;

  /**
   * 表单数据模型（v-model 双向绑定）
   * key 为各字段的 field 名，value 为对应字段的当前值
   * 父组件可通过 v-model 绑定，子组件内部变更时会 emit update:modelValue 事件通知父组件
   * 初始值通常由 useSchemaForm composable 根据 schema 的 defaultValue 自动填充
   * @example { username: "", age: 18, gender: "male", hobbies: [] }
   */
  modelValue: Record<string, unknown>;

  /**
   * 表单整体标签宽度（作用于所有未单独设置 labelWidth 的字段）
   * @example labelWidth: "100px"
   */
  labelWidth?: string;

  /**
   * 表单尺寸，影响所有内部控件的尺寸
   * - "large": 大尺寸（适用于表单项较少、需要突出强调的场景）
   * - "default": 默认尺寸（最常用的标准尺寸）
   * - "small": 小尺寸（适用于字段密集、空间有限的场景）
   * - "": 不设置（使用 Element Plus 全局默认尺寸）
   */
  size?: "" | "large" | "default" | "small";

  /**
   * 标签位置
   * - "left": 标签左对齐（紧凑布局常用）
   * - "right": 标签右对齐（Element Plus 默认值，视觉上更整齐）
   * - "top": 标签在上方（垂直布局，适用于移动端或窄屏场景）
   */
  labelPosition?: "left" | "right" | "top";

  /**
   * 是否禁用整个表单
   * 设为 true 时，所有字段均处于禁用状态（优先级低于字段级别的 disabled）
   * 典型用途：详情查看模式、审批流程中的不可编辑节点
   */
  disabled?: boolean;

  /**
   * 是否隐藏必填标记（* 号）
   * 设为 true 时，required 字段前的红色星号不显示
   * 适用于某些设计规范不允许出现星号的场景
   */
  hideRequiredAsterisk?: boolean;

  /**
   * 是否内联模式（标签和控件在同一行排列）
   * 设为 true 时，el-form 使用 inline 模式渲染
   * 适用于字段数量少、一行可容纳多个字段的简单表单
   */
  inline?: boolean;

  /**
   * 表单字段校验状态改变时的回调函数
   * 当某个字段的校验结果从合法变为非法（或反之）时触发
   * 可用于实时收集校验错误信息、实现自定义的错误提示UI等
   *
   * @param prop - 发生校验变化的字段名（field 值）
   * @param isValid - 当前校验是否通过（true=通过，false=未通过）
   * @param message - 校验未通过时的错误提示文本（通过时为空字符串）
   */
  onValidate?: (prop: string, isValid: boolean, message: string) => void;
}

// ============================================================
// G. SchemaFormEmits 接口 - 组件 Emits
// ============================================================

/**
 * SchemaForm 组件的事件（Emits）接口
 *
 * 使用 TypeScript 的语法事件签名格式定义组件向外抛出的事件，
 * 方便父组件获得类型提示和编译时检查。
 * 每个事件的值为其参数元组类型。
 */
export interface SchemaFormEmits {
  /**
   * 表单数据变更事件（v-model:modelValue 的更新通道）
   * 当任意字段值变化时触发，携带完整的最新表单数据
   * 父组件通过 `v-model="formData"` 或 `@update:modelValue="handler"` 监听
   *
   * @param value - 变更后的完整表单数据模型
   */
  "update:modelValue": [value: Record<string, unknown>];

  /**
   * 表单提交事件
   * 当调用 submit 方法且全校验通过后触发
   * 携带经过校验的最终表单数据
   * 父组件通过 `@submit="handleSubmit"` 监听
   *
   * @param data - 校验通过的表单数据（即最终的提交数据）
   */
  submit: [data: Record<string, unknown>];

  /**
   * 字段值变更事件
   * 任意字段值发生变化时触发，可用于：
   * - 作为联动源的通知机制（虽然内部 watch 已自动处理联动）
   * - 父组件需要精确感知某个字段何时变化
   * - 实现字段级的业务逻辑（如自动保存草稿）
   *
   * @param field - 发生变化的字段名
   * @param value - 变化后的新值
   * @param oldValue - 变化前的旧值
   */
  fieldChange: [field: string, value: unknown, oldValue: unknown];
}

// ============================================================
// H. UseSchemaFormOptions 接口 - Composable 参数
// ============================================================

/**
 * useSchemaForm composable 函数的参数接口
 *
 * useSchemaForm 是 SchemaForm 的核心逻辑封装（Composition API 风格），
 * 将表单的状态管理、校验、联动等逻辑抽离为独立的 composable，
 * 使 SchemaForm 组件本身保持轻量，同时支持在组件外部复用表单逻辑。
 */
export interface UseSchemaFormOptions {
  /**
   * 原始 Schema 定义数组
   * 即用户声明的表单字段配置，composable 内部会基于此创建响应式副本以支持联动动态修改
   */
  schema: SchemaFormItem[];

  /**
   * 初始表单数据（可选）
   * 用于编辑场景：当打开一个已有数据的编辑表单时，传入已有的数据作为初始值
   * 若不提供，composable 会自动根据每个 schema item 的 defaultValue 构建初始数据
   * 注意：此初始值的优先级高于 schema 中的 defaultValue
   *
   * @example { id: 123, name: "张三", status: "active" }
   */
  initialModel?: Record<string, unknown>;
}

// ============================================================
// I. UseSchemaFormReturn 接口 - Composable 返回值
// ============================================================

/**
 * useSchemaForm composable 函数的返回值接口
 *
 * 包含表单引擎提供的全部响应式状态和方法，
 * 组件通过解构此返回值获取所需的能力。
 */
export interface UseSchemaFormReturn {
  /**
   * 响应式表单数据模型（Ref 包装）
   * key 为字段 field 名，value 为字段当前值
   * 任何对此对象的修改都会触发 update:modelValue emit 通知父组件
   * 同时也会触发联动规则的重新评估
   * @type {Ref<Record<string, unknown>>}
   */
  formModel: Ref<Record<string, unknown>>;

  /**
   * 响应式校验规则集合（Ref 包装）
   * key 为字段 field 名，值为该字段的校验规则数组
   * 由 composable 启动时从各 schema item 的 rules + required 合并生成
   * 联动的 REQUIRED 动作会动态增删其中的 required 规则
   * @type {Ref<Record<string, Array<any>>>}
   */
  formRules: Ref<Record<string, Array<any>>>;

  /**
   * 响应式 Schema 数组（Ref 包装）
   * composable 内部维护的一份 schema 深拷贝，支持运行时动态修改：
   * - 联动的 VISIBLE/DISABLED 动作会修改其中字段的 hidden/disabled 状态
   * - 联动的 OPTIONS 动作会替换其中字段的 options 数组
   * - beforeRender 钩子可在渲染前临时修改 schema 属性
   *
   * ⚠️ 重要：不要直接修改此 Ref 内的对象来改变表单行为，
   * 应通过 setFieldValue / evaluateLinkages 等方法间接操作
   *
   * @type {Ref<SchemaFormItem[]>}
   */
  formSchemas: Ref<SchemaFormItem[]>;

  /**
   * 字段可见性字典（扁平响应式结构，联动显隐专用）
   *
   * key = 字段名（如 "severity"），value = 是否可见（true/false）
   *
   * 【设计原因】Vue 3 的 Proxy 无法可靠追踪 Ref<SchemaFormItem[]> 内部对象的深层属性变更。
   * 使用独立的扁平 Record 结构可以保证联动 VISIBLE 动作写入后，
   * SchemaForm 组件的 visibleSchemas 计算属性 100% 可靠地重新求值并触发视图更新。
   *
   * @type {Ref<Record<string, boolean>>}
   */
  visibleFields: Ref<Record<string, boolean>>;

  /**
   * 表单 DOM 引用（Ref 包装）
   * 指向 `<el-form>` 组件实例，用于调用其原生方法：
   * - validate() / validateField() — 校验
   * - resetFields() — 重置
   * - clearValidate() — 清除校验状态
   * - scrollToField() — 滚动到指定字段
   *
   * ⚠️ 类型标注为 Ref<any>：ElForm 的完整类型从 element-plus 导入链路较深，
   * 此处简化处理，实际使用时可通过 as 断言获取更强类型
   *
   * @type {Ref<any>}
   */
  formRef: Ref<any>;

  /**
   * 执行表单全校验
   * 遍历所有字段执行校验规则，返回 Promise<boolean>
   * 所有字段校验通过时 resolve(true)，任一字段失败时 resolve(false)
   * @returns Promise<boolean> — 是否全部校验通过
   */
  validate: () => Promise<boolean>;

  /**
   * 重置表单
   * 将所有字段值恢复为初始值（initialModel 或 defaultValue），
   * 并清除所有校验状态（移除 error 状态和提示文字）
   * 注意：此操作不会触发表单提交或联动重新评估
   */
  resetFields: () => void;

  /**
   * 清除指定字段的校验状态（不清空字段值）
   * 不传参数时清除所有字段的校验状态
   * 适用于需要在特定时机手动清除错误提示的场景
   * （如用户开始输入时清除之前的校验错误）
   *
   * @param fields - 要清除校验状态的字段名数组，不传则清除全部
   */
  clearValidate: (fields?: string[]) => void;

  /**
   * 手动触发一次全量联动计算
   * 遍历所有字段的 linkageRules，根据当前 formModel 值重新评估每条规则并执行对应动作
   *
   * ⚠️ 正常情况下不需要手动调用此方法：
   * composable 内部已通过 watch(formModel) 自动监听字段变化并触发联动
   * 仅在以下特殊场景可能需要手动调用：
   * - 外部直接修改了 formModel 但未被 watch 捕获
   * - 需要在特定时机强制刷新联动状态
   */
  evaluateLinkages: () => void;

  /**
   * 获取当前表单数据的快照（非响应式普通对象）
   * 返回 formModel 当前值的浅拷贝，可用于：
   * - 提交前构建请求 payload
   * - 数据对比（编辑前后差异检测）
   * - 序列化为 JSON 存储到 localStorage
   *
   * @returns 当前表单数据的普通对象副本
   */
  getFormData: () => Record<string, unknown>;

  /**
   * 设置指定字段的值并自动触发联动重新评估
   * 相比直接赋值 formModel[field] = value，此方法额外执行：
   * 1. 更新 formModel 中对应字段的值
   * 2. 触发 update:modelValue emit 通知父组件
   * 3. 触发 fieldChange emit（携带新旧值）
   * 4. 自动执行 evaluateLinkages 重新计算联动规则
   *
   * @param field - 目标字段名（必须存在于 schema 中）
   * @param value - 要设置的新值
   */
  setFieldValue: (field: string, value: unknown) => void;
}
