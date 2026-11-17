<script setup lang="ts">
import {
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
import { computed, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { appConfig } from '@/config'
import { NAV_ITEMS } from '@/router'

const route = useRoute()
const collapsed = ref(false)
const ICONS: Record<string, Component> = { Cpu, DataAnalysis, Odometer, OfficeBuilding, Setting, Tickets, User, Wallet }
const iconOf = (name: string) => ICONS[name]
const activePath = computed(() => route.path)
</script>

<template>
  <el-container class="layout">
    <el-aside :width="collapsed ? '64px' : '208px'" class="aside">
      <div class="brand">
        <span class="brand-mark">💧</span>
        <span v-if="!collapsed" class="brand-name">滤芯提醒</span>
      </div>
      <el-menu :default-active="activePath" :collapse="collapsed" router class="menu">
        <el-menu-item v-for="item in NAV_ITEMS" :key="item.path" :index="item.path">
          <el-icon><component :is="iconOf(item.icon)" /></el-icon>
          <template #title>{{ item.title }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <el-button text :icon="collapsed ? Expand : Fold" @click="collapsed = !collapsed" />
        <h1 class="page-title">{{ route.meta.title }}</h1>
        <el-tag v-if="appConfig.envLabel" type="warning" effect="dark">{{ appConfig.envLabel }}</el-tag>
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
.brand {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px;
  color: #fff;
  font-weight: 600;
  font-size: 16px;
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
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-light);
}
.page-title {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.main {
  background: var(--el-bg-color-page);
}
</style>
