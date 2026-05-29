/**
 * @file SchemaForm 字段渲染器（递归组件）
 * @module components/SchemaForm/SchemaFormItemRenderer
 * @description SchemaForm 表单引擎的递归渲染核心组件，负责将 SchemaFormItem 数组（支持树形嵌套结构）
 *             渲染为对应的 el-form-item + 控件或容器包裹元素。通过 inject 获取父级 SchemaForm 提供的表单上下文，
 *             支持自身递归调用以实现任意深度的嵌套表单。
 *
 * 设计职责：
 *   - 遍历 SchemaFormItem 数组，区分叶子字段（type="field"）和容器节点（type="container"）
 *   - 叶子字段：渲染 el-form-item + 对应控件（input/select/radio 等），与原 SchemaForm.vue 模板逻辑一致
 *   - 容器节点：根据 containerType 渲染对应的 UI 包裹元素，并递归渲染 children
 *   - 通过 inject 获取表单上下文（modelValue、disabled、size 等），无需逐层传递 props
 *
 * 依赖关系：
 *   - 被引用于: components/SchemaForm/SchemaForm.vue（唯一调用方）
 *   - 依赖于: vue（inject, computed, type Component）、element-plus（全部内置控件）、./types（类型定义）
 *   - 注入来源: SchemaForm.vue 的 provide("schema-form-context")
 */

