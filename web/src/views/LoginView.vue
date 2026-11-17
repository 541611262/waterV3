<script setup lang="ts">
import { Bell, Lock, Tickets, TrendCharts, User } from '@element-plus/icons-vue'
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeError, isCloudConfigured } from '@/api/cloud'
import BrandMark from '@/components/BrandMark.vue'
import { appConfig } from '@/config'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const router = useRouter()
const route = useRoute()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')
const configured = isCloudConfigured()

const FEATURES = [
  { icon: Bell, title: '到期自动提醒', text: '每台设备、每一级滤芯单独计算，超期一目了然' },
  { icon: Tickets, title: '工单派单', text: '一键派给同事，上门完成时顺手登记换芯' },
  { icon: TrendCharts, title: '收款与报表', text: '应收、收款、换芯量和收入，随时可查可导出' },
]

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
    <section class="showcase">
      <div class="showcase-inner">
        <div class="logo">
          <BrandMark :size="44" />
          <div>
            <strong>滤芯管家</strong>
            <span>净水器售后服务管理</span>
          </div>
        </div>
        <h1>让每一次换芯<br />都准时、有记录</h1>
        <ul class="features">
          <li v-for="f in FEATURES" :key="f.title">
            <span class="feature-icon"><el-icon :size="18"><component :is="f.icon" /></el-icon></span>
            <div>
              <strong>{{ f.title }}</strong>
              <p>{{ f.text }}</p>
            </div>
          </li>
        </ul>
        <p class="footnote">数据保存在国内云端，按账号权限隔离；所有日期按北京时间计算。</p>
      </div>
      <div class="orb orb-1" />
      <div class="orb orb-2" />
    </section>

    <section class="form-side">
      <div class="card">
        <div class="mobile-logo">
          <BrandMark :size="40" />
          <strong>滤芯管家</strong>
        </div>
        <h2>欢迎回来</h2>
        <p class="lead">使用管理员分配的账号登录</p>
        <span v-if="appConfig.envLabel" class="env-badge">{{ appConfig.envLabel }}</span>

        <el-alert v-if="!configured" type="error" :closable="false" title="没有配置云开发环境，无法登录" />

        <el-form v-else size="large" class="form" @submit.prevent="submit">
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
        <p class="hint">忘记密码请联系管理员在云开发控制台重置。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  background: var(--app-bg);
}
.showcase {
  position: relative;
  overflow: hidden;
  color: #fff;
  background: linear-gradient(150deg, #0b1f4d 0%, #1d4fd8 55%, #06b6d4 120%);
  display: flex;
  align-items: center;
  padding: 56px;
}
.showcase-inner {
  position: relative;
  z-index: 1;
  max-width: 460px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 48px;
}
.logo div {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.logo strong {
  font-size: 20px;
  letter-spacing: 0.04em;
}
.logo span {
  font-size: 13px;
  opacity: 0.75;
}
h1 {
  margin: 0 0 32px;
  font-size: 36px;
  line-height: 1.3;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.features {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.features li {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.feature-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.14);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  flex-shrink: 0;
}
.features strong {
  font-size: 15px;
}
.features p {
  margin: 2px 0 0;
  font-size: 13px;
  opacity: 0.78;
}
.footnote {
  margin: 48px 0 0;
  font-size: 12px;
  opacity: 0.6;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(10px);
  opacity: 0.35;
}
.orb-1 {
  width: 420px;
  height: 420px;
  right: -140px;
  top: -120px;
  background: radial-gradient(circle, #67e8f9, transparent 70%);
}
.orb-2 {
  width: 360px;
  height: 360px;
  left: -120px;
  bottom: -140px;
  background: radial-gradient(circle, #93c5fd, transparent 70%);
}
.form-side {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
.card {
  width: 100%;
  max-width: 380px;
}
.mobile-logo {
  display: none;
}
h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 700;
}
.lead {
  margin: 6px 0 20px;
  color: var(--app-text-2);
  font-size: 14px;
}
.env-badge {
  display: inline-block;
  margin-bottom: 16px;
  font-size: 12px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  padding: 3px 10px;
  border-radius: 999px;
}
.form :deep(.el-input__wrapper) {
  border-radius: 12px;
  padding: 4px 14px;
}
.error {
  margin-bottom: 16px;
}
.submit {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  font-size: 15px;
}
.hint {
  margin: 18px 0 0;
  font-size: 12px;
  color: var(--app-text-3);
  text-align: center;
}
@media (max-width: 900px) {
  .login-page {
    grid-template-columns: 1fr;
  }
  .showcase {
    display: none;
  }
  .mobile-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 28px;
    font-size: 18px;
  }
}
</style>
