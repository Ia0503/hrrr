<template>
  <el-form
    ref="formRef"
    :model="formModel"
    :rules="computedRules"
    :label-width="labelWidth"
    :size="size"
    :label-position="labelPosition"
    :disabled="disabled"
    :hide-required-asterisk="hideRequiredAsterisk"
    :inline="inline"
    class="wf-schema-form"
    @validate="onValidate"
  >
    <!-- 遍历 schema 数组，渲染每个字段 -->
    <template v-for="schemaItem in visibleSchemas" :key="schemaItem.field">

      <!-- 如果有 slotName，使用插槽渲染 -->
      <slot
        v-if="schemaItem.slotName"
        :name="schemaItem.slotName"
        :schema="schemaItem"
        :model="formModel"
        :disabled="isFieldDisabled(schemaItem)"
      />

      <!-- 否则使用动态组件渲染 -->
      <el-form-item
        v-else
        :prop="schemaItem.field"
        :label="schemaItem.label"
        :required="schemaItem.required"
        :label-width="schemaItem.labelWidth || undefined"
        :class="[schemaItem.className, 'wf-schema-form__item']"
        :style="schemaItem.style"
      >
        <!-- 标签下方的提示文字 -->
        <template v-if="schemaItem.tips" #label>
          <div class="wf-schema-form__label-wrap">
            {{ schemaItem.label }}
            <span class="wf-schema-form__tips">{{ schemaItem.tips }}</span>
          </div>
        </template>

        <!-- ========== 选择类控件（带子选项）========== -->

        <!-- Select 下拉 -->
        <el-select
          v-if="schemaItem.component === 'select'"
          v-model="formModel[schemaItem.field]"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || `请选择${schemaItem.label}`"
          :clearable="true"
          :disabled="isFieldDisabled(schemaItem)"
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

        <!-- Radio 单选组 -->
        <el-radio-group
          v-else-if="schemaItem.component === 'radio'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
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

        <!-- Checkbox 多选组 -->
        <el-checkbox-group
          v-else-if="schemaItem.component === 'checkbox'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
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

        <!-- Cascader 级联 -->
        <el-cascader
          v-else-if="schemaItem.component === 'cascader'"
          v-model="formModel[schemaItem.field]"
          :options="(schemaItem.options as any[])"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || `请选择${schemaItem.label}`"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- ========== 输入类控件 ========== -->

        <!-- Input / Textarea -->
        <el-input
          v-else-if="['input', 'textarea'].includes(schemaItem.component)"
          v-model="formModel[schemaItem.field]"
          :type="schemaItem.component === 'textarea' ? 'textarea' : 'text'"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || `请输入${schemaItem.label}`"
          :disabled="isFieldDisabled(schemaItem)"
          :autosize="{ minRows: 2, maxRows: 6 }"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- InputNumber 数字 -->
        <el-input-number
          v-else-if="schemaItem.component === 'inputNumber'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Switch 开关 -->
        <el-switch
          v-else-if="schemaItem.component === 'switch'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Slider 滑块 -->
        <el-slider
          v-else-if="schemaItem.component === 'slider'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control wf-schema-form__control--full"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- TimePicker -->
        <el-time-picker
          v-else-if="schemaItem.component === 'timePicker'"
          v-model="formModel[schemaItem.field]"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || `选择时间`"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- DatePicker / DateRangePicker -->
        <el-date-picker
          v-else-if="['datePicker', 'dateRangePicker'].includes(schemaItem.component)"
          v-model="formModel[schemaItem.field]"
          :type="schemaItem.component === 'dateRangePicker' ? 'daterange' : 'date'"
          :placeholder="(schemaItem.componentProps?.placeholder as string) || `选择日期`"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- Rate 评分 -->
        <el-rate
          v-else-if="schemaItem.component === 'rate'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- ColorPicker -->
        <el-color-picker
          v-else-if="schemaItem.component === 'colorPicker'"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- ========== 兜底：通用动态组件 ========== -->
        <component
          v-else
          :is="getComponent(schemaItem.component)"
          v-model="formModel[schemaItem.field]"
          :disabled="isFieldDisabled(schemaItem)"
          v-bind="schemaItem.componentProps"
          class="wf-schema-form__control"
          @change="onFieldChange(schemaItem.field, $event)"
        />

        <!-- 字段描述（显示在控件下方） -->
        <div v-if="schemaItem.description" class="wf-schema-form__description">
          {{ schemaItem.description }}
        </div>
      </el-form-item>
    </template>
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type {
  SchemaFormItem,
  SchemaFormProps,
  SchemaFormEmits,
} from "./types";
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
} from "element-plus";
import { ComponentType } from "./types";

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

function getComponent(type: string): Component | null {
  const component = componentMap.get(type);
  if (component) {
    console.log(`[schema-form-config] 获取组件: ${type}`);
    return component;
  }
  console.warn(
    `[schema-form-config] [WARN] 未注册的组件类型: ${type}，将回退到 ElInput`
  );
  return ElInput;
}

