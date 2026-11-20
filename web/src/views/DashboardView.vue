<script setup lang="ts">
import { AlarmClock, Calendar, Coin, Cpu, Refresh, Tickets, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeError } from '@/api/cloud'
import {
  dashboardStats,
  fetchDeviceFacts,
  fetchReplacementsSince,
  listDevices,
  listReceivables,
  listWorkOrders,
  type DashboardStats,
  type WorkOrderRow,
} from '@/api/data'
import type { DeviceOverview, ReceivableOverview } from '@/api/types'
import AppChart, { type ChartOption } from '@/components/charts/AppChart.vue'
import DueTag from '@/components/DueTag.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import ReplacementFormDialog from '@/components/ReplacementFormDialog.vue'
import StatCard from '@/components/StatCard.vue'
import { todayStr } from '@/lib/dates'
import { describeRemind, formatMoney, WORK_ORDER_STATUSES, WORK_ORDER_TYPES } from '@/lib/format'
import { aggregateByMonth, dueDistribution, recentMonths, type MonthlyRow } from '@/lib/stats'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()

// 管理员可以切换查看某位成员的数据；空 = 全部
const viewOwner = ref(session.isAdmin && typeof route.query.owner === 'string' ? route.query.owner : '')
const viewingName = computed(() => (viewOwner.value ? session.memberName(viewOwner.value) || '该成员' : ''))
/** 跳转到列表页时带上当前查看的成员 */
function withOwner(path: string): string {
  return viewOwner.value ? `${path}${path.includes('?') ? '&' : '?'}owner=${viewOwner.value}` : path
}
watch(viewOwner, (v) => {
  void router.replace({ query: v ? { owner: v } : {} })
  void load()
})

const loading = ref(false)
const stats = ref<DashboardStats | null>(null)
const dueDevices = ref<DeviceOverview[]>([])
const dueTotal = ref(0)
const remind = ref<ReceivableOverview[]>([])
const remindTotal = ref(0)
const myOrders = ref<WorkOrderRow[]>([])
const monthly = ref<MonthlyRow[]>([])
const distribution = ref<{ label: string; value: number }[]>([])

const replacementDialog = ref(false)
const current = ref<DeviceOverview | null>(null)

const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: 'numeric', hour12: false }).format(new Date()))
const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', weekday: 'long' }).format(new Date())

