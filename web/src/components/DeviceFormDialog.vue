<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createDevice, updateDevice, type DeviceInput } from '@/api/data'
import type { Device } from '@/api/types'
import ClientPicker from '@/components/ClientPicker.vue'
import { DEFAULT_REPLACEMENT_INTERVAL } from '@/config'

const props = defineProps<{
  /** 编辑时传入；新增时为空 */
  device?: Pick<Device, 'id' | 'version' | 'client_id' | keyof DeviceInput> | null
  /** 新增时固定的客户；为空时显示客户选择器 */
  clientId?: string | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [device: Device] }>()

const saving = ref(false)
const targetClient = ref('')
const empty = (): DeviceInput => ({
  address: '',
  contact_person: '',
  phone: '',
  install_date: null,
  model: '',
  quantity: null,
  location: '',
  filter_purchase_date: null,
  interval_days: null,
  need_water_test: false,
  notes: '',
})
const form = reactive<DeviceInput>(empty())

watch(open, (value) => {
  if (!value) return
  const d = props.device
  Object.assign(form, empty(), d ? pickInput(d) : {})
  targetClient.value = d?.client_id ?? props.clientId ?? ''
})

function pickInput(d: DeviceInput): DeviceInput {
  const result = empty()
  for (const key of Object.keys(result) as (keyof DeviceInput)[]) {
    ;(result as unknown as Record<string, unknown>)[key] = d[key]
  }
  return result
}

async function save() {
  if (!targetClient.value) {
    ElMessage.warning('请选择客户')
    return
  }
  saving.value = true
  try {
    const input = { ...form, interval_days: form.interval_days || null, quantity: form.quantity || null }
    const saved = props.device
      ? await updateDevice(props.device.id, props.device.version, { ...input, client_id: targetClient.value })
      : await createDevice(targetClient.value, input)
    ElMessage.success('装机记录已保存')
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
  <el-dialog v-model="open" :title="device ? '编辑装机记录' : '新增装机记录'" width="min(640px, 94vw)" append-to-body>
    <el-form :model="form" label-width="110px" class="device-form" @submit.prevent="save">
      <el-form-item v-if="!clientId || device" label="客户" required>
        <ClientPicker v-model="targetClient" />
      </el-form-item>
      <el-form-item label="装机地址">
        <el-input v-model="form.address" maxlength="200" />
      </el-form-item>
      <div class="grid">
        <el-form-item label="联系人">
          <el-input v-model="form.contact_person" maxlength="50" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" maxlength="100" />
        </el-form-item>
        <el-form-item label="型号">
          <el-input v-model="form.model" maxlength="50" />
        </el-form-item>
        <el-form-item label="数量">
          <el-input-number v-model="form.quantity" :min="1" :max="100000" controls-position="right" :value-on-clear="null" />
        </el-form-item>
        <el-form-item label="装机时间">
          <el-date-picker v-model="form.install_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="滤芯购买日期">
          <el-date-picker v-model="form.filter_purchase_date" type="date" value-format="YYYY-MM-DD" placeholder="选择日期" />
        </el-form-item>
        <el-form-item label="更换周期(天)">
          <el-input-number
            v-model="form.interval_days"
            :min="1"
            :max="3650"
            controls-position="right"
            :placeholder="`默认 ${DEFAULT_REPLACEMENT_INTERVAL}`"
            :value-on-clear="null"
          />
        </el-form-item>
        <el-form-item label="需要验水">
          <el-switch v-model="form.need_water_test" />
        </el-form-item>
      </div>
      <el-form-item label="安装位置">
        <el-input v-model="form.location" maxlength="100" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="1000" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 8px;
}
@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
.device-form :deep(.el-date-editor),
.device-form :deep(.el-input-number),
.device-form :deep(.el-select) {
  width: 100%;
}
</style>
