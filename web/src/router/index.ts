import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

export interface NavItem {
  path: string
  title: string
  icon: string
  /** 只有管理员可见 */
  adminOnly?: boolean
}

// 侧边导航（阶段 2 逐个实现页面）
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

const routes: RouteRecordRaw[] = NAV_ITEMS.map((item) => ({
  path: item.path,
  meta: { title: item.title },
  component: () => import('@/views/PlaceholderView.vue'),
}))

export const router = createRouter({
  // hash 模式：静态托管不需要配置路由重写
  history: createWebHashHistory(),
  routes: [...routes, { path: '/:pathMatch(.*)*', redirect: '/' }],
})

router.afterEach((to) => {
  document.title = `${(to.meta.title as string) ?? ''} · 滤芯更换提醒系统`
})