function registerComponent(type: string, component: Component): void {
  componentMap.set(type, component);
  console.log(`[schema-form-config] 注册自定义组件: ${type}`);
}

function hasComponent(type: string): boolean {
  return componentMap.has(type);
}

function getRegisteredTypes(): string[] {
  return Array.from(componentMap.keys());
}

function resetToDefaults(): void {
  componentMap.clear();
  const defaultEntries: [string, Component][] = [
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
  ];
  for (const [key, value] of defaultEntries) {
    componentMap.set(key, value);
  }
  console.log("[schema-form-config] 已重置为内置组件映射");
}

const props = withDefaults(defineProps<SchemaFormProps>(), {
  labelWidth: "auto",
  size: "default",
  labelPosition: "right",
  disabled: false,
});

const emit = defineEmits<SchemaFormEmits>();

/** el-form 实例引用 */
const formRef = ref<any>(null);

/**
 * 响应式表单模型（computed 双向绑定）
 */
const formModel = computed({
  get: () => props.modelValue,
  set: (val: Record<string, unknown>) => emit("update:modelValue", val),
});

/**
 * 过滤出可见的 Schema 字段
 * 优先使用 visibleFields 字典（联动引擎写入），回退到 item.hidden 属性
 */
const visibleSchemas = computed(() => {
    const source = props.reactiveSchemas?.value || props.schema;
    const vf = props.visibleFields?.value;

    const result = source.filter((item) => {
      if (vf && item.field in vf) {
        return vf[item.field] === true;
      }
      return item.hidden !== true;
    });

    return result;
  });

/**
 * 从 schema 配置中构建 el-form 兼容的校验规则
 */
const computedRules = computed(() => {
  const rules: Record<string, any> = {};
  const source = props.reactiveSchemas?.value || props.schema;
  for (const item of source) {
    if (item.hidden !== true && item.rules && item.rules.length > 0) {
      rules[item.field] = item.rules;
    }
  }
  return rules;
});

/** 判断字段是否禁用 */
function isFieldDisabled(item: SchemaFormItem): boolean {
  return props.disabled === true || item.disabled === true;
}

/** 字段值变更回调 */
function onFieldChange(field: string, value: unknown): void {
  const oldValue = props.modelValue[field];
  console.log(
    `[schema-form] 字段变更: [${field}] ${JSON.stringify(oldValue)} → ${JSON.stringify(value)}`
  );
  emit("fieldChange", field, value, oldValue);
  const newModel = { ...props.modelValue, [field]: value };
  emit("update:modelValue", newModel);
}

/** 表单校验回调转发 */
function onValidate(prop: string, isValid: boolean, message: string): void {
  props.onValidate?.(prop, isValid, message);
}

defineExpose({
  formRef,
  async validate() {
    if (!formRef.value) {
      console.warn("[schema-form] validate 调用失败：formRef 尚未挂载");
      return Promise.reject(new Error("form instance not ready"));
    }
    return formRef.value.validate();
  },
  resetFields() {
    if (!formRef.value) {
      console.warn("[schema-form] resetFields 调用失败：formRef 尚未挂载");
      return;
    }
    formRef.value.resetFields();
    console.log("[schema-form] 表单已重置");
  },
  clearValidate(fields?: string[]) {
    if (!formRef.value) {
      console.warn("[schema-form] clearValidate 调用失败：formRef 尚未挂载");
      return;
    }
    formRef.value.clearValidate(fields);
  },
});
</script>

<style scoped>
/* ==================== 表单根容器 ==================== */
.wf-schema-form {
  --wf-form-gap: 20px;
}

/* ==================== 表单项 ==================== */
.wf-schema-form__item {
  margin-bottom: var(--wf-form-gap);
}

/* 最后一个表单项不需要底部间距 */
.wf-schema-form__item:last-child {
  margin-bottom: 0;
}

/* ==================== 标签区域 ==================== */
.wf-schema-form__label-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

/* 标签下方的提示文字 */
.wf-schema-form__tips {
  font-size: 12px;
  color: #909399;
  font-weight: 400;
  line-height: 1.4;
}

/* ==================== 控件通用样式 ==================== */
.wf-schema-form__control {
  width: 100%;
}

/* 占满整行的控件（slider 等） */
.wf-schema-form__control--full {
  width: 100%;
}

/* ==================== 字段描述 ==================== */
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

/* ==================== Element Plus 控件微调 ==================== */

/* 下拉框/级联/日期选择器 统一最小高度 */
.wf-schema-form :deep(.el-select),
.wf-schema-form :deep(.el-cascader),
.wf-schema-form :deep(.el-date-editor) {
  width: 100%;
}

/* 数字输入框宽度自适应 */
.wf-schema-form :deep(.el-input-number) {
  width: 100%;
}

/* 单选按钮组 / 多选按钮组 换行间距 */
.wf-schema-form :deep(.el-radio-group),
.wf-schema-form :deep(.el-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 评分组件对齐 */
.wf-schema-form :deep(.el-rate) {
  display: flex;
  align-items: center;
}
</style>
