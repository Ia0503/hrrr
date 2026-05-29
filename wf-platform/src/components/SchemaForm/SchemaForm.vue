/**
 * Schema Driven Dynamic Form - Component Layer (Container + Inline Recursive Renderer)
 *
 * Description: SchemaForm engine Vue component implementation with two parts:
 *   1. SchemaForm main component: el-form container + provide context + delegate renderer + rule priority
 *   2. SchemaFormItemRenderer inline sub-component: recursive rendering core, traverses SchemaFormItem array,
 *      distinguishes container nodes(5 UI types) from leaf fields(14 controls), supports arbitrary nesting depth
 *
 * Tech stack: Vue 3 SFC (script setup lang=ts) / Element Plus / TypeScript
 */

<template>
  <el-form
    ref="formRef"
    :model="formModel"
    :rules="effectiveRules"
    :label-width="labelWidth"
    :size="size"
    :label-position="labelPosition"
    :disabled="disabled"
    :hide-required-asterisk="hideRequiredAsterisk"
    :inline="inline"
    class="wf-schema-form"
    @validate="onValidate"
  >
    <!-- 委托给内联的递归渲染器，传入过滤后的可见 schema 列表 -->
    <SchemaFormItemRenderer
      :items="visibleSchemas"
      @field-change="onFieldChange"
      @update:model-value="onModelValueUpdate"
    />
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed, provide, inject, getCurrentInstance } from "vue";
import type { Component } from "vue";
import {
  ElInput,
  ElInputNumber,
  ElSelect,
  ElRadioGroup,
  ElCheckboxGroup,
  ElSwitch,
  ElSlider,
  ElTimePicker,
  ElDatePicker,
  ElCascader,
  ElRate,
  ElColorPicker,
  ElCard,
  ElTabs,
  ElTabPane,
  ElRow,
  ElCol,
} from "element-plus";
import type {
  SchemaFormItem,
  SchemaFormProps,
  SchemaFormEmits,
} from "@/composables/useSchemaForm";
import {
  ComponentType,
  SchemaNodeType,
  ContainerType,
} from "@/composables/useSchemaForm";

/* ============================================================
 * A. SchemaForm 主组件
 * ============================================================ */

defineOptions({
  name: "SchemaForm",
});

const props = withDefaults(defineProps<SchemaFormProps>(), {
  labelWidth: "auto",
  size: "default",
  labelPosition: "right",
  disabled: false,
});

const emit = defineEmits<SchemaFormEmits>();

/** provide/inject 的上下文 key */
const SCHEMA_FORM_CONTEXT_KEY = "schema-form-context";

/**
 * 向所有子组件（包括内联 Renderer 及其递归实例）注入表单上下文
 * 包含：数据模型、禁用状态、尺寸、可见性字典、响应式 schema 等
 */
provide(SCHEMA_FORM_CONTEXT_KEY, {
  modelValue: computed(() => props.modelValue),
  disabled: props.disabled,
  size: props.size,
  labelWidth: props.labelWidth,
  labelPosition: props.labelPosition,
  hideRequiredAsterisk: props.hideRequiredAsterisk,
  visibleFields: props.visibleFields as any,
  reactiveSchemas: props.reactiveSchemas as any,
});

/** el-form 实例引用 */
const formRef = ref<any>(null);

/** 双向绑定计算属性（get/set 分别对应读取 props 和 emit 更新） */
const formModel = computed({
  get: () => props.modelValue,
  set: (val: Record<string, unknown>) => emit("update:modelValue", val),
});

/**
 * 过滤后的可见 Schema 列表（computed 保证响应式）
 * 同时支持容器节点和叶子字段的可见性过滤：
 * - 容器节点通过 field 属性查 visibleFields 字典
 * - 叶子字段同样查 visibleFields，无记录时回退到 hidden 属性
 */
