<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { reactive, ref, watch } from 'vue'
import { describeError } from '@/api/cloud'
import { createClient, updateClient, type ClientInput } from '@/api/data'
import type { Client } from '@/api/types'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ client?: Pick<Client, 'id' | 'version' | keyof ClientInput> | null }>()
const open = defineModel<boolean>({ required: true })
const emit = defineEmits<{ saved: [client: Client] }>()

const session = useSessionStore()
const formRef = ref<FormInstance>()
const saving = ref(false)
const form = reactive<ClientInput & { owner_id: string }>({
  name: '',
  province: '',
  region: '',
  long_term_partner: false,
  notes: '',
  owner_id: '',
})
const rules: FormRules = { name: [{ required: true, whitespace: true, message: '请填写客户名称', trigger: 'blur' }] }

watch(open, (value) => {
  if (!value) return
  const c = props.client
  Object.assign(form, {
    name: c?.name ?? '',
    province: c?.province ?? '',
    region: c?.region ?? '',
    long_term_partner: c?.long_term_partner ?? false,
    notes: c?.notes ?? '',
    owner_id: c?.owner_id ?? session.uid,
  })
  formRef.value?.clearValidate()
})

async function save() {
  if (!(await formRef.value?.validate().catch(() => false))) return
  saving.value = true
  try {
    const input: ClientInput = { ...form, name: form.name.trim() }
    if (!session.isAdmin) delete input.owner_id
    const saved = props.client ? await updateClient(props.client.id, props.client.version, input) : await createClient(input)
    ElMessage.success(props.client ? '客户已保存' : '客户已创建')
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
  <el-dialog v-model="open" :title="client ? '编辑客户' : '新建客户'" width="min(520px, 94vw)" append-to-body>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="96px" @submit.prevent="save">
      <el-form-item label="客户名称" prop="name">
        <el-input v-model="form.name" maxlength="100" placeholder="如：华南精密电子有限公司" />
      </el-form-item>
      <el-form-item label="省份">
        <el-input v-model="form.province" maxlength="20" />
      </el-form-item>
      <el-form-item label="区域">
        <el-input v-model="form.region" maxlength="50" placeholder="城市或片区" />
      </el-form-item>
      <el-form-item label="长期合作">
        <el-switch v-model="form.long_term_partner" />
      </el-form-item>
      <el-form-item v-if="session.isAdmin" label="负责人">
        <el-select v-model="form.owner_id" filterable>
          <el-option v-for="m in session.directory" :key="m.uid" :label="m.username" :value="m.uid" />
        </el-select>
      </el-form-item>
      <el-form-item label="备注">
        <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="1000" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="open = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>
