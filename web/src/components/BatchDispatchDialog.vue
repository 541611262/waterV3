<script setup lang="ts">
// 批量派单：为选中的每台设备生成一张工单，指派给同一位同事
import { ElMessage } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createWorkOrders } from '@/api/data'
import type { DeviceOverview, WorkOrderType } from '@/api/types'
import { WORK_ORDER_TYPES } from '@/lib/format'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ devices: DeviceOverview[] }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ done: [] }>()

const session = useSessionStore()
const saving = ref(false)
const form = reactive({ type: 'replacement' as WorkOrderType, assignee_id: '' as string, scheduled_on: null as string | null, description: '' })

watch(open, (value) => {
  if (value) Object.assign(form, { type: 'replacement', assignee_id: session.uid, scheduled_on: null, description: '' })
})

async function save() {
  if (!props.devices.length) return
  saving.value = true
  try {
    const created = await createWorkOrders(
      props.devices.map((d) => ({
        client_id: d.client_id,
        device_id: d.id,
        type: form.type,
        assignee_id: form.assignee_id || null,
        scheduled_on: form.scheduled_on,
        title: `${WORK_ORDER_TYPES[form.type]} · ${d.address || d.location || d.model || d.client_name}`,
        description: form.description.trim(),
      })),
    )
    ElMessage.success(`已生成 ${created.length} 张工单${form.assignee_id ? '，指派给 ' + session.memberName(form.assignee_id) : ''}`)
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
  <el-dialog v-model="open" :title="`批量派单（${devices.length} 台设备）`" width="min(520px, 94vw)" append-to-body>
    <el-form label-width="84px" class="form" @submit.prevent="save">
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
        <el-date-picker v-model="form.scheduled_on" type="date" value-format="YYYY-MM-DD" placeholder="可不填" />
      </el-form-item>
      <el-form-item label="说明">
        <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
      </el-form-item>
      <div class="preview">
        <div v-for="d in devices.slice(0, 6)" :key="d.id" class="preview-item">
          <strong>{{ d.client_name }}</strong>
          <span>{{ d.address || d.location || '—' }}</span>
        </div>
        <div v-if="devices.length > 6" class="text-muted">…等 {{ devices.length }} 台</div>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">生成 {{ devices.length }} 张工单</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form :deep(.el-select),
.form :deep(.el-date-editor) {
  width: 100%;
}
.preview {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--app-surface-muted);
  border: 1px solid var(--app-border);
  font-size: 13px;
}
.preview-item {
  display: flex;
  gap: 8px;
}
.preview-item span {
  color: var(--app-text-2);
}
</style>
