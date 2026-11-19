<script setup lang="ts">
// 成员管理（仅管理员）：查看成员、调整角色。新建账号 / 重置密码在云开发控制台的"身份认证 → 用户管理"中操作。
import { ElMessage, ElMessageBox } from 'element-plus'
import { useMediaQuery } from '@vueuse/core'
import { onMounted, ref } from 'vue'
import { listMembers, setMemberRole } from '@/api/auth'
import { describeError } from '@/api/cloud'
import type { Member } from '@/api/types'
import { appConfig } from '@/config'
import { formatBeijingDateTime } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const members = ref<(Member & { created_at: string })[]>([])
const loading = ref(false)
const isMobile = useMediaQuery('(max-width: 600px)')

async function load() {
  loading.value = true
  try {
    members.value = await listMembers()
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}

async function toggleRole(m: Member) {
  const next = m.role === 'admin' ? 'member' : 'admin'
  const text =
    next === 'admin'
      ? `把「${m.username}」设为管理员？管理员可以查看、修改和彻底删除所有人的数据。`
      : `取消「${m.username}」的管理员权限？之后只能看到自己负责的客户。`
  try {
    await ElMessageBox.confirm(text, '调整角色', { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await setMemberRole(m.uid, next)
    ElMessage.success('角色已更新，对方重新登录后生效')
    await load()
    await session.refreshDirectory()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

onMounted(load)
</script>

<template>
  <el-card shadow="never">
    <el-alert type="info" :closable="false" class="tip">
      <template #title>
        新建账号、重置密码、停用账号请在
        <a :href="`https://tcb.cloud.tencent.com/dev?envId=${appConfig.cloudbaseEnv}#/identity/user-management`" target="_blank" rel="noopener">
          云开发控制台 → 身份认证 → 用户管理
        </a>
        中操作（新建时用户类型选「外部用户」，不受套餐人数限制）；新账号第一次登录后会自动出现在这里，默认为普通成员。
      </template>
    </el-alert>
    <!-- 手机：卡片列表 -->
    <div v-if="isMobile" v-loading="loading" class="cards">
      <el-empty v-if="!members.length && !loading" description="还没有成员" />
      <div v-for="m in members" :key="m.uid" class="member">
        <div class="member-main">
          <div class="member-name">
            {{ m.username }}
            <el-tag size="small" :type="m.role === 'admin' ? 'danger' : 'info'">{{ m.role === 'admin' ? '管理员' : '普通成员' }}</el-tag>
          </div>
          <div class="sub">加入于 {{ formatBeijingDateTime(m.created_at) }}</div>
        </div>
        <span v-if="m.uid === session.uid" class="sub">（你自己）</span>
        <el-button v-else size="small" round @click="toggleRole(m)">
          {{ m.role === 'admin' ? '取消管理员' : '设为管理员' }}
        </el-button>
      </div>
    </div>
    <el-table v-else v-loading="loading" :data="members" empty-text="还没有成员">
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column label="角色" width="120">
        <template #default="{ row }">
          <el-tag :type="row.role === 'admin' ? 'danger' : 'info'">{{ row.role === 'admin' ? '管理员' : '普通成员' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="加入时间" width="170">
        <template #default="{ row }">{{ formatBeijingDateTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <span v-if="row.uid === session.uid" class="sub">（你自己）</span>
          <el-button v-else link type="primary" @click="toggleRole(row as Member)">
            {{ row.role === 'admin' ? '取消管理员' : '设为管理员' }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<style scoped>
.tip {
  margin-bottom: 12px;
}
.member {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--app-border);
}
.member:last-child {
  border-bottom: none;
}
.member-main {
  flex: 1;
  min-width: 0;
}
.member-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
