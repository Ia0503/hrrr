<script setup lang="ts">
/**
 * 任务表单弹窗组件
 *
 * 核心功能：
 * - 基于 SchemaForm 的 schema 驱动动态表单
 * - 新建 / 编辑双模式支持
 * - 负责人列表从用户 API 动态加载
 * - 表单校验与提交（含防重复点击）
 */

import { ref, watch, onMounted } from "vue";
import { ElMessage } from "element-plus";
import request from "@/utils/request";

import type { TaskItem } from "@/stores/task";
import type { SchemaFormItem } from "@/components/SchemaForm/types";
import { ComponentType, SchemaNodeType, ContainerType } from "@/components/SchemaForm/types";
import { useSchemaForm } from "@/composables/useSchemaForm";
import SchemaForm from "@/components/SchemaForm/SchemaForm.vue";

/* ============================================================
 * Props & Emits 定义
 * ============================================================ */

interface Props {
  modelValue: boolean;
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
 * 动态数据：负责人列表（从用户 API 获取）
 * ============================================================ */

/** 用户列表项结构 */
interface UserOption {
  id: number;
  username: string;
  nickname: string;
  role: string;
}

/** 已注册的用户列表（用于负责人下拉）*/
const userList = ref<UserOption[]>([]);

/** 是否正在加载用户列表 */
const loadingUsers = ref(false);

/**
 * 从后端获取已注册用户列表
 * 用于填充"负责人"下拉选项
 */
async function fetchUserList(): Promise<void> {
  loadingUsers.value = true;
  try {
    const res = await request.get("/api/user/list");
    userList.value = res as UserOption[];
    console.log(`[task-form] [INFO] 负责人列表加载完成，共 ${userList.value.length} 个用户`);

    /** 同步更新 schema 中负责人选项 */
    const assigneeField = taskFormSchema.find((f) => f.field === "assignee");
    if (assigneeField) {
      assigneeField.options = userList.value.map((u) => ({
        label: u.nickname,
        value: u.nickname,
      }));
      console.log(
        `[task-form] 负责人选项已更新:`,
        assigneeField.options.map((o) => o.label).join(", "),
      );
    }
  } catch (error) {
    console.error("[task-form] [ERROR] 获取用户列表失败:", error);
    ElMessage.warning("无法加载负责人列表，请刷新重试");
  } finally {
    loadingUsers.value = false;
  }
}

/* ============================================================
 * 提交防抖状态
 * ============================================================ */

const submitting = ref(false);

/* ============================================================
 * 任务表单 Schema 定义
 *
 * 注意：负责人选项初始为空数组，
 * 组件挂载后会通过 fetchUserList() 从 API 动态填充。
 * 其他固定选项（任务类型、优先级等）由前端定义。
 * ============================================================ */

const taskFormSchema: SchemaFormItem[] = [
  /* ========== 基础区域（始终可见）========== */
  {
    field: "title",
    label: "任务标题",
    component: ComponentType.INPUT,
    required: true,
    rules: [
      { required: true, message: "请输入任务标题", trigger: "blur" },
      { min: 2, max: 50, message: "标题长度应在 2 到 50 个字符之间", trigger: "blur" },
    ],
    componentProps: { placeholder: "请输入任务标题", maxlength: 50, showWordLimit: true },
    tips: "简明扼要地描述任务内容",
  },
  {
    field: "taskType",
    label: "任务类型",
    component: ComponentType.SELECT,
    required: true,
    rules: [{ required: true, message: "请选择任务类型", trigger: "change" }],
    options: [
      { label: "功能需求", value: "feature" },
      { label: "缺陷 Bug", value: "bug" },
      { label: "优化改进", value: "improvement" },
      { label: "技术债务", value: "tech_debt" },
      { label: "文档编写", value: "doc" },
    ],
    componentProps: { placeholder: "请选择任务类型", clearable: false },

    /* 联动规则：根据类型控制条件容器的显隐
     * 每种类型显示自己的容器，同时隐藏其余所有容器 */
    linkageRules: [
      /* === 功能需求：显示需求规格，隐藏其余3个 === */
      {
        id: "type-feature-show",
        condition: { watchField: "taskType", condition: "feature" as string },
        action: "VISIBLE" as string,
        targetField: "container-requirement",
        actionParams: true,
      },
      {
        id: "type-feature-hide-bug",
        condition: { watchField: "taskType", condition: "feature" as string },
        action: "VISIBLE" as string,
        targetField: "container-bugInfo",
        actionParams: false,
      },
      {
        id: "type-feature-hide-debt",
        condition: { watchField: "taskType", condition: "feature" as string },
        action: "VISIBLE" as string,
        targetField: "container-debt",
        actionParams: false,
      },
      {
        id: "type-feature-hide-doc",
        condition: { watchField: "taskType", condition: "feature" as string },
        action: "VISIBLE" as string,
        targetField: "container-doc",
        actionParams: false,
      },
      {
        id: "type-feature-hide-improvement",
        condition: { watchField: "taskType", condition: "feature" as string },
        action: "VISIBLE" as string,
        targetField: "container-improvement",
        actionParams: false,
      },

      /* === 缺陷 Bug：显示Bug详情，隐藏其余4个 === */
      {
        id: "type-bug-show",
        condition: { watchField: "taskType", condition: "bug" as string },
        action: "VISIBLE" as string,
        targetField: "container-bugInfo",
        actionParams: true,
      },
      {
        id: "type-bug-hide-requirement",
        condition: { watchField: "taskType", condition: "bug" as string },
        action: "VISIBLE" as string,
        targetField: "container-requirement",
        actionParams: false,
      },
      {
        id: "type-bug-hide-debt",
        condition: { watchField: "taskType", condition: "bug" as string },
        action: "VISIBLE" as string,
        targetField: "container-debt",
        actionParams: false,
      },
      {
        id: "type-bug-hide-doc",
        condition: { watchField: "taskType", condition: "bug" as string },
        action: "VISIBLE" as string,
        targetField: "container-doc",
        actionParams: false,
      },
      {
        id: "type-bug-hide-improvement",
        condition: { watchField: "taskType", condition: "bug" as string },
        action: "VISIBLE" as string,
        targetField: "container-improvement",
        actionParams: false,
      },

      /* === 技术债务：显示债务评估，隐藏其余4个 === */
      {
        id: "type-techdebt-show",
        condition: { watchField: "taskType", condition: "tech_debt" as string },
        action: "VISIBLE" as string,
        targetField: "container-debt",
        actionParams: true,
      },
      {
        id: "type-techdebt-hide-requirement",
        condition: { watchField: "taskType", condition: "tech_debt" as string },
        action: "VISIBLE" as string,
        targetField: "container-requirement",
        actionParams: false,
      },
      {
        id: "type-techdebt-hide-bug",
        condition: { watchField: "taskType", condition: "tech_debt" as string },
        action: "VISIBLE" as string,
        targetField: "container-bugInfo",
        actionParams: false,
      },
      {
        id: "type-techdebt-hide-doc",
        condition: { watchField: "taskType", condition: "tech_debt" as string },
        action: "VISIBLE" as string,
        targetField: "container-doc",
        actionParams: false,
      },
      {
        id: "type-techdebt-hide-improvement",
        condition: { watchField: "taskType", condition: "tech_debt" as string },
        action: "VISIBLE" as string,
        targetField: "container-improvement",
        actionParams: false,
      },

      /* === 文档编写：显示文档配置，隐藏其余4个 === */
      {
        id: "type-doc-show",
        condition: { watchField: "taskType", condition: "doc" as string },
        action: "VISIBLE" as string,
        targetField: "container-doc",
        actionParams: true,
      },
      {
        id: "type-doc-hide-requirement",
        condition: { watchField: "taskType", condition: "doc" as string },
        action: "VISIBLE" as string,
        targetField: "container-requirement",
        actionParams: false,
      },
      {
        id: "type-doc-hide-bug",
        condition: { watchField: "taskType", condition: "doc" as string },
        action: "VISIBLE" as string,
        targetField: "container-bugInfo",
        actionParams: false,
      },
      {
        id: "type-doc-hide-debt",
        condition: { watchField: "taskType", condition: "doc" as string },
        action: "VISIBLE" as string,
        targetField: "container-debt",
        actionParams: false,
      },
      {
        id: "type-doc-hide-improvement",
        condition: { watchField: "taskType", condition: "doc" as string },
        action: "VISIBLE" as string,
        targetField: "container-improvement",
        actionParams: false,
      },

      /* === 优化改进：显示改进方案，隐藏其余4个容器 === */
      {
        id: "type-improvement-show",
        condition: { watchField: "taskType", condition: "improvement" as string },
        action: "VISIBLE" as string,
        targetField: "container-improvement",
        actionParams: true,
      },
      {
        id: "type-improvement-hide-requirement",
        condition: { watchField: "taskType", condition: "improvement" as string },
        action: "VISIBLE" as string,
        targetField: "container-requirement",
        actionParams: false,
      },
      {
        id: "type-improvement-hide-bug",
        condition: { watchField: "taskType", condition: "improvement" as string },
        action: "VISIBLE" as string,
        targetField: "container-bugInfo",
        actionParams: false,
      },
      {
        id: "type-improvement-hide-debt",
        condition: { watchField: "taskType", condition: "improvement" as string },
        action: "VISIBLE" as string,
        targetField: "container-debt",
        actionParams: false,
      },
      {
        id: "type-improvement-hide-doc",
        condition: { watchField: "taskType", condition: "improvement" as string },
        action: "VISIBLE" as string,
        targetField: "container-doc",
        actionParams: false,
      },
    ],
  },
  {
    field: "priority",
    label: "优先级",
    component: ComponentType.RADIO,
    required: true,
    rules: [{ required: true, message: "请选择任务优先级", trigger: "change" }],
    options: [
      { label: "紧急", value: "urgent" },
      { label: "高", value: "high" },
      { label: "中", value: "medium" },
      { label: "低", value: "low" },
    ],
    componentProps: {},

    /* 联动：紧急任务强制要求截止日期 */
    linkageRules: [
      {
        id: "priority-urgent-dueDate-required",
        condition: { watchField: "priority", condition: "urgent" as string },
        action: "REQUIRED" as string,
        targetField: "dueDate",
        actionParams: true,
      },
    ],
  },
  {
    field: "assignee",
    label: "负责人",
    component: ComponentType.SELECT,
    required: true,
    rules: [{ required: true, message: "请选择任务负责人", trigger: "change" }],
    options: [],
    componentProps: { placeholder: "请选择负责人", filterable: true },
  },
  {
    field: "status",
    label: "初始状态",
    component: ComponentType.SELECT,
    required: true,
    rules: [{ required: true, message: "请选择任务初始状态", trigger: "change" }],
    options: [
      { label: "待处理", value: "todo" },
      { label: "进行中", value: "doing" },
    ],
    componentProps: { placeholder: "请选择初始状态" },
    defaultValue: "todo",
  },
  {
    field: "dueDate",
    label: "截止日期",
    component: ComponentType.DATE_PICKER,
    componentProps: { placeholder: "选择截止日期", format: "YYYY-MM-DD", valueFormat: "YYYY-MM-DD" },
  },

  /* ========== 详情区域（CARD 容器）========== */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.CARD,
    label: "详情信息",
    children: [
      {
        field: "description",
        label: "任务描述",
        component: ComponentType.TEXTAREA,
        required: true,
        rules: [
          { required: true, message: "请输入任务描述", trigger: "blur" },
          { min: 10, message: "任务描述至少需要 10 个字符", trigger: "blur" },
        ],
        componentProps: {
          placeholder: "请详细描述任务内容、验收标准等...",
          rows: 3,
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
    ],
  },

  /* ========== 条件区域：根据 taskType 联动显隐 ========== */

  /* --- 功能需求 → FIELDSET 需求规格（默认隐藏）--- */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.FIELDSET,
    field: "container-requirement",
    label: "需求规格",
    hidden: true,
    children: [
      {
        field: "requirement.source",
        label: "需求来源",
        component: ComponentType.SELECT,
        options: [
          { label: "内部需求", value: "内部需求" },
          { label: "客户反馈", value: "客户反馈" },
          { label: "竞品分析", value: "竞品分析" },
          { label: "合规要求", value: "合规要求" },
        ],
      },
      {
        field: "requirement.userStory",
        label: "用户故事",
        component: ComponentType.TEXTAREA,
        componentProps: { placeholder: "作为___角色，我希望___，以便___", rows: 2, maxlength: 200, showWordLimit: true },
      },
      {
        field: "requirement.acceptanceCriteria",
        label: "验收标准",
        component: ComponentType.TEXTAREA,
        componentProps: { placeholder: "满足哪些条件视为完成？", rows: 2, maxlength: 300, showWordLimit: true },
      },
      {
        field: "requirement.scope",
        label: "影响范围",
        component: ComponentType.SELECT,
        options: [
          { label: "全平台", value: "全平台" },
          { label: "仅 Web 端", value: "仅Web端" },
          { label: "仅 API", value: "仅API" },
          { label: "仅移动端", value: "仅移动端" },
        ],
      },
    ],
  },

  /* --- 缺陷 Bug → CARD Bug 详情（默认隐藏）--- */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.CARD,
    field: "container-bugInfo",
    label: "Bug 详情",
    hidden: true,
    children: [
      {
        field: "bugInfo.severity",
        label: "严重程度",
        component: ComponentType.RADIO,
        options: [
          { label: "致命", value: "critical" },
          { label: "严重", value: "major" },
          { label: "一般", value: "minor" },
          { label: "轻微", value: "trivial" },
        ],
      },
      {
        field: "bugInfo.frequency",
        label: "复现频率",
        component: ComponentType.RADIO,
        options: [
          { label: "偶尔", value: "occasional" },
          { label: "经常", value: "often" },
          { label: "必现", value: "always" },
        ],
      },
      {
        field: "bugInfo.environment",
        label: "环境信息",
        component: ComponentType.INPUT,
        componentProps: { placeholder: "浏览器/OS 版本号等", maxlength: 100, showWordLimit: true },
      },
      {
        field: "bugInfo.steps",
        label: "复现步骤",
        component: ComponentType.TEXTAREA,
        componentProps: { placeholder: "操作步骤1 → 步骤2 → ...", rows: 3, maxlength: 300, showWordLimit: true },
      },
    ],
  },

