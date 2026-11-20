<script setup lang="ts">
import { Cpu, DArrowLeft, DArrowRight, DataAnalysis, Odometer, OfficeBuilding, Setting, Tickets, User, Wallet } from '@element-plus/icons-vue'
import { computed, type Component } from 'vue'
import { useRoute } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import { NAV_ITEMS, type NavItem } from '@/router'
import { useSessionStore } from '@/stores/session'

const props = defineProps<{ isMobile: boolean }>()
const collapsed = defineModel<boolean>('collapsed', { default: false })
const route = useRoute()
const session = useSessionStore()

const ICONS: Record<string, Component> = { Cpu, DataAnalysis, Odometer, OfficeBuilding, Setting, Tickets, User, Wallet }
const groups = computed(() => {
  const visible = NAV_ITEMS.filter((item) => !item.adminOnly || session.isAdmin)
  const result: { name: string; items: NavItem[] }[] = []
  for (const item of visible) {
    const group = result.find((g) => g.name === item.group)
    if (group) group.items.push(item)
    else result.push({ name: item.group, items: [item] })
  }
  return result
})
const activePath = computed(() => (route.meta.nav as string | undefined) ?? route.path)
const isActive = (path: string) => (path === '/' ? activePath.value === '/' : activePath.value.startsWith(path))
const isMobile = computed(() => props.isMobile)
</script>

<template>
  <div class="sidebar-inner" :class="{ collapsed: collapsed && !isMobile }">
    <router-link to="/" class="brand">
      <BrandMark :size="34" />
      <div v-if="!collapsed || isMobile" class="brand-text">
        <strong>滤芯管家</strong>
        <span>售后服务管理</span>
      </div>
    </router-link>

    <nav class="nav">
      <div v-for="group in groups" :key="group.name" class="nav-group">
        <div v-if="!collapsed || isMobile" class="nav-group-title">{{ group.name }}</div>
        <el-tooltip
          v-for="item in group.items"
          :key="item.path"
          :content="item.title"
          placement="right"
          :disabled="!collapsed || isMobile"
        >
          <router-link :to="item.path" class="nav-item" :class="{ active: isActive(item.path) }">
            <el-icon :size="18"><component :is="ICONS[item.icon]" /></el-icon>
            <span v-if="!collapsed || isMobile">{{ item.title }}</span>
          </router-link>
        </el-tooltip>
      </div>
    </nav>

    <div class="sidebar-foot">
      <div v-if="!collapsed || isMobile" class="me">
        <el-avatar :size="34" class="avatar">{{ session.member?.username.slice(0, 1).toUpperCase() }}</el-avatar>
        <div class="me-text">
          <strong>{{ session.member?.username }}</strong>
          <span>{{ session.isAdmin ? '管理员' : '成员' }}</span>
        </div>
      </div>
      <button v-if="!isMobile" class="collapse-btn" :title="collapsed ? '展开菜单' : '收起菜单'" @click="collapsed = !collapsed">
        <el-icon><component :is="collapsed ? DArrowRight : DArrowLeft" /></el-icon>
      </button>
    </div>
  </div>
</template>

<style scoped>
.sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 16px 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 18px;
  text-decoration: none;
  color: var(--app-text);
}
.collapsed.sidebar-inner .brand {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.brand-text strong {
  font-size: 16px;
  letter-spacing: 0.02em;
}
.brand-text span {
  font-size: 12px;
  color: var(--app-text-3);
}
.nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-group-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-3);
  letter-spacing: 0.08em;
  padding: 0 12px 6px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--app-text-2);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition:
    background 0.15s,
    color 0.15s;
  position: relative;
}
.collapsed.sidebar-inner .nav-item {
  justify-content: center;
  padding: 0;
}
.nav-item:hover {
  background: var(--app-surface-muted);
  color: var(--app-text);
}
.nav-item.active {
  background: var(--brand-50);
  color: var(--brand-600);
  font-weight: 600;
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--brand-gradient);
}
.sidebar-foot {
  border-top: 1px solid var(--app-border);
  padding-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.collapsed.sidebar-inner .sidebar-foot {
  justify-content: center;
}
.me {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.me-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}
.me-text strong {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.me-text span {
  font-size: 12px;
  color: var(--app-text-3);
}
.avatar {
  background: var(--brand-gradient);
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}
.collapse-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: var(--app-surface);
  color: var(--app-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
}
.collapse-btn:hover {
  color: var(--brand-600);
  border-color: var(--el-color-primary-light-7);
}
</style>
