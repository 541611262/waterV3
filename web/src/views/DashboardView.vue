<script setup lang="ts">
import { AlarmClock, Calendar, Coin, Cpu, Refresh, Tickets, WarningFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { computed, onMounted, ref } from 'vue'
import { describeError } from '@/api/cloud'
import {
  dashboardStats,
  fetchDeviceFacts,
  fetchReplacementsSince,
  listDevices,
  listReceivables,
  type DashboardStats,
} from '@/api/data'
import type { DeviceOverview, ReceivableOverview } from '@/api/types'
import AppChart, { type ChartOption } from '@/components/charts/AppChart.vue'
import DueTag from '@/components/DueTag.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import ReplacementFormDialog from '@/components/ReplacementFormDialog.vue'
import StatCard from '@/components/StatCard.vue'
import { todayStr } from '@/lib/dates'
import { describeRemind, formatMoney } from '@/lib/format'
import { aggregateByMonth, dueDistribution, recentMonths, type MonthlyRow } from '@/lib/stats'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()

const loading = ref(false)
const stats = ref<DashboardStats | null>(null)
const dueDevices = ref<DeviceOverview[]>([])
const dueTotal = ref(0)
const remind = ref<ReceivableOverview[]>([])
const remindTotal = ref(0)
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
    const [s, devices, receivables, replacements, facts] = await Promise.all([
      dashboardStats(session.uid),
      listDevices({ page: 1, pageSize: 8, statuses: ['overdue', 'today', 'week'], sort: { field: 'next_due_on', order: 'asc' } }),
      listReceivables({ page: 1, pageSize: 6, status: 'due' }),
      fetchReplacementsSince(`${months[0]}-01`),
      fetchDeviceFacts(),
    ])
    stats.value = s
    dueDevices.value = devices.rows
    dueTotal.value = devices.total
    remind.value = receivables.rows
    remindTotal.value = receivables.total
    monthly.value = aggregateByMonth(replacements, months)
    distribution.value = dueDistribution(facts.map((f) => f.days_until_due))
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
  <div v-loading="loading" class="page">
    <section class="hero">
      <div>
        <h2>{{ greeting }}，{{ session.member?.username }}</h2>
        <p>
          {{ todayStr() }} {{ weekday }}（北京时间）·
          <template v-if="stats">
            有 <strong class="text-danger">{{ stats.overdue }}</strong> 台设备已超期，
            <strong>{{ stats.dueThisWeek }}</strong> 台 7 天内到期
          </template>
        </p>
      </div>
      <el-button :icon="Refresh" round @click="load">刷新</el-button>
    </section>

    <div class="stats">
      <StatCard label="已超期" :value="stats?.overdue ?? '—'" :icon="WarningFilled" tone="danger" hint="需要尽快安排换芯" to="/devices?status=overdue" />
      <StatCard label="7 天内到期" :value="stats?.dueThisWeek ?? '—'" :icon="AlarmClock" tone="warning" hint="提前联系客户预约" to="/devices?status=today,week" />
      <StatCard label="应催款" :value="stats?.unpaidDue ?? '—'" :icon="Coin" tone="violet" hint="已到催款日期的应收" to="/payments" />
      <StatCard label="我的待办工单" :value="stats?.openWorkOrders ?? '—'" :icon="Tickets" tone="primary" hint="指派给我、未完成" to="/work-orders" />
      <StatCard label="设备总数" :value="stats?.devices ?? '—'" :icon="Cpu" tone="info" hint="在保的装机记录" to="/devices" />
      <StatCard
        label="本月换芯"
        :value="stats?.replacementsThisMonth ?? '—'"
        :icon="Calendar"
        tone="success"
        :hint="stats ? `收入 ${formatMoney(stats.revenueThisMonth)}` : ''"
        to="/reports"
      />
    </div>

    <div class="grid-2">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>近 6 个月换芯趋势</span>
            <router-link to="/reports" class="more">查看报表 →</router-link>
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

    <div class="grid-main">
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>需要换芯 <em class="count">{{ dueTotal }}</em></span>
            <router-link to="/devices?status=overdue,today,week" class="more">全部 →</router-link>
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
          <DueTag :days="d.days_until_due" :date="d.next_due_on" />
          <el-button size="small" type="primary" plain round @click="openReplacement(d)">登记换芯</el-button>
        </div>
      </el-card>

      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <span>应催款 <em class="count">{{ remindTotal }}</em></span>
            <router-link to="/payments" class="more">全部 →</router-link>
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
}
</style>
