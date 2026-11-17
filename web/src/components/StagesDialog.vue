<script setup lang="ts">
// 滤芯分级：一台设备的每一级滤芯各自的周期。设置后，设备按"最早到期的一级"提醒
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createStage, findStagesByModel, listStages, softDelete, updateStage } from '@/api/data'
import type { DeviceOverview, FilterStageOverview } from '@/api/types'
import DueTag from '@/components/DueTag.vue'

const props = defineProps<{ device: DeviceOverview | null; canEdit: boolean }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ changed: [] }>()

/** 常见配置模板（周期可在添加后逐级修改） */
const TEMPLATES: { name: string; stages: { name: string; interval_days: number }[] }[] = [
  {
    name: 'RO 反渗透五级',
    stages: [
      { name: 'PP 棉', interval_days: 90 },
      { name: '颗粒活性炭', interval_days: 180 },
      { name: '压缩活性炭', interval_days: 180 },
      { name: 'RO 膜', interval_days: 730 },
      { name: '后置活性炭', interval_days: 365 },
    ],
  },
  {
    name: '超滤三级',
    stages: [
      { name: 'PP 棉', interval_days: 90 },
      { name: '活性炭', interval_days: 180 },
      { name: '超滤膜', interval_days: 365 },
    ],
  },
  {
    name: '商用直饮机',
    stages: [
      { name: '前置过滤', interval_days: 90 },
      { name: '复合滤芯', interval_days: 180 },
      { name: 'RO 膜', interval_days: 730 },
    ],
  },
]

const loading = ref(false)
const saving = ref(false)
const stages = ref<FilterStageOverview[]>([])
const sameModel = ref<{ device_id: string; stages: FilterStageOverview[] } | null>(null)
const draft = reactive({ name: '', interval_days: 90 as number | null, started_on: null as string | null })

async function load() {
  if (!props.device) return
  loading.value = true
  try {
    stages.value = await listStages(props.device.id)
    sameModel.value = stages.value.length ? null : await findStagesByModel(props.device.model, props.device.id).catch(() => null)
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    loading.value = false
  }
}

watch(open, (value) => value && load())

async function addMany(items: { name: string; interval_days: number }[]) {
  if (!props.device) return
  saving.value = true
  try {
    const start = stages.value.length
    for (const [i, item] of items.entries()) {
      await createStage(props.device.id, { position: start + i + 1, name: item.name, interval_days: item.interval_days, started_on: null, notes: '' })
    }
    ElMessage.success(`已添加 ${items.length} 级滤芯`)
    await load()
    emit('changed')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    saving.value = false
  }
}

async function addOne() {
  if (!draft.name.trim() || !draft.interval_days) return ElMessage.warning('请填写滤芯名称和周期')
  await addMany([{ name: draft.name.trim(), interval_days: draft.interval_days }])
  Object.assign(draft, { name: '', interval_days: 90, started_on: null })
}

async function saveRow(s: FilterStageOverview, patch: Partial<Pick<FilterStageOverview, 'name' | 'interval_days' | 'started_on'>>) {
  try {
    await updateStage(s.id, s.version, patch)
    await load()
    emit('changed')
  } catch (error) {
    ElMessage.error(describeError(error))
    await load()
  }
}

async function remove(s: FilterStageOverview) {
  try {
    await ElMessageBox.confirm(`删除「${s.name}」这一级？已有的换芯记录不受影响。`, '删除滤芯级别', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' })
  } catch {
    return
  }
  try {
    await softDelete('filter_stages', s.id, s.version)
    await load()
    emit('changed')
  } catch (error) {
    ElMessage.error(describeError(error))
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="`滤芯分级 · ${device?.address || device?.model || ''}`" width="min(720px, 96vw)" append-to-body>
    <p class="intro">
      每一级滤芯单独计算周期，设备按<strong>最早到期的一级</strong>提醒。登记换芯时可以选择只换某一级；选「整机全部」则所有级重新计时。
      没有设置分级时，按设备的统一周期（{{ device?.effective_interval_days }} 天）计算。
    </p>

    <div v-loading="loading">
      <el-table v-if="stages.length" :data="stages" size="small" class="stages">
        <el-table-column label="级" width="48" align="center">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column label="滤芯" min-width="140">
          <template #default="{ row }">
            <el-input v-if="canEdit" :model-value="row.name" size="small" @change="(v: string) => v.trim() && saveRow(row as FilterStageOverview, { name: v.trim() })" />
            <span v-else>{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="周期(天)" width="130">
          <template #default="{ row }">
            <el-input-number
              v-if="canEdit"
              :model-value="row.interval_days"
              size="small"
              :min="1"
              :max="3650"
              controls-position="right"
              @change="(v: number | undefined) => v && saveRow(row as FilterStageOverview, { interval_days: v })"
            />
            <span v-else>{{ row.interval_days }}</span>
          </template>
        </el-table-column>
        <el-table-column label="上次更换" width="110">
          <template #default="{ row }">{{ row.last_service_on || '—' }}</template>
        </el-table-column>
        <el-table-column label="下次到期" width="150">
          <template #default="{ row }">
            <DueTag :days="row.days_until_due" :date="row.next_due_on" />
          </template>
        </el-table-column>
        <el-table-column v-if="canEdit" width="50" align="center">
          <template #default="{ row }">
            <el-button link type="danger" :icon="Delete" @click="remove(row as FilterStageOverview)" />
          </template>
        </el-table-column>
      </el-table>

      <template v-if="canEdit">
        <div v-if="!stages.length" class="quick">
          <div class="quick-title">快速设置</div>
          <div class="templates">
            <button v-if="sameModel" class="template highlight" :disabled="saving" @click="addMany(sameModel.stages)">
              <strong>复制同型号（{{ device?.model }}）的设置</strong>
              <span>{{ sameModel.stages.map((s) => `${s.name} ${s.interval_days}天`).join(' · ') }}</span>
            </button>
            <button v-for="t in TEMPLATES" :key="t.name" class="template" :disabled="saving" @click="addMany(t.stages)">
              <strong>{{ t.name }}</strong>
              <span>{{ t.stages.map((s) => `${s.name} ${s.interval_days}天`).join(' · ') }}</span>
            </button>
          </div>
        </div>

        <div class="add-row">
          <el-input v-model="draft.name" placeholder="滤芯名称，如 PP 棉" maxlength="50" />
          <el-input-number v-model="draft.interval_days" :min="1" :max="3650" controls-position="right" placeholder="周期(天)" />
          <el-button :icon="Plus" :loading="saving" @click="addOne">添加一级</el-button>
        </div>
      </template>
      <el-empty v-else-if="!stages.length" description="这台设备没有设置滤芯分级" :image-size="64" />
    </div>
  </el-dialog>
</template>

<style scoped>
.intro {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--app-text-2);
}
.stages {
  margin-bottom: 14px;
}
.stages :deep(.el-input-number) {
  width: 110px;
}
.quick-title {
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 8px;
}
.templates {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}
.template {
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text);
  cursor: pointer;
  transition: all 0.15s;
  font: inherit;
}
.template:hover {
  border-color: var(--brand-500);
  box-shadow: var(--app-shadow-md);
}
.template.highlight {
  border-color: var(--el-color-primary-light-5);
  background: var(--brand-50);
}
.template span {
  font-size: 12px;
  color: var(--app-text-2);
  line-height: 1.5;
}
.add-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.add-row .el-input {
  flex: 1;
}
.add-row .el-input-number {
  width: 140px;
}
</style>
