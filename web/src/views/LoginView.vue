<script setup lang="ts">
import { Lock, User } from '@element-plus/icons-vue'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeError, isCloudConfigured } from '@/api/cloud'
import { appConfig } from '@/config'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
const configured = isCloudConfigured()

async function submit() {
  error.value = ''
  if (!form.username.trim() || !form.password) {
    error.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    await session.login(form.username, form.password)
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch (e) {
    error.value = describeError(e)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <span class="mark">💧</span>
        <div>
          <h1>滤芯更换提醒系统</h1>
          <p>客户 · 装机 · 换芯 · 工单 · 收款</p>
        </div>
      </div>
      <el-tag v-if="appConfig.envLabel" type="warning" effect="dark" class="env-tag">{{ appConfig.envLabel }}</el-tag>

      <el-alert v-if="!configured" type="error" :closable="false" title="没有配置云开发环境，无法登录" />

      <el-form v-else size="large" @submit.prevent="submit">
        <el-form-item>
          <el-input v-model="form.username" :prefix-icon="User" placeholder="用户名" autocomplete="username" />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            :prefix-icon="Lock"
            type="password"
            show-password
            placeholder="密码"
            autocomplete="current-password"
          />
        </el-form-item>
        <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon class="error" />
        <el-button type="primary" native-type="submit" :loading="loading" class="submit">登录</el-button>
      </el-form>
      <p class="hint">账号由管理员在云开发控制台创建；忘记密码请联系管理员重置。</p>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: linear-gradient(135deg, #001529 0%, #0a3d62 60%, #1677ff 100%);
}
.login-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 12px;
  padding: 32px 28px 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
}
.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 20px;
}
.mark {
  font-size: 36px;
}
h1 {
  margin: 0;
  font-size: 20px;
}
.brand p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.env-tag {
  margin-bottom: 16px;
}
.error {
  margin-bottom: 16px;
}
.submit {
  width: 100%;
}
.hint {
  margin: 16px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  text-align: center;
}
</style>
