<script setup lang="ts">
import { Calendar, Coin, Download, Odometer, Tickets, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { utils, writeFile } from 'xlsx'
import { describeError } from '@/api/cloud'
import {
  fetchDeviceFacts,
  fetchReplacementsSince,
  fetchWorkOrdersSince,
  type DeviceFact,
  type ReplacementFact,
  type WorkOrderFact,
} from '@/api/data'
import AppChart, { type ChartOption } from '@/components/charts/AppChart.vue'
import StatCard from '@/components/StatCard.vue'
import { todayStr } from '@/lib/dates'
import { formatMoney } from '@/lib/format'
import { aggregateByMonth, countBy, recentMonths } from '@/lib/stats'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const months = ref(6)
const loading = ref(false)
const allReplacements = ref<ReplacementFact[]>([])
const allDevices = ref<DeviceFact[]>([])
const allOrders = ref<WorkOrderFact[]>([])

// 管理员可以只看某位成员：换芯按登记人、设备按负责人、工单按指派 / 完成人（与「成员工作量」一致）
const viewOwner = ref(session.isAdmin && typeof route.query.owner === 'string' ? route.query.owner : '')
const viewingName = computed(() => (viewOwner.value ? session.memberName(viewOwner.value) || '该成员' : ''))
watch(viewOwner, (v) => void router.replace({ query: v ? { owner: v } : {} }))
const replacements = computed(() => (viewOwner.value ? allReplacements.value.filter((r) => r.created_by === viewOwner.value) : allReplacements.value))
const devices = computed(() => (viewOwner.value ? allDevices.value.filter((d) => d.owner_id === viewOwner.value) : allDevices.value))
const orders = computed(() =>
  viewOwner.value ? allOrders.value.filter((o) => o.assignee_id === viewOwner.value || o.completed_by === viewOwner.value) : allOrders.value,
)

const monthKeys = computed(() => recentMonths(todayStr(), months.value))

async function load() {
  loading.value = true
  try {
    const start = `${monthKeys.value[0]}-01`
    const [r, d, o] = await Promise.all([fetchReplacementsSince(start), fetchDeviceFacts(), fetchWorkOrdersSince(start)])
    allReplacements.value = r
    allDevices.value = d
    allOrders.value = o
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}
watch(months, load)
onMounted(load)

const monthly = computed(() => aggregateByMonth(replacements.value, monthKeys.value))
const totals = computed(() => ({
  count: monthly.value.reduce((s, m) => s + m.count, 0),
  revenue: monthly.value.reduce((s, m) => s + m.revenue, 0),
  quantity: monthly.value.reduce((s, m) => s + m.quantity, 0),
}))
const withDate = computed(() => devices.value.filter((d) => d.days_until_due !== null))
const overdueRate = computed(() =>
  withDate.value.length ? Math.round((withDate.value.filter((d) => d.days_until_due! < 0).length / withDate.value.length) * 1000) / 10 : 0,
)
const ordersDone = computed(() => orders.value.filter((o) => o.status === 'done' && (!viewOwner.value || o.completed_by === viewOwner.value)).length)
const ordersCreated = computed(() => (viewOwner.value ? orders.value.filter((o) => o.assignee_id === viewOwner.value).length : orders.value.length))

const monthLabels = computed(() => monthKeys.value.map((m) => `${m.slice(2, 4)}/${m.slice(5)}`))

const trendOption = computed<ChartOption>(() => ({
  xAxis: { type: 'category', data: monthLabels.value },
  yAxis: [
    { type: 'value', name: '次数', minInterval: 1 },
    { type: 'value', name: '收入(元)', splitLine: { show: false } },
  ],
  series: [
    { name: '换芯次数', type: 'bar', data: monthly.value.map((m) => m.count), barMaxWidth: 24, itemStyle: { borderRadius: [6, 6, 0, 0] } },
    { name: '滤芯数量', type: 'bar', data: monthly.value.map((m) => m.quantity), barMaxWidth: 24, itemStyle: { borderRadius: [6, 6, 0, 0] } },
    { name: '收入', type: 'line', yAxisIndex: 1, smooth: true, data: monthly.value.map((m) => m.revenue), areaStyle: { opacity: 0.08 } },
  ],
}))

const regionRows = computed(() => {
  const byRegion = new Map<string, { total: number; overdue: number }>()
  for (const d of devices.value) {
    const name = d.region || '未填'
    const row = byRegion.get(name) ?? { total: 0, overdue: 0 }
    row.total++
    if ((d.days_until_due ?? 1) < 0) row.overdue++
    byRegion.set(name, row)
  }
  return [...byRegion.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total).slice(0, 12)
})
const regionOption = computed<ChartOption>(() => ({
  xAxis: { type: 'category', data: regionRows.value.map((r) => r.name), axisLabel: { interval: 0, rotate: regionRows.value.length > 6 ? 30 : 0 } },
  yAxis: { type: 'value', minInterval: 1 },
  series: [
    { name: '正常', type: 'bar', stack: 'r', data: regionRows.value.map((r) => r.total - r.overdue), barMaxWidth: 28, itemStyle: { color: '#3b82f6' } },
    { name: '已超期', type: 'bar', stack: 'r', data: regionRows.value.map((r) => r.overdue), barMaxWidth: 28, itemStyle: { color: '#ef4444', borderRadius: [6, 6, 0, 0] } },
  ],
}))

const modelOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 台（{d}%）' },
  legend: { orient: 'vertical', right: 0, top: 'middle', type: 'scroll' },
  series: [
    {
      type: 'pie',
      radius: ['50%', '76%'],
      center: ['36%', '50%'],
      label: { show: false },
      itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
      data: countBy(devices.value, (d) => d.model, 8),
    },
  ],
}))

