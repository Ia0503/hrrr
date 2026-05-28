<script setup lang="ts">
/**
 * 用户管理页面（仅管理员可见）
 *
 * 功能：
 *   - 展示所有已注册用户列表（含禁用用户）
 *   - 新增用户（弹窗表单）
 *   - 编辑用户（昵称、密码、角色）
 *   - 删除/禁用用户（软删除，禁止登录）
 *
 * 权限规则：
 *   - 不能删除自己
 *   - 不能修改自己的角色
 *   - 只能删除普通用户（不能删管理员）
 */

import { ref, reactive, onMounted } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import request from "@/utils/request";

/* ============================================================
 * 类型定义
 * ============================================================ */

interface UserInfo {
  id: number;
  username: string;
  nickname: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  createdAt: string;
}

/** 新建/编辑用户的表单数据 */
interface UserFormData {
  username?: string;
  nickname: string;
  password: string;
}

/* ============================================================
 * 页面状态
 * ============================================================ */

const loading = ref(false);
const userList = ref<UserInfo[]>([]);

/** 新建用户弹窗 */
const createDialogVisible = ref(false);
const creating = ref(false);
const createFormRef = ref<FormInstance>(); /** 新建表单的引用，用于手动触发验证 */

/** 编辑用户弹窗 */
const editDialogVisible = ref(false);
const editing = ref(false);

/** 新建表单 */
const createForm = reactive<UserFormData>({
  nickname: "",
  password: "",
});

/** 编辑表单 */
const editForm = reactive<UserFormData & { id: number; role: string }>({
  id: 0,
  nickname: "",
  password: "",
  role: "user",
});

/* ============================================================
 * 数据加载
 * ============================================================ */

/**
 * 获取完整用户列表（含 disabled 状态的用户）
 * 管理员页面需要看到所有用户，包括被禁用的
 */
async function fetchUserList(): Promise<void> {
  loading.value = true;
  try {
    /** 使用管理专用接口，返回全部用户（含禁用）*/
    const res = await request.get("/api/user/manage-list");
    userList.value = res as UserInfo[];
  } catch (error) {
    console.error("[user-manage] 获取用户列表失败:", error);
    ElMessage.error("获取用户列表失败");
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  fetchUserList();
});

/* ============================================================
 * 新增用户
 * ============================================================ */

/** 新建表单校验规则
 *
 * 设计说明：
 *   - 使用 "change" 触发器实现实时验证（用户输入时即时反馈）
 *   - 同时保留 "blur" 作为补充（失去焦点时确认验证）
 *   - 每个字段有独立的错误提示信息
 */
const createRules = reactive<FormRules>({
  username: [
    { required: true, message: "请输入用户名", trigger: ["blur", "change"] },
    { pattern: /^[a-z]{2,18}$/, message: "用户名需为 2~18 位纯小写英文字母", trigger: ["blur", "change"] },
  ],
  nickname: [
    { required: true, message: "请输入昵称", trigger: ["blur", "change"] },
    { min: 2, message: "昵称至少 2 个字符", trigger: ["blur", "change"] },
  ],
  password: [
    { required: true, message: "请输入密码", trigger: ["blur", "change"] },
    { pattern: /^\d{6,18}$/, message: "密码需为 6~18 位纯数字", trigger: ["blur", "change"] },
  ],
});

async function handleCreate(): Promise<void> {
  /* 使用 el-form 的 validate 方法进行表单验证
   *
   * 设计说明：
   *   - validate() 会根据 rules 规则自动校验所有字段
   *   - 验证通过时回调参数 valid 为 true
   *   - 验证失败时会自动在对应字段下方显示错误提示
   *   - 无需手动检查每个字段是否为空（由 rules 的 required 规则处理）
   */
  if (!createFormRef.value) return;

  try {
    await createFormRef.value.validate(); // 触发表单验证，失败会抛出异常
  } catch (validationError) {
    console.log("[user-manage] 表单验证未通过:", validationError);
    return; // 验证失败，终止提交流程
  }

  creating.value = true;
  try {
    await request.post("/api/user/create", {
      username: createForm.username,
      nickname: createForm.nickname,
      password: createForm.password,
    });
    ElMessage.success(`用户 "${createForm.nickname}" 创建成功`);
    createDialogVisible.value = false;
    resetCreateForm();
    fetchUserList();
  } catch (error: any) {
    const msg = error?.message || error?.response?.data?.message || "创建失败";
    ElMessage.error(msg);
  } finally {
    creating.value = false;
  }
}

