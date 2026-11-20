import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/theme.css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'

const app = createApp(App).use(createPinia()).use(router)
// 等首次路由守卫（恢复登录状态）完成后再挂载，避免未登录时闪现主界面
router.isReady().then(() => app.mount('#app'))

// 正式构建时注册 Service Worker（支持添加到手机桌面）；本地开发不注册，避免缓存干扰调试
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  })
}
