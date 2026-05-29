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
    const isContainerNode =
      item.type === "container" ||
      item.type === "container" ||
      (item.children !== undefined && item.children !== null && item.children.length > 0);

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
      if (
        item.type === "container" ||
        item.type === "container" ||
        (item.children && item.children.length > 0)
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