<template>
  <template v-for="schemaItem in renderedItems" :key="getItemKey(schemaItem)">
    <!-- ===== 容器节点：根据 containerType 渲染不同的 UI 包裹结构 ===== -->
    <template v-if="isContainer(schemaItem)">
      <!-- GROUP：无额外包裹，直接递归渲染子节点 -->
      <template v-if="getContainerType(schemaItem) === 'group'">
        <SchemaFormItemRenderer :items="schemaItem.children || []" />
      </template>

      <!-- FIELDSET：<fieldset> + <legend> 语义化分组 -->
      <fieldset
        v-else-if="getContainerType(schemaItem) === 'fieldset'"
        class="wf-schema-fieldset"
      >
        <legend v-if="schemaItem.label" class="wf-schema-fieldset__legend">
          {{ schemaItem.label }}
        </legend>
        <SchemaFormItemRenderer :items="schemaItem.children || []" />
      </fieldset>

      <!-- CARD：el-card 卡片面板 -->
      <el-card
        v-else-if="getContainerType(schemaItem) === 'card'"
        :shadow="'never'"
        class="wf-schema-card"
      >
        <template #header v-if="schemaItem.label">
          <span class="wf-schema-card__title">{{ schemaItem.label }}</span>
        </template>
        <SchemaFormItemRenderer :items="schemaItem.children || []" />
      </el-card>

      <!-- TABS：el-tabs 标签页分页 -->
      <el-tabs
        v-else-if="getContainerType(schemaItem) === 'tabs'"
        :type="'border-card'"
        class="wf-schema-tabs"
      >
        <el-tab-pane
          v-for="(tabItem, tabIndex) in (schemaItem.children || [])"
          :key="`tab-${tabIndex}`"
          :label="tabItem.label || `标签${tabIndex + 1}`"
        >
          <SchemaFormItemRenderer :items="tabItem.children || []" />
        </el-tab-pane>
      </el-tabs>

      <!-- GRID：el-row + el-col 栅格布局 -->
      <el-row v-else-if="getContainerType(schemaItem) === 'grid'" :gutter="16" class="wf-schema-grid">
        <el-col
          v-for="(gridItem, gridIndex) in (schemaItem.children || [])"
          :key="`grid-${gridIndex}`"
          :span="(gridItem.span as number) || (schemaItem.span as number) || 24"
        >
          <SchemaFormItemRenderer :items="[gridItem]" />
        </el-col>
      </el-row>

      <!-- 兜底：未知容器类型按 GROUP 处理 -->
      <template v-else>
        <SchemaFormItemRenderer :items="schemaItem.children || []" />
      </template>
    </template>

    <!-- ===== 叶子字段：渲染 el-form-item + 对应控件 ===== -->
    <template v-else>
      <!-- 自定义插槽模式 -->
      <slot
        v-if="schemaItem.slotName"
        :name="schemaItem.slotName"
        :schema="schemaItem"
        :model="ctx.modelValue.value"
        :disabled="isFieldDisabled(schemaItem)"
      />

      <!-- 标准 el-form-item 模式 -->
      <el-form-item
        v-else
        :prop="schemaItem.field"
        :label="schemaItem.label"
        :required="schemaItem.required"
        :label-width="schemaItem.labelWidth || undefined"
        :class="[schemaItem.className, 'wf-schema-form__item']"
        :style="schemaItem.style"
      >
        <!-- 标签下方提示文字 -->
        <template v-if="schemaItem.tips" #label>
          <div class="wf-schema-form__label-wrap">
            {{ schemaItem.label }}
            <span class="wf-schema-form__tips">{{ schemaItem.tips }}</span>
          </div>
        </template>

        <!-- Select 下拉选择 -->
        <el-select
          v-if="schemaItem.component === 'select'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || ('请选择' + schemaItem.label)"
          :clearable="true"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        >
          <el-option
            v-for="opt in (schemaItem.options || [])"
            :key="String(opt.value)"
            :label="opt.label"
            :value="opt.value"
            :disabled="opt.disabled"
          />
        </el-select>

        <!-- Radio 单选按钮组 -->
        <el-radio-group
          v-else-if="schemaItem.component === 'radio'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        >
          <el-radio-button
            v-for="opt in (schemaItem.options || [])"
            :key="String(opt.value)"
            :value="opt.value"
            :disabled="opt.disabled"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>

        <!-- Checkbox 多选框组 -->
        <el-checkbox-group
          v-else-if="schemaItem.component === 'checkbox'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        >
          <el-checkbox-button
            v-for="opt in (schemaItem.options || [])"
            :key="String(opt.value)"
            :value="opt.value"
            :disabled="opt.disabled"
          >
            {{ opt.label }}
          </el-checkbox-button>
        </el-checkbox-group>

        <!-- Cascader 级联选择 -->
        <el-cascader
          v-else-if="schemaItem.component === 'cascader'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :options="(schemaItem.options as any[])"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || ('请选择' + schemaItem.label)"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Input / Textarea 文本输入 -->
        <el-input
          v-else-if="['input', 'textarea'].includes(schemaItem.component)"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :type="schemaItem.component === 'textarea' ? 'textarea' : 'text'"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || ('请输入' + schemaItem.label)"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          :autosize="{ minRows: 2, maxRows: 6 }"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- InputNumber 数字输入 -->
        <el-input-number
          v-else-if="schemaItem.component === 'inputNumber'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Switch 开关 -->
        <el-switch
          v-else-if="schemaItem.component === 'switch'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Slider 滑块 -->
        <el-slider
          v-else-if="schemaItem.component === 'slider'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control wf-schema-form__control--full"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- TimePicker 时间选择器 -->
        <el-time-picker
          v-else-if="schemaItem.component === 'timePicker'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :placeholder="'选择时间'"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- DatePicker / DateRangePicker 日期选择器 -->
        <el-date-picker
          v-else-if="['datePicker', 'dateRangePicker'].includes(schemaItem.component)"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :type="schemaItem.component === 'dateRangePicker' ? 'daterange' : 'date'"
          :placeholder="'选择日期'"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Rate 评分组件 -->
        <el-rate
          v-else-if="schemaItem.component === 'rate'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- ColorPicker 颜色选择器 -->
        <el-color-picker
          v-else-if="schemaItem.component === 'colorPicker'"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- 兜底：通用动态组件 -->
        <component
          v-else
          :is="getComponent(schemaItem.component)"
          v-model="ctx.modelValue.value[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          :size="ctx.size"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- 字段描述文本 -->
        <div v-if="schemaItem.description" class="wf-schema-form__description">
          {{ schemaItem.description }}
        </div>
      </el-form-item>
    </template>
  </template>
