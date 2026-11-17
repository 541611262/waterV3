<script setup lang="ts">
import { Calendar, Location, Phone, Plus, Refresh, Search, User } from '@element-plus/icons-vue'
import { refDebounced, useMediaQuery } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { describeError } from '@/api/cloud'
import { listWorkOrders, updateWorkOrder, type WorkOrderRow } from '@/api/data'
import type { WorkOrder, WorkOrderStatus } from '@/api/types'
import CompleteWorkOrderDialog from '@/components/CompleteWorkOrderDialog.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import WorkOrderFormDialog from '@/components/WorkOrderFormDialog.vue'
import { usePagedList } from '@/composables/usePagedList'
import { daysUntil, formatBeijingDateTime, todayStr } from '@/lib/dates'
import { WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const isMobile = useMediaQuery('(max-width: 768px)')

type Tab = 'mine' | 'open' | 'done' | 'cancelled' | 'all'
const TABS: { key: Tab; label: string; statuses?: WorkOrderStatus[] }[] = [
  { key: 'mine', label: '我的待办', statuses: ['pending', 'in_progress'] },
  { key: 'open', label: '全部未完成', statuses: ['pending', 'in_progress'] },
  { key: 'done', label: '已完成', statuses: ['done'] },
  { key: 'cancelled', label: '已取消', statuses: ['cancelled'] },
  { key: 'all', label: '全部' },
]
const tab = ref<Tab>((route.query.tab as Tab) || 'mine')
const keyword = ref('')
const keywordDebounced = refDebounced(keyword, 300)
const assigneeId = ref('')

const list = usePagedList<WorkOrderRow>(
  (q) => {
    const t = TABS.find((x) => x.key === tab.value)!
    return listWorkOrders({
      ...q,
      keyword: keywordDebounced.value,
      statuses: t.statuses,
      assigneeId: tab.value === 'mine' ? session.uid : assigneeId.value || undefined,
      sort: q.sort ?? (tab.value === 'done' || tab.value === 'all' ? { field: 'updated_at', order: 'desc' } : null),
    })
  },
  { watchSources: [tab, keywordDebounced, assigneeId] },
)

watch(tab, () => (assigneeId.value = ''))

const formDialog = ref(false)
const editing = ref<WorkOrder | null>(null)
const completeDialog = ref(false)
const completing = ref<WorkOrderRow | null>(null)

const canManage = (o: WorkOrderRow) => session.isAdmin || o.clients?.owner_id === session.uid
const canWork = (o: WorkOrderRow) => canManage(o) || o.assignee_id === session.uid

function create() {
  editing.value = null
  formDialog.value = true
}

function edit(o: WorkOrderRow) {
  editing.value = o
  formDialog.value = true
}

function complete(o: WorkOrderRow) {
  completing.value = o
  completeDialog.value = true
}

async function setStatus(o: WorkOrderRow, status: WorkOrderStatus, confirmText?: string) {
  if (confirmText) {
    try {
      await ElMessageBox.confirm(confirmText, `工单 #${o.order_no}`, { type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消' })
    } catch {
      return
    }
  }
  try {
    await updateWorkOrder(o.id, o.version, { status })
    ElMessage.success(`工单 #${o.order_no}：${WORK_ORDER_STATUSES[status].label}`)
    await list.load()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

function scheduleText(o: WorkOrderRow) {
  if (!o.scheduled_on) return '未预约'
  const d = daysUntil(o.scheduled_on, todayStr())
  if (o.status === 'done' || o.status === 'cancelled') return o.scheduled_on
  if (d === null) return o.scheduled_on
  if (d < 0) return `${o.scheduled_on}（已过 ${-d} 天）`
  if (d === 0) return `${o.scheduled_on}（今天）`
  if (d === 1) return `${o.scheduled_on}（明天）`
  return o.scheduled_on
}
const isLate = (o: WorkOrderRow) =>
  Boolean(o.scheduled_on) && (o.status === 'pending' || o.status === 'in_progress') && (daysUntil(o.scheduled_on!, todayStr()) ?? 0) < 0

const emptyText = computed(() => (tab.value === 'mine' ? '没有指派给你的待办工单' : '没有工单'))

onMounted(() => void list.load())
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="toolbar">
      <el-tabs v-model="tab" class="tabs">
        <el-tab-pane v-for="t in TABS" :key="t.key" :label="t.label" :name="t.key" />
      </el-tabs>
      <div class="filter-row">
        <el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索标题、说明、处理结果" class="kw" />
        <el-select v-if="tab !== 'mine'" v-model="assigneeId" clearable filterable placeholder="指派给" class="sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <div class="spacer" />
        <el-button :icon="Refresh" @click="list.load()" />
        <el-button type="primary" :icon="Plus" @click="create">新建工单</el-button>
      </div>
    </el-card>

    <div v-loading="list.loading.value" class="orders">
      <el-empty v-if="!list.rows.value.length && !list.loading.value" :description="emptyText">
        <p class="text-muted hint">在「装机记录」中勾选到期的设备，点「批量派单」可以一次生成多张工单。</p>
      </el-empty>
      <article v-for="o in list.rows.value" :key="o.id" class="order" :class="[`status-${o.status}`, { late: isLate(o) }]">
        <header class="order-head">
          <span class="order-no num">#{{ o.order_no }}</span>
          <el-tag size="small" effect="plain">{{ WORK_ORDER_TYPES[o.type] }}</el-tag>
          <el-tag size="small" :type="WORK_ORDER_STATUSES[o.status].tag" effect="light">{{ WORK_ORDER_STATUSES[o.status].label }}</el-tag>
          <span v-if="isLate(o)" class="late-tag">已过预约日期</span>
        </header>
        <h3 class="order-title">{{ o.title }}</h3>
        <router-link :to="`/customers/${o.client_id}`" class="order-client">{{ o.clients?.name ?? '（客户不可见）' }}</router-link>
        <ul class="order-meta">
          <li v-if="o.devices">
            <el-icon><Location /></el-icon>
            <span>{{ o.devices.address || o.devices.location || '—' }}<template v-if="o.devices.model"> · {{ o.devices.model }}</template></span>
          </li>
          <li v-if="o.devices?.contact_person || o.devices?.phone">
            <el-icon><Phone /></el-icon>
            <span>{{ o.devices?.contact_person }}</span>
            <PhoneLinks :phone="o.devices?.phone" />
          </li>
          <li>
            <el-icon><Calendar /></el-icon>
            <span :class="{ 'text-danger': isLate(o) }">{{ scheduleText(o) }}</span>
          </li>
          <li>
            <el-icon><User /></el-icon>
            <span>{{ o.assignee_id ? session.memberName(o.assignee_id) || '—' : '未指派' }}</span>
          </li>
        </ul>
        <p v-if="o.description" class="order-desc">{{ o.description }}</p>
        <p v-if="o.status === 'done'" class="order-result">
          ✅ {{ o.result || '已完成' }}
          <span class="text-muted">· {{ session.memberName(o.completed_by) || '' }} {{ o.completed_at ? formatBeijingDateTime(o.completed_at) : '' }}</span>
        </p>
        <footer class="order-actions">
          <template v-if="o.status === 'pending' || o.status === 'in_progress'">
            <el-button v-if="canWork(o)" type="primary" size="small" round @click="complete(o)">完成</el-button>
            <el-button v-if="o.status === 'pending' && canWork(o)" size="small" round @click="setStatus(o, 'in_progress')">开始处理</el-button>
            <el-button v-if="canManage(o)" size="small" round @click="edit(o)">编辑 / 改派</el-button>
            <el-button v-if="canManage(o)" size="small" link type="danger" @click="setStatus(o, 'cancelled', '取消这张工单？被指派人将不再看到这个客户。')">取消</el-button>
          </template>
          <el-button v-else-if="canManage(o)" size="small" round @click="setStatus(o, 'pending', '重新打开这张工单？')">重新打开</el-button>
        </footer>
      </article>
    </div>

    <el-pagination
      v-if="list.total.value > list.pageSize.value"
      v-model:current-page="list.page.value"
      v-model:page-size="list.pageSize.value"
      :total="list.total.value"
      :layout="isMobile ? 'prev, pager, next' : 'total, prev, pager, next'"
      class="pager"
    />

    <WorkOrderFormDialog v-model="formDialog" :order="editing" @saved="list.load()" />
    <CompleteWorkOrderDialog v-model="completeDialog" :order="completing" @done="list.load()" />
  </div>
</template>

<style scoped>
.toolbar :deep(.el-card__body) {
  padding-top: 6px;
}
.tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}
.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.kw {
  width: 280px;
  max-width: 100%;
}
.sel {
  width: 140px;
}
.spacer {
  flex: 1;
}
.orders {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 14px;
  min-height: 120px;
}
.orders > .el-empty {
  grid-column: 1 / -1;
}
.hint {
  font-size: 13px;
  margin: 0;
}
.order {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: var(--app-radius);
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  box-shadow: var(--app-shadow-sm);
  position: relative;
  overflow: hidden;
  transition:
    box-shadow 0.15s,
    transform 0.15s;
}
.order:hover {
  box-shadow: var(--app-shadow-md);
}
.order::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--tone-warning);
}
.order.status-in_progress::before {
  background: var(--tone-primary);
}
.order.status-done::before {
  background: var(--tone-success);
}
.order.status-cancelled::before {
  background: var(--tone-info);
}
.order.late::before {
  background: var(--tone-danger);
}
.order.status-cancelled {
  opacity: 0.7;
}
.order-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.order-no {
  font-weight: 700;
  color: var(--app-text-3);
  margin-right: 2px;
}
.late-tag {
  font-size: 12px;
  font-weight: 600;
  color: var(--tone-danger);
  margin-left: auto;
}
.order-title {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 650;
}
.order-client {
  font-size: 13px;
  font-weight: 500;
  color: var(--brand-600);
  text-decoration: none;
  align-self: flex-start;
}
.order-meta {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--app-text-2);
}
.order-meta li {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.order-meta .el-icon {
  color: var(--app-text-3);
}
.order-desc,
.order-result {
  margin: 0;
  font-size: 13px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--app-surface-muted);
  white-space: pre-wrap;
}
.order-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: auto;
  padding-top: 4px;
}
.order-actions .el-button + .el-button {
  margin-left: 0;
}
.pager {
  justify-content: center;
}
@media (max-width: 768px) {
  .kw,
  .sel {
    width: 100%;
  }
  .orders {
    grid-template-columns: 1fr;
  }
}
</style>
