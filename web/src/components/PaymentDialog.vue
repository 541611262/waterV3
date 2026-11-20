<script setup lang="ts">
// 登记收款：默认收全部余额；金额未登记的应收可以同时补登应收金额
import { ElMessage } from 'element-plus'
import { computed, reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createPayment, listPayments, updateReceivable } from '@/api/data'
import type { Payment, ReceivableOverview } from '@/api/types'
import { todayStr } from '@/lib/dates'
import { formatMoney } from '@/lib/format'

const props = defineProps<{ receivable: ReceivableOverview | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [] }>()

const METHODS = ['微信', '支付宝', '银行转账', '现金', '对公账户', '其他']
const saving = ref(false)
const history = ref<Payment[]>([])
const form = reactive({ amount: null as number | null, total: null as number | null, paid_on: todayStr(), method: '微信', notes: '' })

const unknownAmount = computed(() => props.receivable?.amount === null)
const outstanding = computed(() => (props.receivable ? Number(props.receivable.outstanding ?? 0) : 0))

watch(open, async (value) => {
  const r = props.receivable
  if (!value || !r) return
  Object.assign(form, { amount: unknownAmount.value ? null : outstanding.value || null, total: null, paid_on: todayStr(), method: '微信', notes: '' })
  history.value = await listPayments(r.id).catch(() => [])
})

async function save() {
  const r = props.receivable
  if (!r) return
  if (!form.amount || form.amount <= 0) return ElMessage.warning('请填写收款金额')
  saving.value = true
  try {
    if (unknownAmount.value && form.total) await updateReceivable(r.id, r.version, { amount: form.total })
    await createPayment(r.id, { amount: form.amount, paid_on: form.paid_on, method: form.method, notes: form.notes.trim() })
    ElMessage.success(`已登记收款 ${formatMoney(form.amount)}`)
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
  <el-dialog v-model="open" title="登记收款" width="min(500px, 94vw)" append-to-body>
    <template v-if="receivable">
      <div class="summary">
        <div>
          <strong>{{ receivable.client_name }}</strong>
          <span>{{ receivable.title }}</span>
        </div>
        <div class="figures num">
          <div><span>应收</span>{{ unknownAmount ? '未登记' : formatMoney(receivable.amount) }}</div>
          <div><span>已收</span>{{ formatMoney(receivable.paid_amount) }}</div>
          <div v-if="!unknownAmount" class="due"><span>未收</span>{{ formatMoney(receivable.outstanding) }}</div>
        </div>
      </div>
      <el-form label-width="96px" class="form" @submit.prevent="save">
        <el-form-item v-if="unknownAmount" label="应收总额">
          <el-input-number v-model="form.total" :min="0" :precision="2" controls-position="right" :value-on-clear="null" placeholder="顺便补登应收总额（可不填）" />
        </el-form-item>
        <el-form-item label="本次收款" required>
          <el-input-number v-model="form.amount" :min="0.01" :precision="2" :step="100" controls-position="right" :value-on-clear="null" />
        </el-form-item>
        <el-form-item label="收款日期">
          <el-date-picker v-model="form.paid_on" type="date" value-format="YYYY-MM-DD" :clearable="false" />
        </el-form-item>
        <el-form-item label="收款方式">
          <el-radio-group v-model="form.method">
            <el-radio-button v-for="m in METHODS" :key="m" :value="m">{{ m }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.notes" maxlength="200" placeholder="如：转账尾号、收据号" />
        </el-form-item>
      </el-form>
      <div v-if="history.length" class="history">
        <div class="history-title">历史收款</div>
        <div v-for="p in history" :key="p.id" class="history-item">
          <span>{{ p.paid_on }}</span>
          <span>{{ p.method }}</span>
          <strong class="num">{{ formatMoney(p.amount) }}</strong>
          <span class="text-muted">{{ p.notes }}</span>
        </div>
      </div>
    </template>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">登记收款</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.summary {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  margin-bottom: 16px;
}
.summary > div:first-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.summary > div:first-child span {
  font-size: 13px;
  color: var(--app-text-2);
}
.figures {
  display: flex;
  gap: 16px;
  text-align: right;
  font-weight: 600;
}
.figures span {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--app-text-3);
}
.figures .due {
  color: var(--tone-danger);
}
.form :deep(.el-date-editor),
.form :deep(.el-input-number) {
  width: 100%;
}
.history {
  border-top: 1px solid var(--app-border);
  padding-top: 10px;
  font-size: 13px;
}
.history-title {
  font-weight: 600;
  margin-bottom: 6px;
}
.history-item {
  display: flex;
  gap: 12px;
  padding: 4px 0;
}
</style>
