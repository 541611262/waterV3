<script setup lang="ts">
import { ArrowLeft, Delete, Edit, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { describeError } from '@/api/cloud'
import {
  getClient,
  getClientOverview,
  listAudit,
  listClientDevices,
  listFollowUps,
  listReceivables,
  listReplacements,
  softDelete,
} from '@/api/data'
import type {
  AuditEntry,
  Client,
  ClientOverview,
  Device,
  DeviceOverview,
  FollowUp,
  ReceivableOverview,
  Replacement,
} from '@/api/types'
import ClientFormDialog from '@/components/ClientFormDialog.vue'
import DeviceFormDialog from '@/components/DeviceFormDialog.vue'
import DueTag from '@/components/DueTag.vue'
import FollowUpFormDialog from '@/components/FollowUpFormDialog.vue'
import PhoneLinks from '@/components/PhoneLinks.vue'
import ReplacementFormDialog from '@/components/ReplacementFormDialog.vue'
import { formatBeijingDateTime } from '@/lib/dates'
import { AUDIT_ACTIONS, FIELD_LABELS, TABLE_LABELS, describeRemind, formatMoney } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ id: string }>()
const router = useRouter()
const session = useSessionStore()

const loading = ref(true)
const notFound = ref(false)
const client = ref<Client | null>(null)
const overview = ref<ClientOverview | null>(null)
const devices = ref<DeviceOverview[]>([])
const replacements = ref<Replacement[]>([])
const followUps = ref<FollowUp[]>([])
const receivables = ref<ReceivableOverview[]>([])
const audit = ref<AuditEntry[]>([])
const tab = ref('devices')

const canEdit = computed(() => session.isAdmin || client.value?.owner_id === session.uid)
const deviceAddress = computed(() => new Map(devices.value.map((d) => [d.id, d.address || d.location || '（未填地址）'])))