const visibleSchemas = computed((): SchemaFormItem[] => {
  const source = props.reactiveSchemas?.value || props.schema;
  /* Ref 兼容取值：Vue 3 模板中 ref 会自动解包为 .value，导致 props 可能是 Ref 或普通对象 */
  const rawVf = props.visibleFields as any;
  const vf = (rawVf && 'value' in rawVf) ? rawVf.value : rawVf;

  return source.filter((item) => {
    /* 容器节点判断：仅以 type 字段为准 */
    const isContainerNode =
      item.type === SchemaNodeType.CONTAINER ||
      item.type === "container";

    if (isContainerNode) {
      const containerField = (item as any).field;
      if (containerField && vf && containerField in vf) {
        return vf[containerField] === true;
      }
      return item.hidden !== true;
    }

    if (vf && item.field in vf) {
      return vf[item.field] === true;
    }
    return item.hidden !== true;
  });
});

/** 从 schema 静态推导的校验规则（fallback 数据源） */
const computedRules = computed(() => {
  const rules: Record<string, any> = {};
  const source = props.reactiveSchemas?.value || props.schema;

  function collectRules(items: SchemaFormItem[]): void {
    for (const item of items) {
      if (
        item.type === SchemaNodeType.CONTAINER ||
        item.type === "container"
      ) {
        if (item.children && item.children.length > 0) {
          collectRules(item.children);
        }
        continue;
      }
      if (item.hidden !== true && item.rules && item.rules.length > 0) {
        rules[item.field] = item.rules;
      }
    }
  }

  collectRules(source);
  return rules;
});

/**
 * el-form 实际使用的校验规则
 * 优先级：props.formRules（联动动态规则） > computedRules（静态兜底规则）
 */
const effectiveRules = computed(() => {
  if (props.formRules) {
    const rawFr = props.formRules as any;
    return (rawFr && 'value' in rawFr) ? rawFr.value : rawFr;
  }
  return computedRules.value;
});

function onFieldChange(field: string, value: unknown, oldValue: unknown): void {
  console.log(
    "[schema-form] field change: [" + field + "] " + JSON.stringify(oldValue) + " -> " + JSON.stringify(value),
  );
  emit("fieldChange", field, value, oldValue);
}

function onModelValueUpdate(value: Record<string, unknown>): void {
  emit("update:modelValue", value);
}

function onValidate(prop: string, isValid: boolean, message: string): void {
  props.onValidate?.(prop, isValid, message);
}

defineExpose({
  formRef,

  async validate() {
    if (!formRef.value) {
      console.warn("[schema-form] validate failed: formRef not mounted");
      return Promise.reject(new Error("form instance not ready"));
    }
    return formRef.value.validate();
  },

  resetFields() {
    if (!formRef.value) {
      console.warn("[schema-form] resetFields failed: formRef not mounted");
      return;
    }
    formRef.value.resetFields();
    console.log("[schema-form] form reset");
  },

  clearValidate(fields?: string[]) {
    if (!formRef.value) {
      console.warn("[schema-form] clearValidate failed: formRef not mounted");
      return;
    }
    formRef.value.clearValidate(fields);
  },
});


/* ============================================================
 * B. SchemaFormItemRenderer 内联子组件（递归渲染核心）
 * ============================================================
 *
 * 职责：
 *   - 接收 SchemaFormItem 数组作为 items prop
 *   - 区分容器节点（type=CONTAINER）和叶子字段（type=FIELD）
 *   - 容器节点：根据 containerType 渲染 5 种 UI 包裹结构（GROUP/FIELDSET/CARD/TABS/GRID），并递归调用自身
 *   - 叶子字段：渲染 el-form-item + 对应控件（14 种内置控件 + 自定义组件兜底）
 *   - 通过 inject 获取父级 SchemaForm 提供的表单上下文（modelValue/disabled/size/visibleFields 等）
 *
 * 自引用机制：
 *   由于此组件定义在同一个 .vue 文件内部，Vue SFC 编译器会自动解析
 *   模板中的 <SchemaFormItemRenderer> 标签为当前文件内的组件定义
 */

import { defineComponent, h } from "vue";

