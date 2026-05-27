import type { Component } from "vue";
import {
  ElInput,
  ElInputNumber,
  ElSelect,
  ElRadioGroup,
  // ⚠️ ElRadioButton / ElCheckboxButton 在 SchemaForm.vue 模板中动态渲染，不在此处引用
  ElCheckboxGroup,
  ElSwitch,
  ElSlider,
  ElTimePicker,
  ElDatePicker,
  ElCascader,
  ElRate,
  ElColorPicker,
} from "element-plus";
import { ComponentType } from "./types";

// Textarea is just ElInput with type="textarea", no separate import needed

/**
 * 内置组件映射字典
 * 键：ComponentType 枚举值字符串（如 'input', 'select'）
 * 值：对应的 Vue 组件对象
 *
 * 使用 Map 而非普通对象的理由：
 *   1. 支持 any 类型的键（虽然这里只用 string）
 *   2. 有清晰的 .has() / .get() / .set() API
 *   3. 可迭代，便于调试时遍历所有已注册组件
 *   4. 性能：频繁查找时 Map 优于对象属性查找
 */
const componentMap = new Map<string, Component>([
  // 文本输入类
  [ComponentType.INPUT, ElInput],
  [ComponentType.TEXTAREA, ElInput], // 通过 componentProps.type = "textarea" 区分
  [ComponentType.INPUT_NUMBER, ElInputNumber],

  // 选择类
  [ComponentType.SELECT, ElSelect],
  [ComponentType.RADIO, ElRadioGroup],     // 子项 ElRadioButton 在 SchemaForm.vue 中动态生成
  [ComponentType.CHECKBOX, ElCheckboxGroup], // 子项 ElCheckboxButton 在 SchemaForm.vue 中动态生成
  [ComponentType.CASCADER, ElCascader],

  // 开关与滑块
  [ComponentType.SWITCH, ElSwitch],
  [ComponentType.SLIDER, ElSlider],

  // 时间日期类
  [ComponentType.TIME_PICKER, ElTimePicker],
  [ComponentType.DATE_PICKER, ElDatePicker],
  [ComponentType.DATE_RANGE_PICKER, ElDatePicker], // 通过 componentProps.type = "daterange" 区分

  // 其他
  [ComponentType.RATE, ElRate],
  [ComponentType.COLOR_PICKER, ElColorPicker],
]);

/**
 * 根据组件类型字符串获取对应的 Vue 组件
 * @param type - 组件类型字符串，对应 ComponentType 枚举值
 * @returns 对应的 Vue 组件对象；未找到时返回 ElInput 作为降级方案
 */
function getComponent(type: string): Component | null {
  const component = componentMap.get(type);

  if (component) {
    console.log(`[schema-form-config] 获取组件: ${type}`);
    return component;
  }

  console.warn(
    `[schema-form-config] ⚠️ 未注册的组件类型: ${type}，将回退到 ElInput`
  );
  return ElInput;
}

/**
 * 注册自定义组件到映射表中
 * 可用于覆盖内置组件或添加全新的组件类型
 *
 * @param type - 自定义组件类型标识符（字符串）
 * @param component - 要注册的 Vue 组件对象
 */
function registerComponent(type: string, component: Component): void {
  componentMap.set(type, component);
  console.log(`[schema-form-config] ✅ 注册自定义组件: ${type}`);
}

/**
 * 检查指定类型是否已注册
 * @param type - 要检查的组件类型字符串
 * @returns 是否已存在该类型的映射
 */
function hasComponent(type: string): boolean {
  return componentMap.has(type);
}

/**
 * 获取当前已注册的所有组件类型列表
 * 主要用于调试和开发时查看已注册组件
 * @returns 已注册的组件类型字符串数组
 */
function getRegisteredTypes(): string[] {
  return Array.from(componentMap.keys());
}

/**
 * 重置组件映射表为初始状态（仅保留内置组件）
 * 清除所有通过 registerComponent 添加的自定义注册
 */
function resetToDefaults(): void {
  componentMap.clear();

  // 重新填充内置组件映射
  const defaultEntries: [string, Component][] = [
    // 文本输入类
    [ComponentType.INPUT, ElInput],
    [ComponentType.TEXTAREA, ElInput],
    [ComponentType.INPUT_NUMBER, ElInputNumber],

    // 选择类
    [ComponentType.SELECT, ElSelect],
    [ComponentType.RADIO, ElRadioGroup],
    [ComponentType.CHECKBOX, ElCheckboxGroup],
    [ComponentType.CASCADER, ElCascader],

    // 开关与滑块
    [ComponentType.SWITCH, ElSwitch],
    [ComponentType.SLIDER, ElSlider],

    // 时间日期类
    [ComponentType.TIME_PICKER, ElTimePicker],
    [ComponentType.DATE_PICKER, ElDatePicker],
    [ComponentType.DATE_RANGE_PICKER, ElDatePicker],

    // 其他
    [ComponentType.RATE, ElRate],
    [ComponentType.COLOR_PICKER, ElColorPicker],
  ];

  for (const [key, value] of defaultEntries) {
    componentMap.set(key, value);
  }

  console.log("[schema-form-config] 已重置为内置组件映射");
}

export { componentMap, getComponent, registerComponent, hasComponent, getRegisteredTypes, resetToDefaults };