async function load() {
  loading.value = true
  try {
    const [c, o, d, r, f, rc] = await Promise.all([
      getClient(props.id),
      getClientOverview(props.id),
      listClientDevices(props.id),
      listReplacements({ clientId: props.id }),
      listFollowUps(props.id),
      listReceivables({ page: 1, pageSize: 200, clientId: props.id, status: 'all' }),
    ])
    notFound.value = !c || Boolean(c.deleted_at)
    client.value = c
    overview.value = o
    devices.value = d
    replacements.value = r
    followUps.value = f
    receivables.value = rc.rows
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}

async function loadAudit() {
  try {
    audit.value = (await listAudit({ page: 1, pageSize: 100, clientId: props.id })).rows
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

watch(() => props.id, load, { immediate: true })
watch(tab, (value) => value === 'audit' && loadAudit())

// ---------- 对话框 ----------
const clientDialog = ref(false)
const deviceDialog = ref(false)
const editingDevice = ref<Device | null>(null)
const replacementDialog = ref(false)
const replacementDevice = ref<DeviceOverview | null>(null)
const followDialog = ref(false)

function addDevice() {
  editingDevice.value = null
  deviceDialog.value = true
}

function editDevice(d: DeviceOverview) {
  editingDevice.value = { ...d, deleted_at: null, created_by: null, updated_by: null, legacy_id: null }
  deviceDialog.value = true
}

function registerReplacement(d: DeviceOverview) {
  replacementDevice.value = d
  replacementDialog.value = true
}

async function confirmDelete(title: string, message: string) {
  await ElMessageBox.confirm(message, title, {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    confirmButtonClass: 'el-button--danger',
  })
}

async function deleteDevice(d: DeviceOverview) {
  try {
    await confirmDelete('删除装机记录', `删除「${d.address || d.location || d.model || '这条记录'}」？删除后可以在「设置 → 回收站」中恢复。`)
  } catch {
    return
  }
  try {
    await softDelete('devices', d.id, d.version)
    ElMessage.success('已删除，可在回收站恢复')
    await load()
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

async function deleteClient() {
  if (!client.value) return
  try {
    await confirmDelete(
      '删除客户',
      `删除客户「${client.value.name}」及其 ${devices.value.length} 条装机记录？删除后可以在「设置 → 回收站」中恢复。`,
    )
  } catch {
    return
  }
  try {
    await softDelete('clients', client.value.id, client.value.version)
    ElMessage.success('客户已删除，可在回收站恢复')
    await router.replace('/customers')
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}

// ---------- 操作日志 ----------
function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '空'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatBeijingDateTime(value)
  return String(value)
}

function describeChanges(entry: AuditEntry): string[] {
  if (entry.action !== 'update') return []
  return Object.entries(entry.changes)
    .filter(([key]) => FIELD_LABELS[key])
    .map(([key, pair]) => {
      const [before, after] = pair as [unknown, unknown]
      const label = FIELD_LABELS[key]
      if (key === 'owner_id') return `${label}：${session.memberName(before as string) || '空'} → ${session.memberName(after as string) || '空'}`
      return `${label}：${formatValue(before)} → ${formatValue(after)}`
    })
}
</script>

<template>
  <div v-loading="loading" class="page">
    <el-button link :icon="ArrowLeft" class="back" @click="router.back()">返回</el-button>

    <el-result v-if="!loading && notFound" icon="warning" title="客户不存在或已被删除" sub-title="如果是误删，可以在「设置 → 回收站」中恢复">
      <template #extra>
        <el-button type="primary" @click="router.replace('/customers')">返回客户列表</el-button>
      </template>
    </el-result>

    <template v-else-if="client">
      <el-card shadow="never">
        <div class="head">
          <div class="head-main">
            <h2>
              {{ client.name }}
              <el-tag v-if="client.long_term_partner" type="success" effect="plain" size="small">长期合作</el-tag>
            </h2>
            <div class="meta">
              <span>{{ [client.province, client.region].filter(Boolean).join(' · ') || '地区未填' }}</span>
              <span>负责人：{{ overview?.owner_name || session.memberName(client.owner_id) || '—' }}</span>
              <span>{{ devices.length }} 台设备</span>
              <span v-if="overview?.open_receivable_count" class="danger">
                欠款 {{ Number(overview.outstanding_total) > 0 ? formatMoney(overview.outstanding_total) : '（金额未登记）' }}
              </span>
            </div>
            <p v-if="client.notes" class="notes">{{ client.notes }}</p>
          </div>
          <div class="actions">
            <el-button type="primary" plain :icon="Plus" @click="followDialog = true">添加跟踪</el-button>
            <template v-if="canEdit">
              <el-button :icon="Edit" @click="clientDialog = true">编辑</el-button>
              <el-button type="danger" plain :icon="Delete" @click="deleteClient">删除</el-button>
            </template>
          </div>
        </div>
      </el-card>

      <el-card shadow="never">
        <el-tabs v-model="tab">
          <el-tab-pane :label="`装机记录 (${devices.length})`" name="devices">
            <div class="tab-actions">
              <el-button v-if="canEdit" type="primary" :icon="Plus" @click="addDevice">新增装机记录</el-button>
            </div>
            <el-empty v-if="!devices.length" description="还没有装机记录" />
            <div class="devices">
              <div v-for="d in devices" :key="d.id" class="device">
                <div class="device-head">
                  <strong>{{ d.address || '（未填地址）' }}</strong>
                  <DueTag :days="d.days_until_due" :date="d.next_due_on" />
                </div>
                <el-descriptions :column="2" size="small" class="desc">
                  <el-descriptions-item label="联系人">{{ d.contact_person || '—' }}</el-descriptions-item>
                  <el-descriptions-item label="电话"><PhoneLinks :phone="d.phone" /></el-descriptions-item>
                  <el-descriptions-item label="型号">{{ d.model || '—' }}{{ d.quantity ? ` × ${d.quantity}` : '' }}</el-descriptions-item>
                  <el-descriptions-item label="安装位置">{{ d.location || '—' }}</el-descriptions-item>
                  <el-descriptions-item label="装机时间">{{ d.install_date || '—' }}</el-descriptions-item>
                  <el-descriptions-item label="滤芯购买">{{ d.filter_purchase_date || '—' }}</el-descriptions-item>
                  <el-descriptions-item label="上次服务">{{ d.last_service_on || '—' }}</el-descriptions-item>
                  <el-descriptions-item label="周期">
                    {{ d.effective_interval_days }} 天{{ d.interval_days ? '' : '（默认）' }}{{ d.stage_count ? ` · ${d.stage_count} 级分级` : '' }}
                  </el-descriptions-item>
                </el-descriptions>
                <div class="badges">
                  <el-tag v-if="d.open_receivable_count" size="small" type="danger" effect="plain">待收款</el-tag>
                  <el-tag v-if="d.need_water_test" size="small" type="primary" effect="plain">需验水</el-tag>
                  <span v-if="d.notes" class="sub">备注：{{ d.notes }}</span>
                </div>
                <div class="device-actions">
                  <el-button size="small" type="primary" @click="registerReplacement(d)">登记换芯</el-button>
                  <template v-if="canEdit">
                    <el-button size="small" @click="editDevice(d)">编辑</el-button>
                    <el-button size="small" type="danger" link @click="deleteDevice(d)">删除</el-button>
                  </template>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="`换芯记录 (${replacements.length})`" name="replacements">
            <el-table :data="replacements" empty-text="还没有换芯记录" size="small">
              <el-table-column prop="replaced_on" label="日期" width="110">
                <template #default="{ row }">{{ row.replaced_on || '日期未填' }}</template>
              </el-table-column>
              <el-table-column label="设备" min-width="160" show-overflow-tooltip>
                <template #default="{ row }">{{ deviceAddress.get(row.device_id) ?? '（已删除的设备）' }}</template>
              </el-table-column>
              <el-table-column prop="filter_model" label="滤芯型号" min-width="120" />
              <el-table-column prop="quantity" label="数量" width="70" align="center" />
              <el-table-column label="费用" width="100" align="right">
                <template #default="{ row }">{{ formatMoney(row.cost) }}</template>
              </el-table-column>
              <el-table-column prop="operator_name" label="操作人" width="100" />
              <el-table-column prop="notes" label="备注" min-width="140" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>

          <el-tab-pane :label="`跟踪记录 (${followUps.length})`" name="follow">
            <div class="tab-actions">
              <el-button type="primary" :icon="Plus" @click="followDialog = true">添加跟踪</el-button>
            </div>
            <el-empty v-if="!followUps.length" description="还没有跟踪记录" />
            <el-timeline>
              <el-timeline-item v-for="f in followUps" :key="f.id" :timestamp="f.followed_on || '日期未填'" placement="top">
                <div class="follow">{{ f.content }}</div>
                <div class="sub">{{ f.operator_name }}</div>
              </el-timeline-item>
            </el-timeline>
          </el-tab-pane>

          <el-tab-pane :label="`应收 (${receivables.filter((r) => !r.settled).length})`" name="receivables">
            <el-table :data="receivables" empty-text="没有应收款" size="small">
              <el-table-column prop="title" label="项目" min-width="140" />
              <el-table-column label="设备" min-width="140" show-overflow-tooltip>
                <template #default="{ row }">{{ row.device_id ? (deviceAddress.get(row.device_id) ?? '—') : '—' }}</template>
              </el-table-column>
              <el-table-column label="应收" width="100" align="right">
                <template #default="{ row }">{{ row.amount === null ? '未登记' : formatMoney(row.amount) }}</template>
              </el-table-column>
              <el-table-column label="已收" width="100" align="right">
                <template #default="{ row }">{{ formatMoney(row.paid_amount) }}</template>
              </el-table-column>
              <el-table-column label="状态" width="170">
                <template #default="{ row }">
                  <el-tag v-if="row.settled" type="success" size="small">已结清</el-tag>
                  <span v-else :class="{ danger: (row.days_until_remind ?? 1) <= 0 }">{{ describeRemind(row.days_until_remind) }}</span>
                </template>
              </el-table-column>
            </el-table>
            <p class="sub">登记收款请到「收款」页面（阶段 3 完善）。</p>
          </el-tab-pane>

          <el-tab-pane label="操作日志" name="audit">
            <p class="sub">{{ session.isAdmin ? '该客户的全部操作记录' : '你本人对该客户的操作记录' }}（最近 100 条）</p>
            <el-timeline>
              <el-timeline-item v-for="a in audit" :key="a.id" :timestamp="formatBeijingDateTime(a.at)" placement="top">
                <div>
                  <strong>{{ a.actor_id ? session.memberName(a.actor_id) || '未知成员' : '系统' }}</strong>
                  {{ AUDIT_ACTIONS[a.action] ?? a.action }}了{{ TABLE_LABELS[a.table_name] ?? a.table_name }}
                </div>
                <ul v-if="describeChanges(a).length" class="changes">
                  <li v-for="line in describeChanges(a)" :key="line">{{ line }}</li>
                </ul>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-if="!audit.length" description="暂无操作记录" />
          </el-tab-pane>
        </el-tabs>
      </el-card>
    </template>

    <ClientFormDialog v-model="clientDialog" :client="client" @saved="load" />
    <DeviceFormDialog v-model="deviceDialog" :device="editingDevice" :client-id="client?.id" @saved="load" />
    <ReplacementFormDialog v-model="replacementDialog" :device="replacementDevice" @saved="load" />
    <FollowUpFormDialog v-model="followDialog" :client-id="client?.id ?? null" :client-name="client?.name" @saved="load" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}
.back {
  align-self: flex-start;
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
h2 {
  margin: 0 0 6px;
  font-size: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.notes {
  margin: 8px 0 0;
  font-size: 13px;
  white-space: pre-wrap;
}
.actions {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.tab-actions {
  margin-bottom: 12px;
}
.devices {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 12px;
}
.device {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.device-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.desc :deep(.el-descriptions__label) {
  color: var(--el-text-color-secondary);
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.device-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}
.follow {
  white-space: pre-wrap;
}
.changes {
  margin: 4px 0 0;
  padding-left: 18px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.sub {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.danger {
  color: var(--el-color-danger);
}
@media (max-width: 768px) {
  .devices {
    grid-template-columns: 1fr;
  }
}
</style>
