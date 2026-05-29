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
    <SchemaFormItemRenderer
      :items="visibleSchemas"
      @field-change="onFieldChange"
      @update:model-value="onModelValueUpdate"
    />
  </el-form>
</template>

<script setup lang="ts">
import { ref, computed, provide } from "vue";
import type {
  SchemaFormItem,
  SchemaFormProps,
  SchemaFormEmits,
} from "./types";
import { SchemaNodeType } from "./types";
import SchemaFormItemRenderer from "./SchemaFormItemRenderer.vue";

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

const SCHEMA_FORM_CONTEXT_KEY = "schema-form-context";

provide(SCHEMA_FORM_CONTEXT_KEY, {
  modelValue: computed(() => props.modelValue),
  disabled: props.disabled,
  size: props.size,
  labelWidth: props.labelWidth,
  labelPosition: props.labelPosition,
  hideRequiredAsterisk: props.hideRequiredAsterisk,
  /* 直接透传 props
   * 注意：由于 Vue 3 模板中 ref 会自动 .value 解包，
   * props.visibleFields 在此处可能是 Ref 也可能是已解包的普通对象。
   * 兼容处理放在下游（visibleSchemas computed 和 Renderer renderedItems）中 */
  visibleFields: props.visibleFields as any,
  reactiveSchemas: props.reactiveSchemas as any,
});

const formRef = ref<any>(null);

const formModel = computed({
  get: () => props.modelValue,
  set: (val: Record<string, unknown>) => emit("update:modelValue", val),
});

const visibleSchemas = computed((): SchemaFormItem[] => {
  const source = props.reactiveSchemas?.value || props.schema;
  /* Ref 兼容取值：Vue 3 模板中 ref 会自动解包为 .value，导致 props 可能是 Ref 或普通对象
   * 'value' in obj 判断是否为 Ref/ComputedRef，是则取 .value，否则直接使用 */
  const rawVf = props.visibleFields as any;
  const vf = (rawVf && 'value' in rawVf) ? rawVf.value : rawVf;

  return source.filter((item) => {
    /* 容器节点判断：仅以 type 字段为准（问题七修复：去掉 children 兜底条件） */
    const isContainerNode =
      item.type === SchemaNodeType.CONTAINER ||
      item.type === "container";

    /* 容器节点：通过 field 属性查 visibleFields 字典，支持联动显隐 */
    if (isContainerNode) {
      const containerField = (item as any).field;
      if (containerField && vf && containerField in vf) {
        return vf[containerField] === true;
      }
      /* 无 visibleFields 记录时回退到 hidden 属性 */
      return item.hidden !== true;
    }

    if (vf && item.field in vf) {
      return vf[item.field] === true;
    }
    return item.hidden !== true;
  });
});

const computedRules = computed(() => {
  const rules: Record<string, any> = {};
  const source = props.reactiveSchemas?.value || props.schema;

  function collectRules(items: SchemaFormItem[]): void {
    for (const item of items) {
      /* 容器节点判断：仅以 type 字段为准（问题七修复） */
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
 * el-form 实际使用的校验规则（问题三修复）
 *
 * 优先级：
 *   1. props.formRules — useSchemaForm 返回的动态规则（含联动 REQUIRED 增删）
 *   2. computedRules   — 组件内部从 schema 静态推导的兜底规则
 *
 * 传入 formRules 后，联动 REQUIRED 动作的动态增删才能被 el-form 感知
 */
const effectiveRules = computed(() => {
  if (props.formRules) {
    /* Ref 兼容取值 */
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
</script>

<style scoped>
.wf-schema-form {
  --wf-form-gap: 20px;
}
</style>