async function load() {
  loading.value = true
  try {
    const months = recentMonths(todayStr(), 6)
    const owner = viewOwner.value || undefined
    const [s, devices, receivables, replacements, facts, orders] = await Promise.all([
      dashboardStats(session.uid, owner),
      listDevices({ page: 1, pageSize: 8, statuses: ['overdue', 'today', 'week'], ownerId: owner, sort: { field: 'next_due_on', order: 'asc' } }),
      listReceivables({ page: 1, pageSize: 6, status: 'due', ownerId: owner }),
      fetchReplacementsSince(`${months[0]}-01`),
      fetchDeviceFacts(),
      listWorkOrders({ page: 1, pageSize: 5, statuses: ['pending', 'in_progress'], assigneeId: owner || session.uid, sort: { field: 'scheduled_on', order: 'asc' } }),
    ])
    stats.value = s
    dueDevices.value = devices.rows
    dueTotal.value = devices.total
    remind.value = receivables.rows
    remindTotal.value = receivables.total
    myOrders.value = orders.rows
    monthly.value = aggregateByMonth(owner ? replacements.filter((r) => r.created_by === owner) : replacements, months)
    distribution.value = dueDistribution((owner ? facts.filter((f) => f.owner_id === owner) : facts).map((f) => f.days_until_due))
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}

function describeSchedule(date: string | null): string {
  if (!date) return '未定日期'
  const days = Math.round((Date.parse(date) - Date.parse(todayStr())) / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days < 0) return `已过 ${-days} 天`
  return date.slice(5).replace('-', '月') + '日'
}

function openReplacement(row: DeviceOverview) {
  current.value = row
  replacementDialog.value = true
}

const trendOption = computed<ChartOption>(() => ({
  xAxis: { type: 'category', data: monthly.value.map((m) => `${Number(m.month.slice(5))}月`) },
  yAxis: [
    { type: 'value', name: '次数', minInterval: 1 },
    { type: 'value', name: '收入(元)', splitLine: { show: false } },
  ],
  series: [
    { name: '换芯次数', type: 'bar', data: monthly.value.map((m) => m.count), barMaxWidth: 26, itemStyle: { borderRadius: [6, 6, 0, 0] } },
    { name: '收入', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, data: monthly.value.map((m) => m.revenue), areaStyle: { opacity: 0.08 } },
  ],
}))

const DUE_COLORS = ['#ef4444', '#f59e0b', '#fbbf24', '#3b82f6', '#06b6d4', '#10b981', '#94a3b8']
const distributionOption = computed<ChartOption>(() => ({
  tooltip: { trigger: 'item', formatter: '{b}：{c} 台（{d}%）' },
  legend: { orient: 'vertical', right: 0, top: 'middle' },
  series: [
    {
      type: 'pie',
      radius: ['52%', '78%'],
      center: ['34%', '50%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: 'transparent', borderWidth: 2 },
      label: { show: false },
      data: distribution.value.map((d, i) => ({ name: d.label, value: d.value, itemStyle: { color: DUE_COLORS[i] } })),
    },
  ],
}))

onMounted(load)
</script>

<template>
  <div v-loading="loading && !stats" class="page">
    <section class="hero">
      <div>
        <h2>{{ greeting }}，{{ session.member?.username }}<span v-if="viewingName" class="viewing">正在查看：{{ viewingName }}</span></h2>
        <p>
          {{ todayStr() }} {{ weekday }}（北京时间）·
          <template v-if="stats">
            有 <strong class="text-danger">{{ stats.overdue }}</strong> 台设备已超期，
            <strong>{{ stats.dueThisWeek }}</strong> 台 7 天内到期
          </template>
        </p>
      </div>
      <div class="hero-actions">
        <el-select v-if="session.isAdmin" v-model="viewOwner" clearable filterable placeholder="查看全部成员" class="owner-sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <el-button :icon="Refresh" round @click="load">刷新</el-button>
      </div>
    </section>

    <div class="stats">
      <StatCard label="已超期" :value="stats?.overdue ?? '—'" :icon="WarningFilled" tone="danger" hint="需要尽快安排换芯" :to="withOwner('/devices?status=overdue')" />
      <StatCard label="7 天内到期" :value="stats?.dueThisWeek ?? '—'" :icon="AlarmClock" tone="warning" hint="提前联系客户预约" :to="withOwner('/devices?status=today,week')" />
      <StatCard label="应催款" :value="stats?.unpaidDue ?? '—'" :icon="Coin" tone="violet" hint="已到催款日期的应收" :to="withOwner('/payments')" />
      <StatCard
        :label="viewingName ? `${viewingName}的待办工单` : '我的待办工单'"
        :value="stats?.openWorkOrders ?? '—'"
        :icon="Tickets"
        tone="primary"
        :hint="viewingName ? '指派给他、未完成' : '指派给我、未完成'"
        :to="viewOwner ? `/work-orders?tab=open&assignee=${viewOwner}` : '/work-orders'"
      />
      <StatCard label="设备总数" :value="stats?.devices ?? '—'" :icon="Cpu" tone="info" hint="在保的装机记录" :to="withOwner('/devices')" />
      <StatCard
        label="本月换芯"
        :value="stats?.replacementsThisMonth ?? '—'"
        :icon="Calendar"
        tone="success"
        :hint="stats ? `收入 ${formatMoney(stats.revenueThisMonth)}` : ''"
        :to="withOwner('/reports')"
      />
    </div>

    <el-card v-if="myOrders.length" shadow="never">
      <template #header>
        <div class="card-header">
          <span>{{ viewingName ? `${viewingName}的工单` : '我的工单' }} <em class="count">{{ stats?.openWorkOrders ?? myOrders.length }}</em></span>
          <router-link :to="viewOwner ? `/work-orders?tab=open&assignee=${viewOwner}` : '/work-orders'" class="more">{{ viewOwner ? '查看 →' : '去处理 →' }}</router-link>
        </div>
      </template>
      <router-link v-for="o in myOrders" :key="o.id" to="/work-orders" class="item order">
        <div class="order-when" :class="{ late: describeSchedule(o.scheduled_on).startsWith('已过') || describeSchedule(o.scheduled_on) === '今天' }">
          {{ describeSchedule(o.scheduled_on) }}
        </div>
        <div class="item-main">
          <div class="item-title">{{ o.title || WORK_ORDER_TYPES[o.type] }}</div>
          <div class="item-sub">
            <span>{{ o.clients?.name ?? '—' }}</span>
            <span v-if="o.devices?.address || o.devices?.location">{{ o.devices?.address || o.devices?.location }}</span>
          </div>
        </div>
        <el-tag size="small" :type="WORK_ORDER_STATUSES[o.status].tag" round>{{ WORK_ORDER_STATUSES[o.status].label }}</el-tag>
      </router-link>
    </el-card>

    <div class="grid-main">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>需要换芯 <em class="count">{{ dueTotal }}</em></span>
            <router-link :to="withOwner('/devices?status=overdue,today,week')" class="more">全部 →</router-link>
          </div>
        </template>
        <el-empty v-if="!dueDevices.length" description="近期没有需要换芯的设备" :image-size="72" />
        <div v-for="d in dueDevices" :key="d.id" class="item">
          <div class="item-avatar">{{ d.client_name.slice(0, 1) }}</div>
          <div class="item-main">
            <router-link :to="`/customers/${d.client_id}`" class="item-title">{{ d.client_name }}</router-link>
            <div class="item-sub">
              <span>{{ d.address || d.location || '—' }}</span>
              <span>{{ d.contact_person || '联系人未填' }}</span>
              <PhoneLinks :phone="d.phone" />
            </div>
          </div>
          <div class="item-actions">
            <DueTag :days="d.days_until_due" :date="d.next_due_on" />
            <el-button size="small" type="primary" plain round @click="openReplacement(d)">登记换芯</el-button>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>应催款 <em class="count">{{ remindTotal }}</em></span>
            <router-link :to="withOwner('/payments')" class="more">全部 →</router-link>
          </div>
        </template>
        <el-empty v-if="!remind.length" description="没有需要催款的应收" :image-size="72" />
        <div v-for="r in remind" :key="r.id" class="item">
          <div class="item-main">
            <router-link :to="`/customers/${r.client_id}`" class="item-title">{{ r.client_name }}</router-link>
            <div class="item-sub">
              <span>{{ r.title }}</span>
              <span>{{ r.amount === null ? '金额未登记' : `欠 ${formatMoney(r.outstanding)}` }}</span>
            </div>
          </div>
          <span class="remind">{{ describeRemind(r.days_until_remind) }}</span>
        </div>
      </el-card>
    </div>

    <div class="grid-2">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>近 6 个月换芯趋势</span>
            <router-link :to="withOwner('/reports')" class="more">查看报表 →</router-link>
          </div>
        </template>
        <AppChart :option="trendOption" height="260px" />
      </el-card>
      <el-card shadow="never">
        <template #header>
          <div class="card-header"><span>设备到期分布</span></div>
        </template>
        <AppChart :option="distributionOption" height="260px" />
      </el-card>
    </div>

    <ReplacementFormDialog v-model="replacementDialog" :device="current" @saved="load" />
  </div>
</template>

<style scoped>
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 22px 24px;
  border-radius: var(--app-radius);
  background:
    radial-gradient(1200px 200px at 0% 0%, rgba(37, 99, 235, 0.12), transparent 60%),
    radial-gradient(600px 200px at 100% 0%, rgba(6, 182, 212, 0.12), transparent 60%),
    var(--app-surface);
  border: 1px solid var(--app-border);
}
.hero h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.viewing {
  margin-left: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 13px;
  font-weight: 600;
  vertical-align: middle;
}
.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.owner-sel {
  width: 160px;
}
.hero p {
  margin: 6px 0 0;
  color: var(--app-text-2);
  font-size: 13px;
}
.stats {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 14px;
}
.grid-2 {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 16px;
}
.grid-main {
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
.count {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--brand-50);
  color: var(--brand-600);
}
.more {
  font-size: 13px;
  font-weight: 500;
  color: var(--brand-600);
  text-decoration: none;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--app-border);
}
.item:last-child {
  border-bottom: none;
}
.item-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.item-main {
  flex: 1;
  min-width: 0;
}
.item-title {
  color: var(--app-text);
  font-weight: 600;
  text-decoration: none;
}
.item-title:hover {
  color: var(--brand-600);
}
.item-sub {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--app-text-3);
}
.item.order {
  text-decoration: none;
  color: inherit;
  flex-wrap: nowrap;
}
.order-when {
  min-width: 56px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--brand-50);
  color: var(--brand-600);
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  flex-shrink: 0;
}
.order-when.late {
  background: rgba(239, 68, 68, 0.1);
  color: var(--tone-danger);
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.remind {
  font-size: 12px;
  font-weight: 600;
  color: var(--tone-danger);
  white-space: nowrap;
}
@media (max-width: 1280px) {
  .stats {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
@media (max-width: 1000px) {
  .grid-2,
  .grid-main {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 600px) {
  .stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .hero {
    padding: 16px;
  }
  .hero h2 {
    font-size: 18px;
  }
  .item {
    flex-wrap: wrap;
  }
  .item-actions {
    width: 100%;
    padding-left: 48px;
    justify-content: space-between;
  }
}
</style>