function resetCreateForm(): void {
  /* 重置表单数据 */
  createForm.username = "";
  createForm.nickname = "";
  createForm.password = "";

  /* 重置表单验证状态（清除所有字段的错误提示和验证标记）
   *
   * 说明：
   *   - resetFields() 会将字段值重置为初始值
   *   - 同时清除所有验证状态和错误提示
   *   - 需要在 DOM 更新后调用（nextTick）确保表单已渲染
   */
  if (createFormRef.value) {
    createFormRef.value.resetFields();
    console.log("[user-manage] 新建表单已重置");
  }
}

/* ============================================================
 * 编辑用户
 * ============================================================ */

/**
 * 打开编辑弹窗并填充当前用户数据
 * @param user - 要编辑的用户对象
 */
function openEditDialog(user: UserInfo): void {
  editForm.id = user.id;
  editForm.nickname = user.nickname;
  editForm.password = ""; // 密码默认为空，不填则不改
  editForm.role = user.role;
  editDialogVisible.value = true;
}

async function handleEdit(): Promise<void> {
  if (!editForm.nickname) {
    ElMessage.warning("昵称不能为空");
    return;
  }

  editing.value = true;
  try {
    const payload: Record<string, unknown> = {
      id: editForm.id,
      nickname: editForm.nickname,
      role: editForm.role,
    };
    if (editForm.password) {
      payload.password = editForm.password;
    }

    await request.post("/api/user/update", payload);
    ElMessage.success("用户信息更新成功");
    editDialogVisible.value = false;
    fetchUserList();
  } catch (error: any) {
    const msg = error?.message || error?.response?.data?.message || "更新失败";
    ElMessage.error(msg);
  } finally {
    editing.value = false;
  }
}

/* ============================================================
 * 禁用/启用用户
 * ============================================================ */

/**
 * 禁用用户（软删除，禁止登录）
 */
async function handleDisable(user: UserInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要禁用用户「${user.nickname}」吗？禁用后该账户将无法登录。`,
      "禁用用户",
      { confirmButtonText: "确定禁用", cancelButtonText: "取消", type: "warning" },
    );

    await request.post("/api/user/delete", { id: user.id });
    ElMessage.success(`用户「${user.nickname}」已被禁用`);
    fetchUserList();
  } catch (error: unknown) {
    if ((error as Error)?.message !== "cancel") {
      console.error("[user-manage] 禁用用户失败:", error);
      ElMessage.error("操作失败");
    }
  }
}

/**
 * 启用用户（恢复为 active，可重新登录）
 */
async function handleEnable(user: UserInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要启用用户「${user.nickname}」吗？启用后该账户可以重新登录。`,
      "启用用户",
      { confirmButtonText: "确定启用", cancelButtonText: "取消", type: "info" },
    );

    await request.post("/api/user/update", { id: user.id, status: "active" });
    ElMessage.success(`用户「${user.nickname}」已恢复启用`);
    fetchUserList();
  } catch (error: unknown) {
    if ((error as Error)?.message !== "cancel") {
      console.error("[user-manage] 启用用户失败:", error);
      ElMessage.error("操作失败");
    }
  }
}

/**
 * 删除用户（硬删除，从系统中彻底移除）
 */
