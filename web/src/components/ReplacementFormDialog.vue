<script setup lang="ts">
// 登记换芯：可选择更换的是哪一级滤芯（或整机）；有费用且未收款时可同时登记应收款
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createReceivable, createReplacement, listStages } from '@/api/data'
import type { FilterStageOverview } from '@/api/types'
import { todayStr } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{
  device: { id: string; client_id: string; client_name?: string; address?: string; model?: string; quantity?: number | null } | null
  workOrderId?: string | null
}>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const session = useSessionStore()
const saving = ref(false)
const stages = ref<FilterStageOverview[]>([])
const form = reactive({
  replaced_on: todayStr(),
  stage_id: '' as string,
  filter_model: '',
  quantity: 1 as number | null,
  cost: 0 as number | null,
  operator_name: '',
  notes: '',
  unpaid: false,
})

const title = computed(() =>
  props.device ? `登记换芯 · ${props.device.client_name ?? ''}${props.device.address ? ' · ' + props.device.address : ''}` : '登记换芯',
)

watch(open, async (value) => {
  if (!value || !props.device) return
  Object.assign(form, {
    replaced_on: todayStr(),
    stage_id: '',
    filter_model: props.device.model ? `${props.device.model} 滤芯` : '',
    quantity: props.device.quantity || 1,
    cost: 0,
    operator_name: session.member?.username ?? '',
    notes: '',
    unpaid: false,
  })
  stages.value = []
  try {
    stages.value = await listStages(props.device.id)
  } catch {
    // 没有分级时忽略
  }
})

async function save() {
  if (!props.device) return
  if (!form.replaced_on) {
    ElMessage.warning('请选择更换日期')
    return
  }
  saving.value = true
  try {
    await createReplacement({
      device_id: props.device.id,
      stage_id: form.stage_id || null,
      work_order_id: props.workOrderId ?? null,
      replaced_on: form.replaced_on,
      filter_model: form.filter_model.trim(),
      quantity: form.quantity || 1,
      cost: form.cost || 0,
      operator_name: form.operator_name.trim(),
      notes: form.notes.trim(),
    })
    if (form.unpaid && form.cost) {
      await createReceivable(props.device.client_id, {
        device_id: props.device.id,
        title: `换芯费 ${form.replaced_on}`,
        amount: form.cost,
        billed_on: form.replaced_on,
        remind_interval_days: null,
        notes: '',
      })
    }
    ElMessage.success(form.unpaid && form.cost ? '换芯已登记，并已记入应收款' : '换芯已登记')
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
  <el-dialog v-model="open" :title="title" width="min(520px, 94vw)" append-to-body>
    <el-form label-width="96px" class="form" @submit.prevent="save">
      <el-form-item label="更换日期" required>
        <el-date-picker v-model="form.replaced_on" type="date" value-format="YYYY-MM-DD" :clearable="false" />
      </el-form-item>
      <el-form-item v-if="stages.length" label="更换哪一级">
        <el-radio-group v-model="form.stage_id">
          <el-radio-button value="">整机全部</el-radio-button>
          <el-radio-button v-for="s in stages" :key="s.id" :value="s.id">{{ s.name }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="滤芯型号">
        <el-input v-model="form.filter_model" maxlength="100" />
      </el-form-item>
      <el-form-item label="数量">
        <el-input-number v-model="form.quantity" :min="1" :max="100000" controls-position="right" />
      </el-form-item>
      <el-form-item label="费用(元)">
        <el-input-number v-model="form.cost" :min="0" :precision="2" :step="10" controls-position="right" />
      </el-form-item>
      <el-form-item v-if="form.cost" label="">
        <el-checkbox v-model="form.unpaid">还没收款，记入应收款（之后在「收款」里登记收款）</el-checkbox>
      </el-form-item>
      <el-form-item label="操作人">
        <el-input v-model="form.operator_name" maxlength="50" />
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">登记</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form :deep(.el-date-editor),
.form :deep(.el-input-number) {
  width: 100%;
}
</style>
