<script setup lang="ts">
import { ArrowDown, Menu as MenuIcon, Moon, Search, Setting, Sunny, SwitchButton } from '@element-plus/icons-vue'
import { useDark, useMediaQuery, useStorage, useToggle } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { appConfig } from '@/config'
import AssistantPanel from '@/components/AssistantPanel.vue'
import AppSidebar from '@/layouts/AppSidebar.vue'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const isMobile = useMediaQuery('(max-width: 900px)')
const collapsed = useStorage('v4.sidebar.collapsed', false)
const drawerOpen = ref(false)
watch(
  () => route.fullPath,
  () => (drawerOpen.value = false),
)

const isDark = useDark({ storageKey: 'v4.theme', initialValue: 'light' })
const toggleDark = useToggle(isDark)

// 全局搜索：在装机记录中按客户、地址、联系人、电话搜索
const search = ref('')
function doSearch() {
  const q = search.value.trim()
  if (!q) return
  void router.push({ path: '/devices', query: { q } })
  search.value = ''
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
  <div class="shell" :class="{ collapsed: collapsed && !isMobile }">
    <aside v-if="!isMobile" class="sidebar">
      <AppSidebar v-model:collapsed="collapsed" :is-mobile="false" />
    </aside>
    <el-drawer v-else v-model="drawerOpen" direction="ltr" size="264px" :with-header="false" class="nav-drawer">
      <AppSidebar :is-mobile="true" />
    </el-drawer>

    <div class="body">
      <header class="topbar">
        <button v-if="isMobile" class="icon-btn" aria-label="打开菜单" @click="drawerOpen = true">
          <el-icon :size="20"><MenuIcon /></el-icon>
        </button>
        <div class="titles">
          <h1>{{ route.meta.title }}</h1>
          <p v-if="route.meta.subtitle && !isMobile">{{ route.meta.subtitle }}</p>
        </div>
        <div class="spacer" />
        <el-input
          v-if="!isMobile"
          v-model="search"
          :prefix-icon="Search"
          placeholder="搜索客户、地址、电话…"
          class="global-search"
          clearable
          @keyup.enter="doSearch"
        />
        <span v-if="appConfig.envLabel" class="env-badge">{{ appConfig.envLabel }}</span>
        <el-tooltip :content="isDark ? '切换到浅色' : '切换到深色'">
          <button class="icon-btn" aria-label="切换深色模式" @click="toggleDark()">
            <el-icon :size="18"><component :is="isDark ? Sunny : Moon" /></el-icon>
          </button>
        </el-tooltip>
        <el-dropdown trigger="click" @command="onCommand">
          <button class="user-btn">
            <el-avatar :size="30" class="avatar">{{ session.member?.username.slice(0, 1).toUpperCase() }}</el-avatar>
            <el-icon v-if="!isMobile"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <div class="dropdown-head">
                <strong>{{ session.member?.username }}</strong>
                <span>{{ session.isAdmin ? '管理员 · 可查看全部数据' : '成员 · 查看自己负责的客户' }}</span>
              </div>
              <el-dropdown-item :icon="Setting" command="settings" divided>设置与修改密码</el-dropdown-item>
              <el-dropdown-item :icon="SwitchButton" command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <main class="main">
        <router-view v-slot="{ Component: View }">
          <component :is="View" />
        </router-view>
      </main>
    </div>
    <AssistantPanel />
  </div>
</template>

<style scoped>
.shell {
  --sidebar-w: 240px;
  display: flex;
  height: 100vh;
  background: var(--app-bg);
}
.shell.collapsed {
  --sidebar-w: 76px;
}
.sidebar {
  width: var(--sidebar-w);
  flex-shrink: 0;
  background: var(--app-sidebar);
  border-right: 1px solid var(--app-border);
  transition: width 0.2s ease;
}
.nav-drawer :deep(.el-drawer__body) {
  padding: 0;
  background: var(--app-sidebar);
}
.avatar {
  background: var(--brand-gradient);
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
}
.icon-btn {
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
.icon-btn:hover {
  color: var(--brand-600);
  border-color: var(--el-color-primary-light-7);
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.topbar {
  height: 64px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  background: var(--app-header);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--app-border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.titles {
  min-width: 0;
}
.titles h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.titles p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--app-text-3);
  white-space: nowrap;
}
.spacer {
  flex: 1;
}
.global-search {
  width: 260px;
}
.global-search :deep(.el-input__wrapper) {
  border-radius: 999px;
  background: var(--app-surface-muted);
  box-shadow: 0 0 0 1px var(--app-border) inset;
}
.env-badge {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: #b45309;
  background: #fef3c7;
  border: 1px solid #fde68a;
  padding: 3px 10px;
  border-radius: 999px;
}
.user-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--app-text-2);
  padding: 0;
}
.dropdown-head {
  display: flex;
  flex-direction: column;
  padding: 8px 16px 6px;
  line-height: 1.5;
}
.dropdown-head span {
  font-size: 12px;
  color: var(--app-text-3);
}
.main {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
@media (max-width: 900px) {
  .topbar {
    padding: 0 12px;
    height: 56px;
  }
  .main {
    padding: 12px;
  }
}
</style>
