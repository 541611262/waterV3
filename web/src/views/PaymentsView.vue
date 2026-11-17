<script setup lang="ts">
import { Bell, Coin, Plus, Refresh, Search, Tickets, Wallet } from '@element-plus/icons-vue'
import { refDebounced, useMediaQuery } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { describeError } from '@/api/cloud'
import { listReceivables, receivableSummary, updateReceivable, type ReceivableQuery, type ReceivableSummary } from '@/api/data'
import type { ReceivableOverview } from '@/api/types'
import FollowUpFormDialog from '@/components/FollowUpFormDialog.vue'
import PaymentDialog from '@/components/PaymentDialog.vue'
import ReceivableFormDialog from '@/components/ReceivableFormDialog.vue'
import StatCard from '@/components/StatCard.vue'
import { usePagedList } from '@/composables/usePagedList'
import { describeRemind, formatMoney } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const isMobile = useMediaQuery('(max-width: 768px)')

type Status = NonNullable<ReceivableQuery['status']>
const TABS: { key: Status; label: string }[] = [
  { key: 'due', label: '应催款' },
  { key: 'open', label: '未结清' },
  { key: 'settled', label: '已结清' },
  { key: 'all', label: '全部' },
]
const status = ref<Status>((route.query.status as Status) || 'due')
const keyword = ref('')
const keywordDebounced = refDebounced(keyword, 300)
const ownerId = ref('')
const summary = ref<ReceivableSummary | null>(null)

const list = usePagedList<ReceivableOverview>(
  (q) => listReceivables({ ...q, status: status.value, keyword: keywordDebounced.value, ownerId: ownerId.value || undefined }),
  { watchSources: [status, keywordDebounced, ownerId] },
)

async function refresh() {
  await Promise.all([list.load(), receivableSummary().then((s) => (summary.value = s)).catch(() => undefined)])
}

const formDialog = ref(false)
const editing = ref<ReceivableOverview | null>(null)
const paymentDialog = ref(false)
const followDialog = ref(false)
const current = ref<ReceivableOverview | null>(null)

function create() {
  editing.value = null
  formDialog.value = true
}
function edit(r: ReceivableOverview) {
  editing.value = r
  formDialog.value = true
}
function pay(r: ReceivableOverview) {
  current.value = r
  paymentDialog.value = true
}
function remind(r: ReceivableOverview) {
  current.value = r
  followDialog.value = true
}

