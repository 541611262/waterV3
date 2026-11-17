<script setup lang="ts">
// 新建 / 编辑应收款
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createReceivable, listClientDevices, updateReceivable } from '@/api/data'
import type { DeviceOverview, ReceivableOverview } from '@/api/types'
import ClientPicker from '@/components/ClientPicker.vue'
import { DEFAULT_UNPAID_INTERVAL } from '@/config'
import { todayStr } from '@/lib/dates'

const props = defineProps<{ receivable?: ReceivableOverview | null; clientId?: string | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const saving = ref(false)
const devices = ref<DeviceOverview[]>([])
const form = reactive({
  client_id: '',
  device_id: null as string | null,
  title: '',
  amount: null as number | null,
  billed_on: todayStr() as string | null,
  remind_interval_days: null as number | null,
  notes: '',
})

watch(open, (value) => {
  if (!value) return
  const r = props.receivable
  Object.assign(form, {
    client_id: r?.client_id ?? props.clientId ?? '',
    device_id: r?.device_id ?? null,
    title: r?.title ?? '',
    amount: r?.amount === null || r?.amount === undefined ? null : Number(r.amount),
    billed_on: r ? r.billed_on : todayStr(),
    remind_interval_days: r?.remind_interval_days ?? null,
    notes: r?.notes ?? '',
  })
})

watch(
  () => form.client_id,
  async (id) => {
    devices.value = id ? await listClientDevices(id).catch(() => []) : []
  },
)

async function save() {
  if (!form.client_id) return ElMessage.warning('请选择客户')
  if (!form.title.trim()) return ElMessage.warning('请填写收款项目，如"换芯费""设备款"')
  saving.value = true
  try {
    const input = {
      device_id: form.device_id,
      title: form.title.trim(),
      amount: form.amount,
      billed_on: form.billed_on,
      remind_interval_days: form.remind_interval_days || null,
      notes: form.notes.trim(),
    }
    if (props.receivable) await updateReceivable(props.receivable.id, props.receivable.version, input)
    else await createReceivable(form.client_id, input)
    ElMessage.success('应收款已保存')
    open.value = false
    emit('saved')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="receivable ? '编辑应收款' : '新建应收款'" width="min(520px, 94vw)" append-to-body>
    <el-form label-width="96px" class="form" @submit.prevent="save">
      <el-form-item label="客户" required>
        <ClientPicker v-if="!receivable" v-model="form.client_id" />
        <span v-else>{{ receivable.client_name }}</span>
      </el-form-item>
      <el-form-item label="关联设备">
        <el-select v-model="form.device_id" clearable placeholder="可不选">
          <el-option v-for="d in devices" :key="d.id" :label="d.address || d.location || d.model || '（未填地址）'" :value="d.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="收款项目" required>
        <el-input v-model="form.title" maxlength="100" placeholder="如：换芯费、设备款、维修费" />
      </el-form-item>
      <el-form-item label="应收金额">
        <el-input-number v-model="form.amount" :min="0" :precision="2" :step="100" controls-position="right" :value-on-clear="null" placeholder="不确定可先不填" />
      </el-form-item>
      <el-form-item label="开单日期">
        <el-date-picker v-model="form.billed_on" type="date" value-format="YYYY-MM-DD" />
      </el-form-item>
      <el-form-item label="催款周期(天)">
        <el-input-number
          v-model="form.remind_interval_days"
          :min="1"
          :max="3650"
          controls-position="right"
          :value-on-clear="null"
          :placeholder="`默认 ${DEFAULT_UNPAID_INTERVAL}`"
        />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form :deep(.el-select),
.form :deep(.el-date-editor),
.form :deep(.el-input-number) {
  width: 100%;
}
</style>