  /* --- 技术债务 → GROUP 债务评估（无额外 UI 包裹，默认隐藏）--- */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.GROUP,
    field: "container-debt",
    label: "债务评估",
    hidden: true,
    children: [
      {
        field: "debt.category",
        label: "债务类别",
        component: ComponentType.SELECT,
        options: [
          { label: "代码坏味道", value: "代码坏味道" },
          { label: "性能瓶颈", value: "性能瓶颈" },
          { label: "安全漏洞", value: "安全漏洞" },
          { label: "技术过时", value: "技术过时" },
        ],
      },
      {
        field: "debt.introducedVersion",
        label: "引入版本",
        component: ComponentType.INPUT,
        componentProps: { placeholder: "如 v1.2.0 或分支名", maxlength: 30 },
      },
      {
        field: "debt.affectedModules",
        label: "影响模块",
        component: ComponentType.CHECKBOX,
        options: [
          { label: "核心业务", value: "核心业务" },
          { label: "权限系统", value: "权限系统" },
          { label: "日志模块", value: "日志模块" },
          { label: "构建配置", value: "构建配置" },
          { label: "其他", value: "其他" },
        ],
      },
      {
        field: "debt.payoffDays",
        label: "还清周期(天)",
        component: ComponentType.INPUT_NUMBER,
        componentProps: { placeholder: "预估天数", min: 1, max: 365, step: 1 },
      },
    ],
  },

  /* --- 优化改进 → CARD 改进方案（默认隐藏）--- */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.CARD,
    field: "container-improvement",
    label: "改进方案",
    hidden: true,
    children: [
      {
        field: "improvement.category",
        label: "改进方向",
        component: ComponentType.SELECT,
        options: [
          { label: "性能优化", value: "performance" },
          { label: "用户体验", value: "ux" },
          { label: "代码质量", value: "code_quality" },
          { label: "安全加固", value: "security" },
          { label: "流程提效", value: "process" },
        ],
      },
      {
        field: "improvement.currentPain",
        label: "现状痛点",
        component: ComponentType.TEXTAREA,
        componentProps: { placeholder: "描述当前存在的问题或瓶颈...", rows: 2, maxlength: 300, showWordLimit: true },
      },
      {
        field: "improvement.expectedGain",
        label: "预期收益",
        component: ComponentType.TEXTAREA,
        componentProps: { placeholder: "期望达到的目标或改善效果...", rows: 2, maxlength: 300, showWordLimit: true },
      },
      {
        field: "improvement.impactScope",
        label: "影响范围",
        component: ComponentType.CHECKBOX,
        options: [
          { label: "前端", value: "前端" },
          { label: "后端", value: "后端" },
          { label: "数据库", value: "数据库" },
          { label: "基础设施", value: "基础设施" },
          { label: "运维", value: "运维" },
        ],
      },
    ],
  },

  /* --- 文档编写 → TABS 文档配置（默认隐藏）--- */
  {
    type: SchemaNodeType.CONTAINER,
    containerType: ContainerType.TABS,
    field: "container-doc",
    label: "文档配置",
    hidden: true,
    children: [
      /* TAB 1：基本信息 */
      {
        type: SchemaNodeType.CONTAINER,
        containerType: ContainerType.GROUP,
        label: "基本信息",
        children: [
          {
            field: "doc.docType",
            label: "文档类型",
            component: ComponentType.SELECT,
            options: [
              { label: "API 文档", value: "API文档" },
              { label: "使用手册", value: "使用手册" },
              { label: "技术方案", value: "技术方案" },
              { label: "发布说明", value: "发布说明" },
            ],
          },
          {
            field: "doc.targetAudience",
            label: "目标读者",
            component: ComponentType.CHECKBOX,
            options: [
              { label: "开发者", value: "开发者" },
              { label: "运维人员", value: "运维人员" },
              { label: "产品经理", value: "产品经理" },
              { label: "客户用户", value: "客户用户" },
            ],
          },
        ],
      },
      /* TAB 2：内容规划 */
      {
        type: SchemaNodeType.CONTAINER,
        containerType: ContainerType.GROUP,
        label: "内容规划",
        children: [
          {
            field: "doc.wordCountTarget",
            label: "字数目标",
            component: ComponentType.INPUT_NUMBER,
            componentProps: { placeholder: "预计字数", min: 100, max: 100000, step: 500 },
          },
          {
            field: "doc.publishChannel",
            label: "发布渠道",
            component: ComponentType.SELECT,
            options: [
              { label: "内部 Wiki", value: "内部Wiki" },
              { label: "GitHub Pages", value: "GitHub Pages" },
              { label: "官网文档站", value: "官网" },
              { label: "NPM README", value: "NPM" },
            ],
          },
        ],
      },
    ],
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
 * 弹窗可见性监听 + 用户列表预加载
 * ============================================================ */

/** 首次挂载时预加载用户列表 */
onMounted(() => {
  fetchUserList();
});

watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      /** 每次打开弹窗时刷新用户列表（防止新建用户后选项不更新）*/
      fetchUserList();

      if (props.taskData) {
        /**
         * 编辑模式：按 schema 字段名精准映射任务数据到表单
         *
         * 【嵌套路径支持】
         * - 扁平字段（如 title, priority）：直接从 taskData 取值
         * - 路径字段（如 bugInfo.severity, requirement.source）：沿路径逐层深入取值
         * - 容器节点（如 container-bugInfo）：跳过，无实际数据
         */
        const taskData = props.taskData;

        console.log("[task-form] 编辑模式，开始填充任务数据:", taskData.title);

        /**
         * 递归收集 schema 树中所有叶子字段的 field 名（含嵌套路径）
         * @param items - 当前层级的 schema 数组
         * @param fields - 累积的字段名数组
         */
        function collectFields(items: SchemaFormItem[], fields: string[]): void {
          for (const item of items) {
            const isContainer =
              item.type === SchemaNodeType.CONTAINER ||
              item.type === "container" ||
              (Array.isArray(item.children) && item.children.length > 0);

            if (isContainer && Array.isArray(item.children)) {
              collectFields(item.children, fields);
            } else if (item.field) {
              fields.push(item.field);
            }
          }
        }

        const schemaFields: string[] = [];
        collectFields(taskFormSchema, schemaFields);
        console.log("[task-form] Schema 字段列表:", schemaFields.join(", "));

        /* 遍历每个叶子字段，从任务数据中提取对应值（支持嵌套路径）*/
        for (const field of schemaFields) {
          /* 沿点分路径逐层取值：bugInfo.severity → taskData.bugInfo?.severity */
          const pathParts = field.split(".");
          let current: any = taskData;
          let found = true;

          for (const part of pathParts) {
            if (current && typeof current === "object" && part in current) {
              current = current[part];
            } else {
              found = false;
              break;
            }
          }

          if (found && current !== undefined) {
            formModel.value[field] = current;
            console.log(`[task-form]   [INFO] 字段 [${field}] =`, JSON.stringify(current));
          } else {
            console.log(`[task-form]   [WARN] 字段 [${field}] 在任务数据中不存在，保留默认值`);
          }
        }

        console.log("[task-form] [INFO] 编辑模式数据填充完成");

        /* 编辑模式：数据填充完成后主动触发联动评估
         * 使条件容器根据当前 taskType 值正确显隐（如 Bug 类型显示 Bug 详情卡片）*/
        triggerLinkages();
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

    console.log("[task-form] [INFO] 表单提交数据:", JSON.stringify(formData, null, 2));

    /**
     * 编辑模式：将任务 ID 注入提交数据
     *
     * 【设计要点】
     * - 新建模式：id 由后端生成，不需要传
     * - 编辑模式：必须携带 id 字段，否则后端不知道更新哪条记录
     * - 使用展开运算符合并，避免直接修改 formData 原对象
     */
    if (props.taskData?.id) {
      formData.id = props.taskData.id;
      console.log("[task-form] 编辑模式，已注入任务 ID:", formData.id);
    }

    emit("submit", formData);
    emit("update:modelValue", false);
  } finally {
    submitting.value = false;
  }
};

/** 关闭弹窗（取消按钮）：重置表单状态到初始值 */
const handleCancel = () => {
  console.log("[task-form] 用户取消操作，重置表单");
  resetFields();
  emit("update:modelValue", false);
};

/**
 * el-dialog 关闭事件处理（统一入口）
 *
 * 覆盖所有关闭场景：
 *   - 点击取消按钮 → handleCancel() 已调用 resetFields()
 *   - 点击右上角 X / 按 ESC / 点击遮罩层（close-on-click-modal=false 时不会触发）
 *   - destroy-on-close 销毁 DOM 后重建时
 *
 * 统一在此处确保 formModel 被清空，避免编辑模式数据残留在新建任务中
 */
const handleDialogClose = () => {
  console.log("[task-form] dialog @close 触发，强制重置表单");
  resetFields();
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
    @close="handleDialogClose"
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
.wf-task-form-dialog {
  --wf-dialog-radius: 12px;
}

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

.wf-task-form__body {
  max-height: 60vh;
  padding: 20px 24px;
  overflow-y: auto;
}

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

.wf-task-form__footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