</template>

<script setup lang="ts">
import { inject, computed, getCurrentInstance } from "vue";
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
import type { SchemaFormItem } from "./types";
import { ComponentType, SchemaNodeType, ContainerType } from "./types";

/* ============================================================
 * 组件名称声明（必须显式定义，用于模板中自引用递归调用）
 * ============================================================ */
defineOptions({
  name: "SchemaFormItemRenderer",
});

/* ============================================================
 * Props 定义
 * ============================================================ */
const props = defineProps<{
  items: SchemaFormItem[];
}>();

/* ============================================================
 * Emit 定义
 * ============================================================ */
const emit = defineEmits<{
  fieldChange: [field: string, value: unknown, oldValue: unknown];
  "update:modelValue": [value: Record<string, unknown>];
}>();

/* ============================================================
 * Inject：从父级 SchemaForm 注入的表单上下文
 * ============================================================ */
const SCHEMA_FORM_CONTEXT_KEY = "schema-form-context";

interface SchemaFormContext {
  modelValue: import("vue").Ref<Record<string, unknown>>;
  disabled: boolean;
  size: "" | "large" | "default" | "small";
  labelWidth: string;
  labelPosition: "left" | "right" | "top";
  hideRequiredAsterisk: boolean;
  visibleFields?: import("vue").Ref<Record<string, boolean>>;
  reactiveSchemas?: import("vue").Ref<SchemaFormItem[]>;
}

const ctx = inject<SchemaFormContext>(SCHEMA_FORM_CONTEXT_KEY, {
  modelValue: { value: {} } as any,
  disabled: false,
  size: "default",
  labelWidth: "auto",
  labelPosition: "right",
  hideRequiredAsterisk: false,
} as SchemaFormContext);

/* 获取当前组件实例（用于 emit 事件到父组件） */
const instance = getCurrentInstance();

/* ============================================================
 * 组件映射表
 * ============================================================ */
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
  const component = componentMap.get(type);
  if (component) {
    return component;
  }
  console.warn(
    "[schema-form-renderer] [WARN] unregistered component type: " + type + ", fallback to ElInput",
  );
  return ElInput;
}

/* ============================================================
 * 计算属性：过滤可见字段（必须用 computed 保证响应式）
 * ============================================================ */
const renderedItems = computed(() => {
  /* Ref 兼容取值：ctx.visibleFields 可能是 Ref/ComputedRef（provide 时透传了原始 props）
   * 也可能是普通对象（Vue 3 模板解包后的值）
   * 统一用 'value' in obj 判断并正确取值 */
  const rawVf = ctx.visibleFields as any;
  const vf = (rawVf && 'value' in rawVf) ? rawVf.value : rawVf;

  return props.items.filter((item) => {
    /* 容器节点：通过 field 属性查 visibleFields 字典，支持联动显隐 */
    if (isContainer(item)) {
      const containerField = (item as any).field;
      if (containerField && vf && containerField in vf) {
        return vf[containerField] === true;
      }
      return item.hidden !== true;
    }

    /* 叶子字段按可见性过滤 */
    if (vf && item.field in vf) {
      return vf[item.field] === true;
    }
    return item.hidden !== true;
  });
});

/* ============================================================
 * 工具方法
 * ============================================================ */

function isContainer(item: SchemaFormItem): boolean {
  return item.type === SchemaNodeType.CONTAINER ||
    item.type === "container" ||
    (Array.isArray(item.children) && item.children.length > 0);
}

function getContainerType(item: SchemaFormItem): string {
  const rawType = item.containerType as string | undefined;
  if (!rawType) {
    return "group";
  }
  return rawType.toLowerCase();
}

function getItemKey(item: SchemaFormItem): string {
  if (isContainer(item)) {
    return item.label || ("container-" + Math.random().toString(36).slice(2, 8));
  }
  return item.field;
}

function isFieldDisabled(item: SchemaFormItem): boolean {
  return ctx.disabled === true || item.disabled === true;
}

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
</script>

<style scoped>
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
