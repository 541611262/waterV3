<script setup lang="ts">
import { ArrowDown, Download, Grid, List, Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { refDebounced, useMediaQuery, useStorage } from '@vueuse/core'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeError } from '@/api/cloud'
import { DEVICE_STATUSES, listDevices, listRegions, softDelete, type DeviceStatusKey } from '@/api/data'
import { collectExportEntries, downloadWorkbook } from '@/api/importExport'
import type { DeviceOverview } from '@/api/types'
import DeviceFormDialog from '@/components/DeviceFormDialog.vue'
import BatchDispatchDialog from '@/components/BatchDispatchDialog.vue'
import DueTag from '@/components/DueTag.vue'
import ImportDialog from '@/components/ImportDialog.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import ReplacementFormDialog from '@/components/ReplacementFormDialog.vue'
import WorkOrderFormDialog from '@/components/WorkOrderFormDialog.vue'
import { usePagedList } from '@/composables/usePagedList'
import { todayStr } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const route = useRoute()
const router = useRouter()
const isMobile = useMediaQuery('(max-width: 768px)')

// 从工作台跳转时可带上筛选：/devices?status=overdue,week
const initialStatuses = String(route.query.status ?? '')
  .split(',')
  .filter((s): s is DeviceStatusKey => DEVICE_STATUSES.some((d) => d.key === s))

const keyword = ref(typeof route.query.q === 'string' ? route.query.q : '')
// 顶栏全局搜索跳转过来时更新关键字
watch(
  () => route.query.q,
  (q) => {
    if (typeof q === 'string') keyword.value = q
  },
)
const keywordDebounced = refDebounced(keyword, 300)
const statuses = ref<DeviceStatusKey[]>(initialStatuses)
const ownerId = ref('')
const region = ref('')
const regions = ref<string[]>([])
const viewMode = useStorage<'table' | 'card'>('v4.devices.view', 'table')
const effectiveView = computed(() => (isMobile.value ? 'card' : viewMode.value))

const list = usePagedList<DeviceOverview>(
  (q) =>
    listDevices({
      ...q,
      keyword: keywordDebounced.value,
      statuses: statuses.value,
      ownerId: ownerId.value || undefined,
      region: region.value || undefined,
    }),
  { watchSources: [keywordDebounced, statuses, ownerId, region] },
)

const deviceDialog = ref(false)
const replacementDialog = ref(false)
const current = ref<DeviceOverview | null>(null)

function openReplacement(row: DeviceOverview) {
  current.value = row
  replacementDialog.value = true
}

function openDetail(row: DeviceOverview) {
  void router.push(`/customers/${row.client_id}`)
}

// ---------- 导入导出与批量操作 ----------
const importDialog = ref(false)
const dispatchDialog = ref(false)
const orderDialog = ref(false)
const orderPreset = ref<{ client_id: string; device_id: string } | null>(null)

function dispatch(row: DeviceOverview) {
  orderPreset.value = { client_id: row.client_id, device_id: row.id }
  orderDialog.value = true
}
const exporting = ref(false)
const selected = ref<DeviceOverview[]>([])
const tableRef = ref<{ clearSelection: () => void }>()

function currentFilter() {
  return {
    keyword: keywordDebounced.value,
    statuses: statuses.value,
    ownerId: ownerId.value || undefined,
    region: region.value || undefined,
  }
}

async function exportDevices(scope: 'all' | 'filtered' | 'selected') {
  exporting.value = true
  try {
    let entries
    if (scope === 'selected') {
      entries = await collectExportEntries({ ids: selected.value.map((d) => d.id) })
    } else if (scope === 'filtered') {
      const ids: string[] = []
      for (let page = 1; ; page++) {
        const result = await listDevices({ ...currentFilter(), page, pageSize: 1000 })
        ids.push(...result.rows.map((r) => r.id))
        if (ids.length >= result.total || !result.rows.length) break
      }
      entries = await collectExportEntries({ ids })
    } else {
      entries = await collectExportEntries({ includeEmptyClients: true })
    }
    if (!entries.length) {
      ElMessage.warning('没有可导出的数据')
      return
    }
    const suffix = scope === 'all' ? '' : scope === 'selected' ? '_所选' : '_筛选结果'
    downloadWorkbook(entries, `滤芯客户数据${suffix}_${todayStr()}`)
    ElMessage.success(`已导出 ${entries.length} 行，可直接重新导入`)
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    exporting.value = false
  }
}

