<script setup lang="ts">
// 新建 / 编辑工单：选择客户和设备、类型、指派给谁、预约日期
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createWorkOrder, listClientDevices, updateWorkOrder, type WorkOrderInput } from '@/api/data'
import type { DeviceOverview, WorkOrder, WorkOrderType } from '@/api/types'
import ClientPicker from '@/components/ClientPicker.vue'
import { WORK_ORDER_TYPES } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  order?: WorkOrder | null
  /** 从设备发起派单时预填 */
  preset?: { client_id: string; device_id?: string | null; type?: WorkOrderType; title?: string } | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [order: WorkOrder] }>()

const session = useSessionStore()
const saving = ref(false)
const devices = ref<DeviceOverview[]>([])
const form = reactive<WorkOrderInput>({
  client_id: '',
  device_id: null,
  type: 'replacement',
  assignee_id: null,
  scheduled_on: null,
  title: '',
  description: '',
})
const titleTouched = ref(false)

watch(open, (value) => {
  if (!value) return
  const o = props.order
  const p = props.preset
  Object.assign(form, {
    client_id: o?.client_id ?? p?.client_id ?? '',
    device_id: o?.device_id ?? p?.device_id ?? null,
    type: o?.type ?? p?.type ?? 'replacement',
    assignee_id: o?.assignee_id ?? session.uid,
    scheduled_on: o?.scheduled_on ?? null,
    title: o?.title ?? p?.title ?? '',
    description: o?.description ?? '',
  })
  titleTouched.value = Boolean(o?.title || p?.title)
})

watch(
  () => form.client_id,
  async (id, old) => {
    devices.value = id ? await listClientDevices(id).catch(() => []) : []
    if (old && id !== old) form.device_id = null
  },
)

const device = computed(() => devices.value.find((d) => d.id === form.device_id) ?? null)

// 标题自动生成：类型 + 设备位置，手动改过后不再覆盖
watch([() => form.type, device], () => {
  if (titleTouched.value) return
  const where = device.value ? device.value.address || device.value.location || device.value.model : ''
  form.title = `${WORK_ORDER_TYPES[form.type]}${where ? ' · ' + where : ''}`
})

async function save() {
  if (!form.client_id) return ElMessage.warning('请选择客户')
  if (!form.title.trim()) return ElMessage.warning('请填写工单标题')
  saving.value = true
  try {
    const input = { ...form, title: form.title.trim(), description: form.description.trim() }
    const saved = props.order ? await updateWorkOrder(props.order.id, props.order.version, input) : await createWorkOrder(input)
    ElMessage.success(props.order ? '工单已保存' : `工单 #${saved.order_no} 已创建${form.assignee_id && form.assignee_id !== session.uid ? '并派给 ' + session.memberName(form.assignee_id) : ''}`)
    open.value = false
    emit('saved', saved)
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="order ? `编辑工单 #${order.order_no}` : '新建工单'" width="min(560px, 94vw)" append-to-body>
    <el-form label-width="84px" class="form" @submit.prevent="save">
      <el-form-item label="客户" required>
        <ClientPicker v-model="form.client_id" />
      </el-form-item>
      <el-form-item label="设备">
        <el-select v-model="form.device_id" clearable placeholder="不指定设备（如整体维护、催款）" :disabled="!form.client_id">
          <el-option v-for="d in devices" :key="d.id" :label="d.address || d.location || d.model || '（未填地址）'" :value="d.id">
            <span>{{ d.address || d.location || '（未填地址）' }}</span>
            <span class="opt-sub">{{ d.model }}{{ d.next_due_on ? ` · 到期 ${d.next_due_on}` : '' }}</span>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="类型">
        <el-radio-group v-model="form.type">
          <el-radio-button v-for="(label, key) in WORK_ORDER_TYPES" :key="key" :value="key">{{ label }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="指派给">
        <el-select v-model="form.assignee_id" filterable clearable placeholder="暂不指派">
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.uid === session.uid ? `${m.username}（我）` : m.username" :value="m.uid" />
        </el-select>
      </el-form-item>
      <el-form-item label="预约日期">
        <el-date-picker v-model="form.scheduled_on" type="date" value-format="YYYY-MM-DD" placeholder="上门日期（可不填）" />
      </el-form-item>
      <el-form-item label="标题" required>
        <el-input v-model="form.title" maxlength="100" @input="titleTouched = true" />
      </el-form-item>
      <el-form-item label="说明">
        <el-input v-model="form.description" type="textarea" :rows="3" maxlength="1000" placeholder="需要带的滤芯型号、注意事项等" />
      </el-form-item>
      <el-alert
        v-if="form.assignee_id && form.assignee_id !== session.uid"
        type="info"
        :closable="false"
        :title="`${session.memberName(form.assignee_id)} 将能看到这个客户的资料，并登记换芯和收款；工单取消后权限自动收回。`"
      />
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">{{ order ? '保存' : '创建工单' }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form :deep(.el-select),
.form :deep(.el-date-editor) {
  width: 100%;
}
.opt-sub {
  float: right;
  margin-left: 12px;
  font-size: 12px;
  color: var(--app-text-3);
}
</style>