const SchemaFormItemRenderer = defineComponent({
  name: "SchemaFormItemRenderer",

  props: {
    /** 当前层级要渲染的 SchemaFormItem 数组 */
    items: { type: Array as () => SchemaFormItem[], required: true },
  },

  emits: {
    fieldChange: (_field: string, _value: unknown, _oldValue: unknown) => true,
    "update:modelValue": (_value: Record<string, unknown>) => true,
  },

  setup(props, { emit }) {

    /** 从父级 SchemaForm 注入的表单上下文 */
    const ctx = inject<{
      modelValue: import("vue").Ref<Record<string, unknown>>;
      disabled: boolean;
      size: "" | "large" | "default" | "small";
      labelWidth: string;
      labelPosition: "left" | "right" | "top";
      hideRequiredAsterisk: boolean;
      visibleFields?: import("vue").Ref<Record<string, boolean>>;
      reactiveSchemas?: import("vue").Ref<SchemaFormItem[]>;
    }>(SCHEMA_FORM_CONTEXT_KEY, {
      modelValue: { value: {} } as any,
      disabled: false,
      size: "default",
      labelWidth: "auto",
      labelPosition: "right",
      hideRequiredAsterisk: false,
    });

    const instance = getCurrentInstance();

    /* ---- 组件映射表（字符串标识 → Element Plus 组件引用）---- */
    const componentMap = new Map<string, Component>([
      [ComponentType.INPUT, ElInput],
      [ComponentType.TEXTAREA, ElInput],
      [ComponentType.INPUT_NUMBER, ElInputNumber],
      [ComponentType.SELECT, ElSelect],
      [ComponentType.RADIO, ElRadioGroup],
      [ComponentType.CHECKBOX, ElCheckboxGroup],
      [ComponentType.CASCADER, ElCascader],
      [ComponentType.SWITCH, ElSwitch],
      [ComponentType.SLIDER, ElSlider],
      [ComponentType.TIME_PICKER, ElTimePicker],
      [ComponentType.DATE_PICKER, ElDatePicker],
      [ComponentType.DATE_RANGE_PICKER, ElDatePicker],
      [ComponentType.RATE, ElRate],
      [ComponentType.COLOR_PICKER, ElColorPicker],
    ]);

    function getComponent(type: string): Component {
      const comp = componentMap.get(type);
      if (comp) return comp;
      console.warn(
        "[schema-form-renderer] [WARN] unregistered component type: " + type + ", fallback to ElInput",
      );
      return ElInput;
    }

    /* ---- 过滤可见字段（computed 保证响应式）---- */
    const renderedItems = computed(() => {
      /* Ref 兼容取值 */
      const rawVf = ctx.visibleFields as any;
      const vf = (rawVf && 'value' in rawVf) ? rawVf.value : rawVf;

      return props.items.filter((item) => {
        if (isContainer(item)) {
          const containerField = (item as any).field;
          if (containerField && vf && containerField in vf) {
            return vf[containerField] === true;
          }
          return item.hidden !== true;
        }
        if (vf && item.field in vf) {
          return vf[item.field] === true;
        }
        return item.hidden !== true;
      });
    });

    /* ---- 工具方法 ---- */

    /** 判断是否为容器节点（仅以 type 字段为准，不依赖 children 兜底） */
    function isContainer(item: SchemaFormItem): boolean {
      return item.type === SchemaNodeType.CONTAINER ||
        item.type === "container";
    }

    /** 获取容器节点的渲染类型（小写标准化） */
    function getContainerType(item: SchemaFormItem): string {
      const rawType = item.containerType as string | undefined;
      if (!rawType) return "group";
      return rawType.toLowerCase();
    }

    /** 生成列表项的唯一 key（容器用 label+随机数，叶子用 field 名） */
    function getItemKey(item: SchemaFormItem): string {
      if (isContainer(item)) {
        return item.label || ("container-" + Math.random().toString(36).slice(2, 8));
      }
      return item.field;
    }

    /** 判断字段是否处于禁用状态（全局禁用或字段级禁用） */
    function isFieldDisabled(item: SchemaFormItem): boolean {
      return ctx.disabled === true || item.disabled === true;
    }

    /** 字段值变更时向上冒泡事件 */
    function onFieldChange(field: string, value: unknown): void {
      const oldValue = ctx.modelValue.value[field];
      console.log(
        "[schema-form-renderer] field change: [" + field + "] " +
        JSON.stringify(oldValue) + " -> " + JSON.stringify(value),
      );
      if (instance) {
        instance.emit("fieldChange", field, value, oldValue);
        instance.emit("update:modelValue", { ...ctx.modelValue.value });
      }
    }

    /* ---- 渲染函数（替代 template，支持动态递归）---- */
    return () => {
      const nodes: any[] = [];

      for (const schemaItem of renderedItems.value) {
        const key = getItemKey(schemaItem);

        if (isContainer(schemaItem)) {
          /* ===== 容器节点分支 ===== */
          const childItems = schemaItem.children || [];
          const ctype = getContainerType(schemaItem);

          switch (ctype) {
            case "group":
              nodes.push(h(SchemaFormItemRenderer, { key, items: childItems }));
              break;

            case "fieldset":
              nodes.push(h("fieldset", {
                key,
                class: "wf-schema-fieldset",
              }, [
                schemaItem.label ? h("legend", { class: "wf-schema-fieldset__legend" }, schemaItem.label) : null,
                h(SchemaFormItemRenderer, { items: childItems }),
              ]));
              break;

            case "card":
              nodes.push(h(ElCard, {
                key,
                shadow: "never",
                class: "wf-schema-card",
              }, {
                header: schemaItem.label ? () => h("span", { class: "wf-schema-card__title" }, schemaItem.label) : undefined,
                default: () => h(SchemaFormItemRenderer, { items: childItems }),
              }));
              break;

            case "tabs":
              nodes.push(h(ElTabs, {
                key,
                type: "border-card",
                class: "wf-schema-tabs",
              }, () =>
                childItems.map((tabItem, tabIndex) =>
                  h(ElTabPane, {
                    key: `tab-${tabIndex}`,
                    label: tabItem.label || `标签${tabIndex + 1}`,
                  }, () => h(SchemaFormItemRenderer, { items: tabItem.children || [] })),
                ),
              ));
              break;

            case "grid":
              nodes.push(h(ElRow, {
                key,
                gutter: 16,
                class: "wf-schema-grid",
              }, () =>
                childItems.map((gridItem, gridIndex) =>
                  h(ElCol, {
                    key: `grid-${gridIndex}`,
                    span: (gridItem.span as number) || (schemaItem.span as number) || 24,
                  }, () => h(SchemaFormItemRenderer, { items: [gridItem] })),
                ),
              ));
              break;

            default:
              nodes.push(h(SchemaFormItemRenderer, { key, items: childItems }));
              break;
          }

        } else {
          /* ===== 叶子字段分支 ===== */
          if (schemaItem.slotName) {
            /* 自定义插槽模式 */
            nodes.push(h("slot", {
              key,
              name: schemaItem.slotName,
              schema: schemaItem,
              model: ctx.modelValue.value,
              disabled: isFieldDisabled(schemaItem),
            }));
          } else {
            /* 标准 el-form-item 模式 */
            let controlNode: any;

            const commonProps = {
              modelValue: ctx.modelValue.value[schemaItem.field],
              "onUpdate:modelValue": (val: unknown) => {
                ctx.modelValue.value[schemaItem.field] = val;
              },
              disabled: isFieldDisabled(schemaItem),
              size: ctx.size,
              onChange: () => onFieldChange(schemaItem.field, ctx.modelValue.value[schemaItem.field]),
            };

            switch (schemaItem.component) {
              case "select":
                controlNode = h(ElSelect, {
                  ...commonProps,
                  placeholder: (schemaItem.componentProps?.placeholder as string) || ('请选择' + schemaItem.label),
                  clearable: true,
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                }, () =>
                  (schemaItem.options || []).map((opt) =>
                    h(ElOption, {
                      key: String(opt.value),
                      label: opt.label,
                      value: opt.value,
                      disabled: opt.disabled,
                    }),
                  ),
                );
                break;

              case "radio":
                controlNode = h(ElRadioGroup, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                }, () =>
                  (schemaItem.options || []).map((opt) =>
                    h(ElRadioButton, { key: String(opt.value), value: opt.value, disabled: opt.disabled }, () => opt.label),
                  ),
                );
                break;

              case "checkbox":
                controlNode = h(ElCheckboxGroup, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                }, () =>
                  (schemaItem.options || []).map((opt) =>
                    h(ElCheckboxButton, { key: String(opt.value), value: opt.value, disabled: opt.disabled }, () => opt.label),
                  ),
                );
                break;

              case "cascader":
                controlNode = h(ElCascader, {
                  ...commonProps,
                  options: (schemaItem.options as any[]),
                  placeholder: (schemaItem.componentProps?.placeholder as string) || ('请选择' + schemaItem.label),
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;

              case "input":
              case "textarea":
                controlNode = h(ElInput, {
                  ...commonProps,
                  type: schemaItem.component === "textarea" ? "textarea" : "text",
                  placeholder: (schemaItem.componentProps?.placeholder as string) || ('请输入' + schemaItem.label),
                  autosize: { minRows: 2, maxRows: 6 },
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;

              case "inputNumber":
                controlNode = h(ElInputNumber, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;

              case "switch":
                controlNode = h(ElSwitch, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                });
                break;

              case "slider":
                controlNode = h(ElSlider, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control wf-schema-form__control--full",
                });
                break;

              case "timePicker":
                controlNode = h(ElTimePicker, {
                  ...commonProps,
                  placeholder: '选择时间',
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;

              case "datePicker":
              case "dateRangePicker":
                controlNode = h(ElDatePicker, {
                  ...commonProps,
                  type: schemaItem.component === "dateRangePicker" ? "daterange" : "date",
                  placeholder: '选择日期',
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;

              case "rate":
                controlNode = h(ElRate, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                });
                break;

              case "colorPicker":
                controlNode = h(ElColorPicker, {
                  ...commonProps,
                  ...(schemaItem.componentProps || {}),
                });
                break;

              default:
                controlNode = h(getComponent(schemaItem.component), {
                  ...commonProps,
                  is: getComponent(schemaItem.component),
                  ...(schemaItem.componentProps || {}),
                  class: "wf-schema-form__control",
                });
                break;
            }

            /* 构建 el-form-item 包裹控件 */
            const labelSlot = schemaItem.tips
              ? () => h("div", { class: "wf-schema-form__label-wrap" }, [
                  schemaItem.label,
                  h("span", { class: "wf-schema-form__tips" }, schemaItem.tips),
                ])
              : undefined;

            const descriptionNode = schemaItem.description
              ? h("div", { class: "wf-schema-form__description" }, schemaItem.description)
              : null;

            nodes.push(h("el-form-item", {
              key,
              prop: schemaItem.field,
              label: schemaItem.label,
              required: schemaItem.required,
              labelWidth: schemaItem.labelWidth || undefined,
              class: [schemaItem.className, 'wf-schema-form__item'],
              style: schemaItem.style,
            }, {
              label: labelSlot,
              default: () => [controlNode, descriptionNode],
            }));
          }
        }
      }

      return nodes;
    };
  },
});
</script>

<style scoped>
.wf-schema-form {
  --wf-form-gap: 20px;
}
.wf-schema-fieldset {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 16px 20px;
  margin-bottom: var(--wf-form-gap, 20px);
}
.wf-schema-fieldset__legend {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  padding: 0 8px;
}
.wf-schema-card {
  margin-bottom: var(--wf-form-gap, 20px);
}
.wf-schema-card__title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.wf-schema-tabs {
  margin-bottom: var(--wf-form-gap, 20px);
}
.wf-schema-grid {
  margin-bottom: var(--wf-form-gap, 20px);
}
.wf-schema-form__item {
  margin-bottom: var(--wf-form-gap, 20px);
}
.wf-schema-form__item:last-child {
  margin-bottom: 0;
}
.wf-schema-form__label-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}
.wf-schema-form__tips {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
  line-height: 1.4;
}
.wf-schema-form__control {
  width: 100%;
}
.wf-schema-form__control--full {
  width: 100%;
}
.wf-schema-form__description {
  margin-top: 6px;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #606266;
  background-color: #f5f7fa;
  border-radius: 4px;
  border-left: 3px solid #dcdfe6;
}
.wf-schema-form :deep(.el-select),
.wf-schema-form :deep(.el-cascader),
.wf-schema-form :deep(.el-date-editor) {
  width: 100%;
}
.wf-schema-form :deep(.el-input-number) {
  width: 100%;
}
.wf-schema-form :deep(.el-radio-group),
.wf-schema-form :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.wf-schema-form :deep(.el-rate) {
  display: flex;
  align-items: center;
}
</style>