async function deleteSelected() {
  const rows = selected.value
  if (!rows.length) return
  const message = `删除选中的 ${rows.length} 条装机记录？删除后可以在「设置 → 回收站」中恢复。`
  try {
    if (rows.length > 5) {
      await ElMessageBox.prompt(`${message}
为防止误操作，请输入「删除」确认。`, '批量删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        inputPattern: /^删除$/,
        inputErrorMessage: '请输入「删除」',
        type: 'warning',
      })
    } else {
      await ElMessageBox.confirm(message, '批量删除', { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' })
    }
  } catch {
    return
  }
  let failed = 0
  for (const row of rows) {
    try {
      await softDelete('devices', row.id, row.version)
    } catch {
      failed++
    }
  }
  if (failed) ElMessage.warning(`已删除 ${rows.length - failed} 条，${failed} 条失败（可能刚被别人修改或没有权限），请刷新后重试`)
  else ElMessage.success(`已删除 ${rows.length} 条，可在回收站恢复`)
  tableRef.value?.clearSelection()
  await list.load()
}

function clearFilters() {
  keyword.value = ''
  statuses.value = []
  ownerId.value = ''
  region.value = ''
}

onMounted(async () => {
  void list.load()
  regions.value = (await listRegions().catch(() => ({ regions: [] as string[] }))).regions
})
</script>

<template>
  <div class="page">
    <el-card shadow="never" class="filters">
      <div class="filter-row">
        <el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索客户、地址、联系人、电话、型号" class="kw" />
        <el-select v-if="session.isAdmin" v-model="ownerId" clearable placeholder="负责人" class="sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <el-select v-model="region" clearable filterable placeholder="区域" class="sel">
          <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
        </el-select>
        <div class="spacer" />
        <el-radio-group v-if="!isMobile" v-model="viewMode" size="default">
          <el-radio-button value="table"><el-icon><List /></el-icon></el-radio-button>
          <el-radio-button value="card"><el-icon><Grid /></el-icon></el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" @click="list.load()" />
        <el-button :icon="Upload" @click="importDialog = true">导入</el-button>
        <el-dropdown trigger="click" @command="exportDevices">
          <el-button :icon="Download" :loading="exporting">导出<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="filtered">导出当前筛选结果</el-dropdown-item>
              <el-dropdown-item command="all">导出全部（含没有装机记录的客户）</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button type="primary" :icon="Plus" @click="deviceDialog = true">新增</el-button>
      </div>
      <div class="status-row">
        <span class="label">状态（可多选）</span>
        <el-checkbox-group v-model="statuses" size="small">
          <el-checkbox-button v-for="s in DEVICE_STATUSES" :key="s.key" :value="s.key">{{ s.label }}</el-checkbox-button>
        </el-checkbox-group>
        <el-button v-if="keyword || statuses.length || ownerId || region" link type="primary" @click="clearFilters">清除筛选</el-button>
      </div>
    </el-card>

    <el-card v-loading="list.loading.value" shadow="never" class="content">
      <div v-if="selected.length" class="batch-bar">
        <span>已选 {{ selected.length }} 条</span>
        <el-button size="small" type="primary" plain @click="dispatchDialog = true">批量派单</el-button>
        <el-button size="small" :loading="exporting" @click="exportDevices('selected')">导出所选</el-button>
        <el-button size="small" type="danger" plain @click="deleteSelected">删除所选</el-button>
        <el-button size="small" link @click="tableRef?.clearSelection()">取消选择</el-button>
      </div>
      <template v-if="effectiveView === 'table'">
        <el-table
          ref="tableRef"
          :data="list.rows.value"
          row-key="id"
          :default-sort="{ prop: 'next_due_on', order: 'ascending' }"
          empty-text="没有符合条件的装机记录"
          @sort-change="list.onSortChange"
          @row-dblclick="openDetail"
          @selection-change="(rows: DeviceOverview[]) => (selected = rows)"
        >
          <el-table-column type="selection" width="42" />
          <el-table-column prop="client_name" label="客户" min-width="160" sortable="custom" show-overflow-tooltip>
            <template #default="{ row }">
              <router-link :to="`/customers/${row.client_id}`" class="link">{{ row.client_name }}</router-link>
              <div class="sub">{{ [row.province, row.region].filter(Boolean).join(' · ') }}</div>
            </template>
          </el-table-column>
          <el-table-column label="地址 / 位置" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">
              <div>{{ row.address || '—' }}</div>
              <div class="sub">{{ row.location }}</div>
            </template>
          </el-table-column>
          <el-table-column label="联系人" min-width="150">
            <template #default="{ row }">
              <div>{{ row.contact_person || '—' }}</div>
              <PhoneLinks :phone="row.phone" class="sub" />
            </template>
          </el-table-column>
          <el-table-column prop="model" label="型号" min-width="110" sortable="custom">
            <template #default="{ row }">{{ row.model || '—' }}<span v-if="row.quantity" class="sub"> × {{ row.quantity }}</span></template>
          </el-table-column>
          <el-table-column prop="last_service_on" label="上次服务" width="112" sortable="custom" />
          <el-table-column prop="next_due_on" label="下次换芯" width="150" sortable="custom">
            <template #default="{ row }">
              <DueTag :days="row.days_until_due" :date="row.next_due_on" />
              <div class="sub">{{ row.next_due_on }}<span v-if="row.stage_count"> · {{ row.stage_count }} 级</span></div>
            </template>
          </el-table-column>
          <el-table-column label="标记" width="110">
            <template #default="{ row }">
              <div class="badges">
                <el-tag v-if="row.open_receivable_count" size="small" type="danger" effect="plain">待收款</el-tag>
                <el-tag v-if="row.need_water_test" size="small" type="primary" effect="plain">需验水</el-tag>
                <el-tag v-if="row.long_term_partner" size="small" type="success" effect="plain">长期合作</el-tag>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="session.isAdmin" prop="owner_name" label="负责人" width="100" />
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openReplacement(row as DeviceOverview)">登记换芯</el-button>
              <el-button link @click="dispatch(row as DeviceOverview)">派单</el-button>
              <el-button link @click="openDetail(row as DeviceOverview)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <template v-else>
        <el-empty v-if="!list.rows.value.length && !list.loading.value" description="没有符合条件的装机记录" />
        <div class="cards">
          <div v-for="row in list.rows.value" :key="row.id" class="card" :class="`due-${row.days_until_due === null ? 'none' : row.days_until_due < 0 ? 'overdue' : row.days_until_due <= 7 ? 'soon' : 'ok'}`">
            <div class="card-head">
              <router-link :to="`/customers/${row.client_id}`" class="card-title">{{ row.client_name }}</router-link>
              <DueTag :days="row.days_until_due" :date="row.next_due_on" />
            </div>
            <div class="card-line">{{ row.address || '—' }}<span v-if="row.location" class="sub"> · {{ row.location }}</span></div>
            <div class="card-line">
              {{ row.contact_person || '—' }}
              <PhoneLinks :phone="row.phone" />
            </div>
            <div class="card-line sub">
              {{ row.model || '型号未填' }}<span v-if="row.quantity"> × {{ row.quantity }}</span> · 上次服务 {{ row.last_service_on || '—' }}
              <span v-if="session.isAdmin && row.owner_name"> · {{ row.owner_name }}</span>
            </div>
            <div class="card-foot">
              <div class="badges">
                <el-tag v-if="row.open_receivable_count" size="small" type="danger" effect="plain">待收款</el-tag>
                <el-tag v-if="row.need_water_test" size="small" type="primary" effect="plain">需验水</el-tag>
                <el-tag v-if="row.long_term_partner" size="small" type="success" effect="plain">长期合作</el-tag>
              </div>
              <el-button size="small" type="primary" plain @click="openReplacement(row as DeviceOverview)">登记换芯</el-button>
            </div>
          </div>
        </div>
      </template>

      <el-pagination
        v-model:current-page="list.page.value"
        v-model:page-size="list.pageSize.value"
        :total="list.total.value"
        :page-sizes="[20, 50, 100]"
        :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next, jumper'"
        :pager-count="isMobile ? 5 : 7"
        class="pager"
      />
    </el-card>

    <DeviceFormDialog v-model="deviceDialog" @saved="list.load()" />
    <ImportDialog v-model="importDialog" @imported="list.load()" />
    <BatchDispatchDialog v-model="dispatchDialog" :devices="selected" @done="tableRef?.clearSelection()" />
    <WorkOrderFormDialog v-model="orderDialog" :preset="orderPreset" />
    <ReplacementFormDialog v-model="replacementDialog" :device="current" @saved="list.load()" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.filters :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
}
.filter-row,
.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.kw {
  width: 300px;
  max-width: 100%;
}
.sel {
  width: 140px;
}
.spacer {
  flex: 1;
}
.label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.link,
.card-title {
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  background: var(--el-color-primary-light-9);
  border-radius: 6px;
  font-size: 13px;
}
.pager {
  margin-top: 12px;
  justify-content: flex-end;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.card {
  border: 1px solid var(--el-border-color-lighter);
  border-left: 4px solid var(--el-color-success);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: #fff;
}
.card.due-overdue {
  border-left-color: var(--el-color-danger);
}
.card.due-soon {
  border-left-color: var(--el-color-warning);
}
.card.due-none {
  border-left-color: var(--el-color-info);
}
.card-head,
.card-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.card-line {
  font-size: 13px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: baseline;
}
@media (max-width: 768px) {
  .kw,
  .sel {
    width: 100%;
  }
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
