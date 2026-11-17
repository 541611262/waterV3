<script setup lang="ts">
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
import { refDebounced, useMediaQuery } from '@vueuse/core'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listClients, listRegions } from '@/api/data'
import type { Client, ClientOverview } from '@/api/types'
import ClientFormDialog from '@/components/ClientFormDialog.vue'
import DueTag from '@/components/DueTag.vue'
import FollowUpFormDialog from '@/components/FollowUpFormDialog.vue'
import { usePagedList } from '@/composables/usePagedList'
import { formatMoney } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const isMobile = useMediaQuery('(max-width: 768px)')

const keyword = ref('')
const keywordDebounced = refDebounced(keyword, 300)
const ownerId = ref('')
const region = ref('')
const dueOnly = ref(false)
const unpaidOnly = ref(false)
const regions = ref<string[]>([])

const list = usePagedList<ClientOverview>(
  (q) =>
    listClients({
      ...q,
      keyword: keywordDebounced.value,
      ownerId: ownerId.value || undefined,
      region: region.value || undefined,
      dueOnly: dueOnly.value,
      unpaidOnly: unpaidOnly.value,
    }),
  { watchSources: [keywordDebounced, ownerId, region, dueOnly, unpaidOnly] },
)

const clientDialog = ref(false)
const followDialog = ref(false)
const current = ref<ClientOverview | null>(null)

function openFollowUp(row: ClientOverview) {
  current.value = row
  followDialog.value = true
}

function onCreated(client: Client) {
  void router.push(`/customers/${client.id}`)
}

onMounted(async () => {
  void list.load()
  regions.value = (await listRegions().catch(() => ({ regions: [] as string[] }))).regions
})
</script>

<template>
  <div class="page">
    <el-card shadow="never">
      <div class="filter-row">
        <el-input v-model="keyword" :prefix-icon="Search" clearable placeholder="搜索客户名称、省份、区域、备注" class="kw" />
        <el-select v-if="session.isAdmin" v-model="ownerId" clearable placeholder="负责人" class="sel">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
        <el-select v-model="region" clearable filterable placeholder="区域" class="sel">
          <el-option v-for="r in regions" :key="r" :label="r" :value="r" />
        </el-select>
        <el-checkbox v-model="dueOnly" border>7 天内到期</el-checkbox>
        <el-checkbox v-model="unpaidOnly" border>有欠款</el-checkbox>
        <div class="spacer" />
        <el-button :icon="Refresh" @click="list.load()" />
        <el-button type="primary" :icon="Plus" @click="clientDialog = true">新建客户</el-button>
      </div>
    </el-card>

    <el-card v-loading="list.loading.value" shadow="never">
      <el-table
        v-if="!isMobile"
        :data="list.rows.value"
        row-key="id"
        empty-text="没有符合条件的客户"
        @sort-change="list.onSortChange"
        @row-dblclick="(row: ClientOverview) => router.push(`/customers/${row.id}`)"
      >
        <el-table-column prop="name" label="客户" min-width="180" sortable="custom" show-overflow-tooltip>
          <template #default="{ row }">
            <router-link :to="`/customers/${row.id}`" class="link">{{ row.name }}</router-link>
            <el-tag v-if="row.long_term_partner" size="small" type="success" effect="plain" class="ml">长期合作</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="地区" min-width="110">
          <template #default="{ row }">{{ [row.province, row.region].filter(Boolean).join(' · ') || '—' }}</template>
        </el-table-column>
        <el-table-column prop="device_count" label="装机" width="80" sortable="custom" align="center" />
        <el-table-column prop="next_due_on" label="最近到期" width="150" sortable="custom">
          <template #default="{ row }">
            <DueTag v-if="row.device_count" :days="row.days_until_due" :date="row.next_due_on" />
            <span v-else class="sub">无装机记录</span>
          </template>
        </el-table-column>
        <el-table-column prop="last_followed_on" label="最近跟踪" min-width="220" sortable="custom">
          <template #default="{ row }">
            <template v-if="row.last_follow_up">
              <span class="sub">{{ row.last_followed_on }}</span>
              <div class="ellipsis">{{ row.last_follow_up }}</div>
            </template>
            <span v-else class="sub">—</span>
          </template>
        </el-table-column>
        <el-table-column prop="outstanding_total" label="欠款" width="110" sortable="custom" align="right">
          <template #default="{ row }">
            <span v-if="row.open_receivable_count" class="danger">
              {{ Number(row.outstanding_total) > 0 ? formatMoney(row.outstanding_total) : '金额未登记' }}
            </span>
            <span v-else class="sub">—</span>
          </template>
        </el-table-column>
        <el-table-column v-if="session.isAdmin" prop="owner_name" label="负责人" width="100" />
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openFollowUp(row as ClientOverview)">添加跟踪</el-button>
            <el-button link @click="router.push(`/customers/${row.id}`)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-else class="cards">
        <el-empty v-if="!list.rows.value.length && !list.loading.value" description="没有符合条件的客户" />
        <router-link v-for="row in list.rows.value" :key="row.id" :to="`/customers/${row.id}`" class="card">
          <div class="card-head">
            <strong>{{ row.name }}</strong>
            <DueTag v-if="row.device_count" :days="row.days_until_due" :date="row.next_due_on" />
          </div>
          <div class="sub">
            {{ [row.province, row.region].filter(Boolean).join(' · ') || '地区未填' }} · {{ row.device_count }} 台
            <span v-if="row.open_receivable_count" class="danger"> · 有欠款</span>
          </div>
          <div v-if="row.last_follow_up" class="ellipsis sub">{{ row.last_followed_on }} {{ row.last_follow_up }}</div>
        </router-link>
      </div>

      <el-pagination
        v-model:current-page="list.page.value"
        v-model:page-size="list.pageSize.value"
        :total="list.total.value"
        :page-sizes="[20, 50, 100]"
        :layout="isMobile ? 'prev, pager, next' : 'total, sizes, prev, pager, next'"
        class="pager"
      />
    </el-card>

    <ClientFormDialog v-model="clientDialog" @saved="onCreated" />
    <FollowUpFormDialog v-model="followDialog" :client-id="current?.id ?? null" :client-name="current?.name" @saved="list.load()" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  color: var(--el-color-primary);
  text-decoration: none;
  font-weight: 500;
}
.ml {
  margin-left: 6px;
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.danger {
  color: var(--el-color-danger);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  color: inherit;
  text-decoration: none;
}
.card-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
}
@media (max-width: 768px) {
  .kw,
  .sel {
    width: 100%;
  }
}
</style>
