<script setup lang="ts">
import {
  ArrowDown,
  Cpu,
  DataAnalysis,
  Expand,
  Fold,
  Odometer,
  OfficeBuilding,
  Setting,
  Tickets,
  User,
  Wallet,
} from '@element-plus/icons-vue'
import { useMediaQuery } from '@vueuse/core'
import { computed, ref, watch, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appConfig } from '@/config'
import { NAV_ITEMS } from '@/router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const isMobile = useMediaQuery('(max-width: 768px)')
const collapsed = ref(false)
const drawerOpen = ref(false)
watch(
  () => route.fullPath,
  () => (drawerOpen.value = false),
)

const ICONS: Record<string, Component> = { Cpu, DataAnalysis, Odometer, OfficeBuilding, Setting, Tickets, User, Wallet }
const iconOf = (name: string) => ICONS[name]
const navItems = computed(() => NAV_ITEMS.filter((item) => !item.adminOnly || session.isAdmin))
const activePath = computed(() => (route.meta.nav as string | undefined) ?? route.path)

function toggleMenu() {
  if (isMobile.value) drawerOpen.value = !drawerOpen.value
  else collapsed.value = !collapsed.value
}

async function onCommand(command: string) {
  if (command === 'logout') {
    await session.logout()
    await router.replace('/login')
  } else if (command === 'settings') {
    await router.push('/settings')
  }
}
</script>

<template>
  <el-container class="layout">
    <el-aside v-if="!isMobile" :width="collapsed ? '64px' : '208px'" class="aside">
      <div class="brand">
        <span class="brand-mark">💧</span>
        <span v-if="!collapsed" class="brand-name">滤芯提醒</span>
      </div>
      <el-menu :default-active="activePath" :collapse="collapsed" router class="menu">
        <el-menu-item v-for="item in navItems" :key="item.path" :index="item.path">
          <el-icon><component :is="iconOf(item.icon)" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-drawer v-else v-model="drawerOpen" direction="ltr" size="220px" :with-header="false" class="nav-drawer">
      <div class="aside drawer-aside">
        <div class="brand">
          <span class="brand-mark">💧</span>
          <span class="brand-name">滤芯提醒</span>
        </div>
        <el-menu :default-active="activePath" router class="menu">
          <el-menu-item v-for="item in navItems" :key="item.path" :index="item.path">
            <el-icon><component :is="iconOf(item.icon)" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </el-menu>
      </div>
    </el-drawer>

    <el-container class="body">
      <el-header class="header">
        <el-button text :icon="collapsed || isMobile ? Expand : Fold" aria-label="展开或收起菜单" @click="toggleMenu" />
        <h1 class="page-title">{{ route.meta.title }}</h1>
        <el-tag v-if="appConfig.envLabel" type="warning" effect="dark" class="env-tag">{{ appConfig.envLabel }}</el-tag>
        <el-dropdown trigger="click" @command="onCommand">
          <span class="user">
            <el-avatar :size="28" class="avatar">{{ session.member?.username.slice(0, 1) }}</el-avatar>
            <span v-if="!isMobile" class="user-name">{{ session.member?.username }}</span>
            <el-tag v-if="session.isAdmin && !isMobile" size="small" type="info">管理员</el-tag>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="settings">设置与修改密码</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #001529;
  transition: width 0.2s;
  overflow: hidden;
}
.drawer-aside {
  height: 100%;
}
.nav-drawer :deep(.el-drawer__body) {
  padding: 0;
}
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  white-space: nowrap;
}
.menu {
  border-right: none;
  --el-menu-bg-color: #001529;
  --el-menu-text-color: rgba(255, 255, 255, 0.75);
  --el-menu-active-color: #fff;
  --el-menu-hover-bg-color: #0f2a44;
}
.menu :deep(.el-menu-item.is-active) {
  background: var(--el-color-primary);
}
.body {
  min-width: 0;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-light);
  padding: 0 16px;
}
.page-title {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.env-tag {
  flex-shrink: 0;
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  outline: none;
}
.avatar {
  background: var(--el-color-primary);
  font-size: 13px;
}
.user-name {
  font-size: 14px;
}
.main {
  background: var(--el-bg-color-page);
  padding: 16px;
}
@media (max-width: 768px) {
  .main {
    padding: 10px;
  }
}
</style>
