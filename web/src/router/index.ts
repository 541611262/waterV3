import type { Component } from 'vue'
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { useSessionStore } from '@/stores/session'

export interface NavItem {
  path: string
  title: string
  icon: string
  /** 只有管理员可见 */
  adminOnly?: boolean
}

// 侧边导航
export const NAV_ITEMS: NavItem[] = [
  { path: '/', title: '工作台', icon: 'Odometer' },
  { path: '/customers', title: '客户', icon: 'OfficeBuilding' },
  { path: '/devices', title: '装机记录', icon: 'Cpu' },
  { path: '/work-orders', title: '工单', icon: 'Tickets' },
  { path: '/payments', title: '收款', icon: 'Wallet' },
  { path: '/reports', title: '报表', icon: 'DataAnalysis' },
  { path: '/members', title: '成员', icon: 'User', adminOnly: true },
  { path: '/settings', title: '设置', icon: 'Setting' },
]

type Lazy = () => Promise<{ default: Component }>
const placeholder: Lazy = () => import('@/views/PlaceholderView.vue')
const VIEWS: Record<string, Lazy> = {
  '/': () => import('@/views/DashboardView.vue'),
  '/customers': () => import('@/views/ClientsView.vue'),
  '/devices': () => import('@/views/DevicesView.vue'),
}

const routes: RouteRecordRaw[] = [
  { path: '/login', name: 'login', meta: { title: '登录', public: true }, component: () => import('@/views/LoginView.vue') },
  ...NAV_ITEMS.map(
    (item): RouteRecordRaw => ({
      path: item.path,
      meta: { title: item.title, adminOnly: item.adminOnly ?? false },
      component: VIEWS[item.path] ?? placeholder,
    }),
  ),
  {
    path: '/customers/:id',
    meta: { title: '客户详情', nav: '/customers' },
    component: () => import('@/views/ClientDetailView.vue'),
    props: true,
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  // hash 模式：静态托管不需要配置路由重写
  history: createWebHashHistory(),
  routes,
})

let restoring: Promise<void> | null = null

router.beforeEach(async (to) => {
  const session = useSessionStore()
  if (!session.ready) {
    restoring ??= session.restore()
    await restoring
  }
  if (to.meta.public) {
    return session.isLoggedIn && to.name === 'login' ? '/' : true
  }
  if (!session.isLoggedIn) {
    return { name: 'login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  }
  if (to.meta.adminOnly && !session.isAdmin) return '/'
  return true
})

router.afterEach((to) => {
  document.title = `${(to.meta.title as string) ?? ''} · 滤芯更换提醒系统`
})