// 工作量：每位成员的换芯登记次数、完成工单数、负责设备数、其中超期
const workload = computed(() => {
  const rows = new Map<string, { name: string; replacements: number; revenue: number; ordersDone: number; devices: number; overdue: number }>()
  const row = (uid: string | null) => {
    const key = uid ?? '—'
    if (!rows.has(key)) rows.set(key, { name: uid ? session.memberName(uid) || '（已删除成员）' : '未知', replacements: 0, revenue: 0, ordersDone: 0, devices: 0, overdue: 0 })
    return rows.get(key)!
  }
  for (const r of replacements.value) {
    const w = row(r.created_by)
    w.replacements++
    w.revenue += Number(r.cost) || 0
  }
  for (const o of orders.value) if (o.status === 'done') row(o.completed_by).ordersDone++
  for (const d of devices.value) {
    const w = row(d.owner_id)
    w.devices++
    if ((d.days_until_due ?? 1) < 0) w.overdue++
  }
  if (viewOwner.value) return rows.has(viewOwner.value) ? [rows.get(viewOwner.value)!] : []
  return [...rows.values()].sort((a, b) => b.replacements - a.replacements || b.devices - a.devices)
})

function exportReport() {
  const wb = utils.book_new()
  const monthlySheet = utils.aoa_to_sheet([
    ['月份', '换芯次数', '滤芯数量', '收入(元)'],
    ...monthly.value.map((m) => [m.month, m.count, m.quantity, m.revenue]),
    ['合计', totals.value.count, totals.value.quantity, Math.round(totals.value.revenue * 100) / 100],
  ])
  monthlySheet['!cols'] = [{ wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }]
  utils.book_append_sheet(wb, monthlySheet, '月度换芯')
  const workloadSheet = utils.aoa_to_sheet([
    ['成员', '登记换芯次数', '换芯收入(元)', '完成工单', '负责设备', '其中超期'],
    ...workload.value.map((w) => [w.name, w.replacements, Math.round(w.revenue * 100) / 100, w.ordersDone, w.devices, w.overdue]),
  ])
  workloadSheet['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
  utils.book_append_sheet(wb, workloadSheet, '工作量')
  const regionSheet = utils.aoa_to_sheet([['区域', '设备数', '已超期'], ...regionRows.value.map((r) => [r.name, r.total, r.overdue])])
  utils.book_append_sheet(wb, regionSheet, '区域分布')
  writeFile(wb, `滤芯业务报表_${viewingName.value ? `${viewingName.value}_` : ''}近${months.value}个月_${todayStr()}.xlsx`)
}
</script>

<template>
  <div v-loading="loading" class="page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-radio-group v-model="months">
          <el-radio-button :value="3">近 3 个月</el-radio-button>
          <el-radio-button :value="6">近 6 个月</el-radio-button>
          <el-radio-button :value="12">近 12 个月</el-radio-button>
        </el-radio-group>
        <el-select v-if="session.isAdmin" v-model="viewOwner" clearable filterable placeholder="全部成员" class="owner-sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <span class="text-muted scope">{{
          viewingName
            ? `统计范围：${viewingName}登记的换芯、负责的设备、指派或完成的工单`
            : session.isAdmin
              ? '统计范围：全部数据'
              : '统计范围：你负责的客户和被派单的客户'
        }}</span>
        <div class="spacer" />
        <el-button :icon="Download" @click="exportReport">导出报表</el-button>
      </div>
    </el-card>

    <div class="stats">
      <StatCard label="换芯次数" :value="totals.count" :icon="Calendar" tone="primary" :hint="`共 ${totals.quantity} 支滤芯`" />
      <StatCard label="换芯收入" :value="formatMoney(totals.revenue)" :icon="Coin" tone="success" hint="按换芯记录的费用统计" />
      <StatCard label="完成工单" :value="ordersDone" :icon="Tickets" tone="violet" :hint="viewingName ? `期间指派给他 ${ordersCreated} 张` : `期间新建 ${ordersCreated} 张`" />
      <StatCard label="超期率" :value="`${overdueRate}%`" :icon="WarningFilled" :tone="overdueRate > 30 ? 'danger' : 'warning'" :hint="`${withDate.length} 台有到期日期的设备`" />
      <StatCard label="在保设备" :value="devices.length" :icon="Odometer" tone="info" hint="当前全部装机记录" />
    </div>

    <el-card shadow="never">
      <template #header>月度换芯与收入</template>
      <AppChart :option="trendOption" height="300px" />
    </el-card>

    <div class="grid-2">
      <el-card shadow="never">
        <template #header>各区域设备与超期</template>
        <AppChart :option="regionOption" height="280px" />
      </el-card>
      <el-card shadow="never">
        <template #header>设备型号分布</template>
        <AppChart :option="modelOption" height="280px" />
      </el-card>
    </div>

    <el-card shadow="never">
      <template #header>成员工作量</template>
      <el-table :data="workload" size="small" empty-text="暂无数据">
        <el-table-column prop="name" label="成员" min-width="120" />
        <el-table-column prop="replacements" label="登记换芯" width="110" align="right" sortable />
        <el-table-column label="换芯收入" width="130" align="right" sortable :sort-method="(a, b) => a.revenue - b.revenue">
          <template #default="{ row }"><span class="num">{{ formatMoney(row.revenue) }}</span></template>
        </el-table-column>
        <el-table-column prop="ordersDone" label="完成工单" width="110" align="right" sortable />
        <el-table-column prop="devices" label="负责设备" width="110" align="right" sortable />
        <el-table-column label="其中超期" width="120" align="right" sortable :sort-method="(a, b) => a.overdue - b.overdue">
          <template #default="{ row }">
            <span :class="{ 'text-danger': row.overdue > 0 }" class="num">{{ row.overdue }}</span>
            <span v-if="row.devices" class="text-muted"> ({{ Math.round((row.overdue / row.devices) * 100) }}%)</span>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>月度明细</template>
      <el-table :data="monthly" size="small" show-summary :summary-method="() => ['合计', String(totals.count), String(totals.quantity), formatMoney(totals.revenue)]">
        <el-table-column prop="month" label="月份" />
        <el-table-column prop="count" label="换芯次数" align="right" />
        <el-table-column prop="quantity" label="滤芯数量" align="right" />
        <el-table-column label="收入" align="right">
          <template #default="{ row }"><span class="num">{{ formatMoney(row.revenue) }}</span></template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}
.scope {
  font-size: 12px;
}
.owner-sel {
  width: 150px;
}
.spacer {
  flex: 1;
}
.stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
@media (max-width: 1200px) {
  .stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 900px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
