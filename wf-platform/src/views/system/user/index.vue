<script setup lang="ts">
/**
 * 用户管理页面
 * 展示用户列表，支持搜索、添加、编辑、删除操作
 */
import { ref, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";

/** 页面加载状态 */
const loading = ref(false);

/** 用户列表数据 */
const userList = ref<Array<{
  id: number;
  username: string;
  nickname: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
}>>([]);

/** 搜索关键词 */
const searchKeyword = ref("");

/**
 * 加载用户列表数据
 * 调用 Mock 接口获取用户数据
 */
async function fetchUserList(): Promise<void> {
  loading.value = true;
  try {
    // TODO: 替换为真实接口 /api/system/user/list
    const mockData = [
      { id: 1, username: "admin", nickname: "管理员", email: "admin@example.com", role: "管理员", status: "正常", createdAt: "2024-01-01" },
      { id: 2, username: "zhangsan", nickname: "张三", email: "zhangsan@example.com", role: "普通用户", status: "正常", createdAt: "2024-02-15" },
      { id: 3, username: "lisi", nickname: "李四", email: "lisi@example.com", role: "普通用户", status: "禁用", createdAt: "2024-03-10" },
      { id: 4, username: "wangwu", nickname: "王五", email: "wangwu@example.com", role: "编辑者", status: "正常", createdAt: "2024-04-20" },
    ];
    userList.value = mockData;
  } catch (error) {
    console.error("[user-manage] 获取用户列表失败:", error);
    ElMessage.error("获取用户列表失败");
  } finally {
    loading.value = false;
  }
}

/**
 * 搜索过滤（前端模拟）
 */
function handleSearch(): void {
  console.log("[user-manage] 搜索关键词:", searchKeyword.value);
}

/**
 * 重置搜索
 */
function handleReset(): void {
  searchKeyword.value = "";
  fetchUserList();
}

/**
 * 删除用户确认
 */
async function handleDelete(user: typeof userList.value[0]): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户「${user.nickname}」吗？`,
      "删除确认",
      { confirmButtonText: "确定", cancelButtonText: "取消", type: "warning" },
    );
    userList.value = userList.value.filter((u) => u.id !== user.id);
    ElMessage.success(`已删除用户「${user.nickname}」`);
  } catch {
    // 用户取消删除
  }
}

onMounted(() => {
  fetchUserList();
});
</script>

<template>
  <div class="wf-user-manage">
    <!-- 页面标题 -->
    <header class="wf-user-manage__header">
      <h1 class="wf-user-manage__title">用户管理</h1>
      <p class="wf-user-manage__desc">管理系统中的所有用户账号</p>
    </header>

    <!-- 搜索栏 -->
    <section class="wf-user-manage__toolbar">
      <el-input
        v-model="searchKeyword"
        placeholder="搜索用户名/昵称/邮箱"
        clearable
        style="width: 300px"
        @keyup.enter="handleSearch"
      >
        <template #prefix>
          <span style="color: #c0c4cc;">🔍</span>
        </template>
      </el-input>
      <el-button type="primary" @click="handleSearch">搜索</el-button>
      <el-button @click="handleReset">重置</el-button>
    </section>

    <!-- 用户表格 -->
    <el-table :data="userList" v-loading="loading" border stripe style="width: 100%">
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="username" label="用户名" width="120" />
      <el-table-column prop="nickname" label="昵称" width="120" />
      <el-table-column prop="email" label="邮箱" min-width="180" />
      <el-table-column prop="role" label="角色" width="100">
        <template #default="{ row }">
          <el-tag :type="row.role === '管理员' ? 'danger' : row.role === '编辑者' ? 'warning' : 'info'" size="small">
            {{ row.role }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === '正常' ? 'success' : 'danger'" size="small" effect="dark">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间" width="120" />
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link>编辑</el-button>
          <el-button size="small" type="danger" link @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空状态 -->
    <el-empty v-if="!loading && !userList.length" description="暂无用户数据" />
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
</style>