async function close(r: ReceivableOverview) {
  try {
    await ElMessageBox.confirm(
      `把「${r.client_name} · ${r.title}」标记为已结清？${Number(r.outstanding) > 0 ? `仍有 ${formatMoney(r.outstanding)} 未收，结清后不再提醒催款。` : ''}`,
      '结清应收款',
      { type: 'warning', confirmButtonText: '结清', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await updateReceivable(r.id, r.version, { closed_at: new Date().toISOString() })
    ElMessage.success('已结清')
    await refresh()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

async function reopen(r: ReceivableOverview) {
  try {
    await updateReceivable(r.id, r.version, { closed_at: null })
    ElMessage.success('已重新打开')
    await refresh()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

const progress = (r: ReceivableOverview) =>
  r.amount === null || !Number(r.amount) ? 0 : Math.min(100, Math.round((Number(r.paid_amount) / Number(r.amount)) * 100))

onMounted(refresh)
</script>

<template>
  <div class="page">
    <div class="stats">
      <StatCard label="应催款" :value="summary?.dueCount ?? '—'" :icon="Bell" tone="danger" hint="已到催款日期" />
      <StatCard label="未结清" :value="summary?.openCount ?? '—'" :icon="Tickets" tone="warning" :hint="summary?.unknownAmount ? `其中 ${summary.unknownAmount} 笔金额未登记` : '笔应收款'" />
      <StatCard label="未收金额" :value="summary ? formatMoney(summary.outstanding) : '—'" :icon="Wallet" tone="violet" hint="已登记金额部分" />
      <StatCard label="本月已收" :value="summary ? formatMoney(summary.collectedThisMonth) : '—'" :icon="Coin" tone="success" hint="按收款日期统计" />
    </div>

    <el-card shadow="never" class="toolbar">
      <el-tabs v-model="status">
        <el-tab-pane v-for="t in TABS" :key="t.key" :label="t.label" :name="t.key" />
      </el-tabs>
      <div class="filter-row">
        <el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索客户、收款项目、备注" class="kw" />
        <el-select v-if="session.isAdmin" v-model="ownerId" clearable placeholder="负责人" class="sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <div class="spacer" />
        <el-button :icon="Refresh" @click="refresh" />
        <el-button type="primary" :icon="Plus" @click="create">新建应收</el-button>
      </div>
    </el-card>

    <el-card v-loading="list.loading.value" shadow="never">
      <el-table v-if="!isMobile" :data="list.rows.value" row-key="id" empty-text="没有应收款" @sort-change="list.onSortChange">
        <el-table-column prop="client_name" label="客户" min-width="170" sortable="custom" show-overflow-tooltip>
          <template #default="{ row }">
            <router-link :to="`/customers/${row.client_id}`" class="link">{{ row.client_name }}</router-link>
            <div class="sub">{{ row.title }}</div>
          </template>
        </el-table-column>
        <el-table-column label="收款进度" min-width="200">
          <template #default="{ row }">
            <template v-if="row.amount !== null">
              <div class="money num">
                <span>{{ formatMoney(row.paid_amount) }}</span>
                <span class="text-muted"> / {{ formatMoney(row.amount) }}</span>
              </div>
              <el-progress :percentage="progress(row as ReceivableOverview)" :stroke-width="6" :show-text="false" :status="row.settled ? 'success' : undefined" />
            </template>
            <span v-else class="text-muted">金额未登记 · 已收 {{ formatMoney(row.paid_amount) }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="outstanding" label="未收" width="110" align="right" sortable="custom">
          <template #default="{ row }">
            <strong v-if="!row.settled && row.amount !== null" class="num text-danger">{{ formatMoney(row.outstanding) }}</strong>
            <span v-else class="text-muted">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="next_remind_on" label="催款" width="170" sortable="custom">
          <template #default="{ row }">
            <el-tag v-if="row.settled" type="success" size="small">已结清</el-tag>
            <template v-else>
              <span :class="{ 'text-danger': (row.days_until_remind ?? 1) <= 0 }">{{ describeRemind(row.days_until_remind) }}</span>
              <div class="sub">{{ row.next_remind_on }}</div>
            </template>
          </template>
        </el-table-column>
        <el-table-column prop="billed_on" label="开单" width="110" sortable="custom" />
        <el-table-column v-if="session.isAdmin" prop="owner_name" label="负责人" width="100" />
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <template v-if="!row.settled">
              <el-button link type="primary" @click="pay(row as ReceivableOverview)">登记收款</el-button>
              <el-button link @click="remind(row as ReceivableOverview)">催款记录</el-button>
              <el-dropdown trigger="click">
                <el-button link>更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="edit(row as ReceivableOverview)">编辑</el-dropdown-item>
                    <el-dropdown-item @click="close(row as ReceivableOverview)">标记已结清</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
            <template v-else>
              <el-button link @click="pay(row as ReceivableOverview)">收款明细</el-button>
              <el-button v-if="row.closed_at" link @click="reopen(row as ReceivableOverview)">重新打开</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div v-else class="cards">
        <el-empty v-if="!list.rows.value.length && !list.loading.value" description="没有应收款" />
        <div v-for="r in list.rows.value" :key="r.id" class="card">
          <div class="card-head">
            <router-link :to="`/customers/${r.client_id}`" class="link">{{ r.client_name }}</router-link>
            <el-tag v-if="r.settled" type="success" size="small">已结清</el-tag>
            <span v-else class="small" :class="{ 'text-danger': (r.days_until_remind ?? 1) <= 0 }">{{ describeRemind(r.days_until_remind) }}</span>
          </div>
          <div class="sub">{{ r.title }}</div>
          <div class="money num">
            {{ r.amount === null ? '金额未登记' : `${formatMoney(r.paid_amount)} / ${formatMoney(r.amount)}` }}
          </div>
          <el-progress v-if="r.amount !== null" :percentage="progress(r)" :stroke-width="6" :show-text="false" />
          <div v-if="!r.settled" class="card-actions">
            <el-button size="small" type="primary" round @click="pay(r)">登记收款</el-button>
            <el-button size="small" round @click="remind(r)">催款记录</el-button>
          </div>
        </div>
      </div>

      <el-pagination
        v-model:current-page="list.page.value"
        v-model:page-size="list.pageSize.value"
        :total="list.total.value"
        :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
        class="pager"
      />
    </el-card>

    <ReceivableFormDialog v-model="formDialog" :receivable="editing" @saved="refresh" />
    <PaymentDialog v-model="paymentDialog" :receivable="current" @saved="refresh" />
    <FollowUpFormDialog
      v-model="followDialog"
      :client-id="current?.client_id ?? null"
      :client-name="current?.client_name"
      :device-id="current?.device_id"
      @saved="refresh"
    />
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}
.toolbar :deep(.el-card__body) {
  padding-top: 6px;
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
  width: 130px;
}
.spacer {
  flex: 1;
}
.link {
  color: var(--app-text);
  font-weight: 600;
  text-decoration: none;
}
.link:hover {
  color: var(--brand-600);
}
.sub {
  font-size: 12px;
  color: var(--app-text-3);
}
.money {
  font-size: 13px;
  margin-bottom: 4px;
}
.small {
  font-size: 12px;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.card-actions {
  display: flex;
  gap: 6px;
}
@media (max-width: 1000px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 768px) {
  .kw,
  .sel {
    width: 100%;
  }
}
</style>
