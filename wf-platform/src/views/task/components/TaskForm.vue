<script setup lang="ts">
/**
 * @fileoverview 任务表单弹窗组件（Phase 5 业务演示页）
 *
 * 核心功能：
 * - 基于 SchemaForm 的 schema 驱动动态表单
 * - 新建 / 编辑双模式支持
 * - 表单校验与提交（含防重复点击）
 */

import { ref, watch } from "vue";
import { ElMessage } from "element-plus";

import type { TaskItem } from "@/stores/task";
import type { SchemaFormItem } from "@/components/SchemaForm/types";
import { ComponentType } from "@/components/SchemaForm/types";
import { useSchemaForm } from "@/composables/useSchemaForm";
import SchemaForm from "@/components/SchemaForm/SchemaForm.vue";

/* ============================================================
 * Props & Emits 定义
 * ============================================================ */

interface Props {
  /** 弹窗是否可见 */
  modelValue: boolean;
  /** 编辑模式：传入已有任务数据则为编辑，否则为新建 */
  taskData?: TaskItem | null;
}

const props = withDefaults(defineProps<Props>(), {
  taskData: null,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  submit: [data: Record<string, unknown>];
}>();

/* ============================================================
 * 提交防抖状态
 * ============================================================ */

/** 提交中标志位，防止重复点击 */
const submitting = ref(false);

/* ============================================================
 * 任务表单 Schema 定义
 * ============================================================ */

const taskFormSchema: SchemaFormItem[] = [
  {
    field: "title",
    label: "任务标题",
    component: ComponentType.INPUT,
    required: true,
    rules: [{ min: 2, max: 50, message: "标题长度应在 2 到 50 个字符之间", trigger: "blur" }],
    componentProps: { placeholder: "请输入任务标题", maxlength: 50, showWordLimit: true },
    tips: "简明扼要地描述任务内容",
  },
  {
    field: "taskType",
    label: "任务类型",
    component: ComponentType.SELECT,
    required: true,
    options: [
      { label: "功能需求", value: "feature" },
      { label: "缺陷 Bug", value: "bug" },
      { label: "优化改进", value: "improvement" },
      { label: "技术债务", value: "tech_debt" },
      { label: "文档编写", value: "doc" },
    ],
    componentProps: { placeholder: "请选择任务类型", clearable: false },
  },
  {
    field: "priority",
    label: "优先级",
    component: ComponentType.RADIO,
    required: true,
    options: [
      { label: "紧急", value: "urgent" },
      { label: "高", value: "high" },
      { label: "中", value: "medium" },
      { label: "低", value: "low" },
    ],
    componentProps: {},
  },
  {
    field: "assignee",
    label: "负责人",
    component: ComponentType.SELECT,
    required: true,
    options: [
      { label: "张三", value: "zhangsan" },
      { label: "李四", value: "lisi" },
      { label: "王五", value: "wangwu" },
      { label: "赵六", value: "zhaoliu" },
      { label: "钱七", value: "qianqi" },
    ],
    componentProps: { placeholder: "请选择负责人", filterable: true },
  },
  {
    field: "status",
    label: "初始状态",
    component: ComponentType.SELECT,
    required: true,
    options: [
      { label: "待处理", value: "todo" },
      { label: "进行中", value: "doing" },
    ],
    componentProps: { placeholder: "请选择初始状态" },
    defaultValue: "todo",
  },
  {
    field: "description",
    label: "任务描述",
    component: ComponentType.TEXTAREA,
    required: true,
    rules: [{ min: 10, message: "任务描述至少需要 10 个字符", trigger: "blur" }],
    componentProps: {
      placeholder: "请详细描述任务内容、验收标准等...",
      rows: 4,
      maxlength: 500,
      showWordLimit: true,
    },
  },
  {
    field: "tags",
    label: "标签",
    component: ComponentType.CHECKBOX,
    options: [
      { label: "前端开发", value: "前端开发" },
      { label: "后端开发", value: "后端开发" },
      { label: "UI设计", value: "UI设计" },
      { label: "数据库", value: "数据库" },
      { label: "API接口", value: "API接口" },
    ],
  },
  {
    field: "dueDate",
    label: "截止日期",
    component: ComponentType.DATE_PICKER,
    componentProps: { placeholder: "选择截止日期", format: "YYYY-MM-DD", valueFormat: "YYYY-MM-DD" },
  },
  {
    field: "estimatedHours",
    label: "预估工时(小时)",
    component: ComponentType.INPUT_NUMBER,
    componentProps: { placeholder: "预估工时", min: 0.5, max: 1000, step: 0.5, precision: 1 },
    defaultValue: 8,
  },
  {
    field: "complexity",
    label: "复杂度评分",
    component: ComponentType.RATE,
    componentProps: { max: 5, showText: true, texts: ["极简", "简单", "中等", "复杂", "极复杂"] },
    defaultValue: 3,
  },
];

/* ============================================================
 * 表单实例初始化
 * ============================================================ */

const {
  formModel,
  formSchemas,
  formRef,
  visibleFields,
  validate,
  resetFields,
  getFormData,
  triggerLinkages,
} = useSchemaForm({ schema: taskFormSchema });

/** 字段变更回调：驱动联动引擎重新评估规则 */
const handleFieldChange = (field: string, value: unknown) => {
  console.log(`[task-form] 字段 [${field}] 变更为 ${JSON.stringify(value)}，触发联动评估...`);
  triggerLinkages();
};

/* ============================================================
 * 弹窗可见性监听
 * ============================================================ */

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      if (props.taskData) {
        Object.assign(formModel.value, props.taskData);
        console.log("[task-form] 编辑模式，已填充任务数据:", props.taskData.title);
      } else {
        resetFields();
        console.log("[task-form] 新建模式，表单已重置");
      }
    }
  },
);

