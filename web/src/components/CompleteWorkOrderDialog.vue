<script setup lang="ts">
// 完成工单：填写处理结果；换芯工单可同时登记换芯（自动关联工单），有费用未收时记入应收
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createReceivable, createReplacement, listStages, updateWorkOrder, type WorkOrderRow } from '@/api/data'
import type { FilterStageOverview } from '@/api/types'
import { todayStr } from '@/lib/dates'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ order: WorkOrderRow | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const saving = ref(false)
const stages = ref<FilterStageOverview[]>([])
const form = reactive({
  result: '',
  register: true,
  replaced_on: todayStr(),
  stage_id: '',
  filter_model: '',
  quantity: 1,
  cost: 0,
  unpaid: false,
})

const canRegister = computed(() => Boolean(props.order?.device_id))

watch(open, async (value) => {
  const o = props.order
  if (!value || !o) return
  Object.assign(form, {
    result: '',
    register: o.type === 'replacement' && Boolean(o.device_id),
    replaced_on: todayStr(),
    stage_id: '',
    filter_model: o.devices?.model ? `${o.devices.model} 滤芯` : '',
    quantity: 1,
    cost: 0,
    unpaid: false,
  })
  stages.value = o.device_id ? await listStages(o.device_id).catch(() => []) : []
})

async function complete() {
  const o = props.order
  if (!o) return
  saving.value = true
  try {
    if (form.register && o.device_id) {
      await createReplacement({
        device_id: o.device_id,
        stage_id: form.stage_id || null,
        work_order_id: o.id,
        replaced_on: form.replaced_on,
        filter_model: form.filter_model.trim(),
        quantity: form.quantity || 1,
        cost: form.cost || 0,
        operator_name: session.member?.username ?? '',
        notes: `工单 #${o.order_no}`,
      })
      if (form.unpaid && form.cost) {
        await createReceivable(o.client_id, {
          device_id: o.device_id,
          title: `换芯费 ${form.replaced_on}（工单 #${o.order_no}）`,
          amount: form.cost,
          billed_on: form.replaced_on,
          remind_interval_days: null,
          notes: '',
        })
      }
    }
    await updateWorkOrder(o.id, o.version, { status: 'done', result: form.result.trim() })
    ElMessage.success(`工单 #${o.order_no} 已完成${form.register && o.device_id ? '，换芯已登记' : ''}`)
    open.value = false
    emit('done')
  } catch (error) {
    ElMessage.error(describeError(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog v-model="open" :title="order ? `完成工单 #${order.order_no}` : '完成工单'" width="min(520px, 94vw)" append-to-body>
    <el-form v-if="order" label-width="96px" class="form" @submit.prevent="complete">
      <div class="summary">
        <strong>{{ order.clients?.name }}</strong>
        <span>{{ order.title }}</span>
      </div>
      <el-form-item label="处理结果">
        <el-input v-model="form.result" type="textarea" :rows="3" maxlength="1000" placeholder="如：已更换全部滤芯，水质正常" />
      </el-form-item>
      <el-form-item v-if="canRegister" label="登记换芯">
        <el-switch v-model="form.register" active-text="同时登记换芯，设备重新计算到期" />
      </el-form-item>
      <template v-if="form.register && canRegister">
        <el-form-item label="更换日期">
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
          <el-checkbox v-model="form.unpaid">还没收款，记入应收款</el-checkbox>
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="complete">完成工单</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 14px;
  margin-bottom: 16px;
  border-radius: 10px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
}
.summary span {
  font-size: 13px;
  color: var(--app-text-2);
}
.form :deep(.el-date-editor),
.form :deep(.el-input-number) {
  width: 100%;
}
</style>
