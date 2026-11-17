<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { describeError } from '@/api/cloud'
import { dashboardStats, listDevices, listReceivables, type DashboardStats } from '@/api/data'
import type { DeviceOverview, ReceivableOverview } from '@/api/types'
import DueTag from '@/components/DueTag.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import ReplacementFormDialog from '@/components/ReplacementFormDialog.vue'
import { todayStr } from '@/lib/dates'
import { describeRemind, formatMoney } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()

const loading = ref(false)
const stats = ref<DashboardStats | null>(null)
const dueDevices = ref<DeviceOverview[]>([])
const dueTotal = ref(0)
const remind = ref<ReceivableOverview[]>([])
const remindTotal = ref(0)

const replacementDialog = ref(false)
const current = ref<DeviceOverview | null>(null)

async function load() {
  loading.value = true
  try {
    const [s, devices, receivables] = await Promise.all([
      dashboardStats(session.uid),
      listDevices({ page: 1, pageSize: 10, statuses: ['overdue', 'today', 'week'], sort: { field: 'next_due_on', order: 'asc' } }),
      listReceivables({ page: 1, pageSize: 8, status: 'due' }),
    ])
    stats.value = s
    dueDevices.value = devices.rows
    dueTotal.value = devices.total
    remind.value = receivables.rows
    remindTotal.value = receivables.total
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}

function openReplacement(row: DeviceOverview) {
  current.value = row
  replacementDialog.value = true
}

const cards = [
  { key: 'overdue', label: '已超期', tone: 'danger', to: '/devices?status=overdue' },
  { key: 'dueThisWeek', label: '7 天内到期', tone: 'warning', to: '/devices?status=today,week' },
  { key: 'unpaidDue', label: '应催款', tone: 'danger', to: '/payments' },
  { key: 'openWorkOrders', label: '我的待办工单', tone: 'primary', to: '/work-orders' },
  { key: 'devices', label: '设备总数', tone: 'info', to: '/devices' },
  { key: 'replacementsThisMonth', label: '本月换芯', tone: 'success', to: '/reports' },
] as const

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="page">
    <div class="greeting">
      <div>
        <h2>你好，{{ session.member?.username }}</h2>
        <span class="sub">今天是 {{ todayStr() }}（北京时间）</span>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="stats">
      <div v-for="c in cards" :key="c.key" class="stat" :class="`tone-${c.tone}`" @click="router.push(c.to)">
        <div class="stat-value">{{ stats ? stats[c.key] : '—' }}</div>
        <div class="stat-label">{{ c.label }}</div>
        <div v-if="c.key === 'replacementsThisMonth' && stats" class="stat-extra">收入 {{ formatMoney(stats.revenueThisMonth) }}</div>
      </div>
    </div>

    <div class="columns">
      <el-card shadow="never" class="col-main">
        <template #header>
          <div class="card-header">
            <span>需要换芯（已超期和 7 天内）</span>
            <el-button link type="primary" @click="router.push('/devices?status=overdue,today,week')">全部 {{ dueTotal }} 条 →</el-button>
          </div>
        </template>
        <el-empty v-if="!dueDevices.length" description="近期没有需要换芯的设备 🎉" :image-size="80" />
        <div v-for="d in dueDevices" :key="d.id" class="item">
          <div class="item-main">
            <router-link :to="`/customers/${d.client_id}`" class="link">{{ d.client_name }}</router-link>
            <div class="sub">
              {{ d.address || d.location || '—' }} · {{ d.contact_person || '联系人未填' }}
              <PhoneLinks :phone="d.phone" />
            </div>
          </div>
          <DueTag :days="d.days_until_due" :date="d.next_due_on" />
          <el-button size="small" type="primary" plain @click="openReplacement(d)">登记换芯</el-button>
        </div>
      </el-card>

      <el-card shadow="never" class="col-side">
        <template #header>
          <div class="card-header">
            <span>应催款</span>
            <el-button link type="primary" @click="router.push('/payments')">全部 {{ remindTotal }} 条 →</el-button>
          </div>
        </template>
        <el-empty v-if="!remind.length" description="没有需要催款的应收" :image-size="80" />
        <div v-for="r in remind" :key="r.id" class="item">
          <div class="item-main">
            <router-link :to="`/customers/${r.client_id}`" class="link">{{ r.client_name }}</router-link>
            <div class="sub">
              {{ r.title }} · {{ r.amount === null ? '金额未登记' : `欠 ${formatMoney(r.outstanding)}` }}
            </div>
          </div>
          <span class="danger small">{{ describeRemind(r.days_until_remind) }}</span>
        </div>
      </el-card>
    </div>

    <ReplacementFormDialog v-model="replacementDialog" :device="current" @saved="load" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.greeting {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h2 {
  margin: 0;
  font-size: 20px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}
.stat {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  border-top: 3px solid var(--tone);
  transition: box-shadow 0.2s;
}
.stat:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.tone-danger {
  --tone: var(--el-color-danger);
}
.tone-warning {
  --tone: var(--el-color-warning);
}
.tone-primary {
  --tone: var(--el-color-primary);
}
.tone-success {
  --tone: var(--el-color-success);
}
.tone-info {
  --tone: var(--el-color-info);
}
.stat-value {
  font-size: 28px;
  font-weight: 600;
  color: var(--tone);
}
.stat-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  margin-top: 4px;
}
.stat-extra {
  font-size: 12px;
  margin-top: 2px;
  color: var(--el-text-color-regular);
}
.columns {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
  align-items: start;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-extra-light);
}
.item:last-child {
  border-bottom: none;
}
.item-main {
  flex: 1;
  min-width: 0;
}
.link {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.danger {
  color: var(--el-color-danger);
}
.small {
  font-size: 12px;
  white-space: nowrap;
}
@media (max-width: 1100px) {
  .stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .columns {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 560px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