async function handleDelete(user: UserInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要永久删除用户「${user.nickname}」吗？此操作不可恢复，该用户的所有数据将被清除。`,
      "删除用户",
      { confirmButtonText: "确定删除", cancelButtonText: "取消", type: "error" },
    );

    await request.post("/api/user/delete", { id: user.id, hardDelete: true });
    ElMessage.success(`用户「${user.nickname}」已被永久删除`);
    fetchUserList();
  } catch (error: unknown) {
    if ((error as Error)?.message !== "cancel") {
      console.error("[user-manage] 删除用户失败:", error);
      ElMessage.error("操作失败");
    }
  }
}
</script>

<template>
  <div class="wf-user-manage">
    <!-- 页面标题 -->
    <header class="wf-user-manage__header">
      <h1 class="wf-user-manage__title">用户管理</h1>
      <p class="wf-user-manage__desc">管理系统中的所有注册用户</p>
    </header>

    <!-- 操作栏：新增按钮 -->
    <section class="wf-user-manage__toolbar">
      <el-button type="primary" @click="createDialogVisible = true">
        + 新增用户
      </el-button>
    </section>

    <!-- 用户表格 -->
    <el-table :data="userList" v-loading="loading" border stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" width="130">
        <template #default="{ row }">
          <code style="font-size: 13px;">{{ row.username }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="nickname" label="昵称" width="120" />
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'info'" size="small" effect="dark">
            {{ row.role === 'admin' ? "管理员" : "普通用户" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'active' ? 'success' : 'danger'" size="small" effect="dark">
            {{ row.status === 'active' ? "正常" : "已禁用" }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="170" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openEditDialog(row)">编辑</el-button>
          <!-- 活跃用户：显示禁用按钮 -->
          <el-button
            v-if="row.status === 'active'"
            size="small"
            type="danger"
            link
            @click="handleDisable(row)"
          >
            禁用
          </el-button>
          <!-- 已禁用用户：显示启用按钮 -->
          <el-button
            v-else
            size="small"
            type="success"
            link
            @click="handleEnable(row)"
          >
            启用
          </el-button>
          <!-- 删除用户（仅普通用户可删，不能删自己） -->
          <el-button
            v-if="row.role !== 'admin' && row.id !== currentUser?.id"
            size="small"
            type="danger"
            link
            @click="handleDelete(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空状态 -->
    <el-empty v-if="!loading && !userList.length" description="暂无用户数据" />

    <!-- ==================== 新增用户弹窗 ==================== -->
    <el-dialog
      v-model="createDialogVisible"
      title="新增用户"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <!--
        el-form 表单组件
        :model - 绑定表单数据对象（必须，用于 rules 验证时读取字段值）
        :rules - 绑定校验规则（定义在 createRules 中）
        ref - 表单引用（用于手动调用 validate/resetFields 方法）
        label-width - 标签宽度
        label-position - 标签位置（右对齐）
      -->
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-width="80px"
        label-position="right"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model.trim="createForm.username"
            placeholder="小写英文字母，2-18位"
            maxlength="18"
          />
          <div class="form-tip">仅支持纯小写字母 [a-z]，不含符号和数字</div>
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input
            v-model.trim="createForm.nickname"
            placeholder="显示名称，至少2个字符"
            maxlength="30"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="createForm.password"
            placeholder="纯数字，6-18位"
            maxlength="18"
            show-password
          />
          <div class="form-tip">仅支持纯数字</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取 消</el-button>
        <el-button type="primary" :loading="creating" @click="handleCreate">创建用户</el-button>
      </template>
    </el-dialog>

    <!-- ==================== 编辑用户弹窗 ==================== -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑用户"
      width="480px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="80px" label-position="right">
        <el-form-item label="用户名">
          <el-input :model-value="editForm.id ? '' : ''" disabled>
            <template #prefix><code>{{ userList.find(u => u.id === editForm.id)?.username }}</code></template>
          </el-input>
          <div class="form-tip">用户名不可修改</div>
        </el-form-item>
        <el-form-item label="昵称">
          <el-input v-model.trim="editForm.nickname" placeholder="至少2个字符" maxlength="30" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input
            v-model="editForm.password"
            placeholder="留空则不修改"
            maxlength="18"
            show-password
          />
          <div class="form-tip">留空表示不修改密码；填写则更新为新密码</div>
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="editForm.role" style="width: 100%">
            <el-option label="管理员" value="admin" />
            <el-option label="普通用户" value="user" />
          </el-select>
          <div class="form-tip">不能修改自己的角色</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取 消</el-button>
        <el-button type="primary" :loading="editing" @click="handleEdit">保存修改</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.wf-user-manage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wf-user-manage__header {
  padding-bottom: 12px;
  border-bottom: 1px solid #ebeef5;
}

.wf-user-manage__title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
}

.wf-user-manage__desc {
  margin: 0;
  font-size: 13px;
  color: #9ca3af;
}

.wf-user-manage__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-tip {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}

/* ============================================================
 * 响应式设计
 * ============================================================ */

/**
 * 平板/移动端适配（< 1024px）
 */
@media screen and (max-width: 1023px) {
  .wf-user-manage {
    gap: 12px;
  }

  .wf-user-manage__header {
    padding-bottom: 8px;
  }

  .wf-user-manage__title {
    font-size: 16px;
  }

  .wf-user-manage__desc {
    font-size: 12px;
  }

  /* 工具栏换行 */
  .wf-user-manage__toolbar {
    flex-wrap: wrap;
  }
}

/**
 * 手机竖屏（< 640px）
 */
@media screen and (max-width: 639px) {
  .wf-user-manage__title {
    font-size: 15px;
  }
}
</style>