/* ============================================================
 * 提交处理（含防重复点击保护）
 * ============================================================ */

const handleSubmit = async () => {
  console.log("[task-form] 用户点击提交按钮");

  if (submitting.value) {
    console.warn("[task-form] 正在提交中，忽略重复点击");
    return;
  }

  submitting.value = true;

  try {
    const isValid = await validate();
    if (!isValid) {
      console.warn("[task-form] 表单校验未通过，阻止提交");
      return;
    }

    const formData = getFormData();

    /* 优先级为"紧急"时自动标记加急 */
    if (formData.priority === "urgent") {
      formData.isUrgent = true;
      console.log("[task-form] 优先级为紧急，自动设置 isUrgent = true");
    }

    console.log("[task-form] ✅ 表单提交数据:", JSON.stringify(formData, null, 2));

    emit("submit", formData);
    emit("update:modelValue", false);
  } finally {
    submitting.value = false;
  }
};

/** 关闭弹窗 */
const handleCancel = () => {
  console.log("[task-form] 用户取消操作");
  emit("update:modelValue", false);
};
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="taskData ? '编辑任务' : '新建任务'"
    width="720px"
    :close-on-click-modal="false"
    destroy-on-close
    class="wf-task-form-dialog"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 表单主体区域（可滚动） -->
    <div class="wf-task-form__body">
      <SchemaForm
        ref="formRef"
        :schema="taskFormSchema"
        :reactive-schemas="formSchemas"
        :visible-fields="visibleFields"
        v-model="formModel"
        label-width="96px"
        size="default"
        label-position="right"
        @field-change="handleFieldChange"
      />
    </div>

    <!-- 底部操作按钮 -->
    <template #footer>
      <div class="wf-task-form__footer">
        <el-button @click="handleCancel">取 消</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ taskData ? "保存修改" : "创建任务" }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* ==================== 弹窗整体样式 ==================== */
.wf-task-form-dialog {
  --wf-dialog-radius: 12px;
}

/* 覆盖 el-dialog 默认圆角 */
.wf-task-form-dialog :deep(.el-dialog) {
  border-radius: var(--wf-dialog-radius);
  overflow: hidden;
}

.wf-task-form-dialog :deep(.el-dialog__header) {
  padding: 16px 24px;
  margin: 0;
  border-bottom: 1px solid #ebeef5;
  background-color: #fafbfc;
}

.wf-task-form-dialog :deep(.el-dialog__title) {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}

.wf-task-form-dialog :deep(.el-dialog__body) {
  padding: 0;
}

.wf-task-form-dialog :deep(.el-dialog__footer) {
  padding: 12px 24px;
  border-top: 1px solid #ebeef5;
  background-color: #fafbfc;
}

/* ==================== 表单滚动区域 ==================== */
.wf-task-form__body {
  max-height: 60vh;
  padding: 20px 24px;
  overflow-y: auto;
}

/* 自定义滚动条 */
.wf-task-form__body::-webkit-scrollbar {
  width: 6px;
}

.wf-task-form__body::-webkit-scrollbar-thumb {
  background-color: #dcdfe6;
  border-radius: 3px;
}

.wf-task-form__body::-webkit-scrollbar-thumb:hover {
  background-color: #c0c4cc;
}

.wf-task-form__body::-webkit-scrollbar-track {
  background-color: transparent;
}

/* ==================== 底部按钮区域 ==================== */
.wf-task-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
