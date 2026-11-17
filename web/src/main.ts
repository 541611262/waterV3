import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'

const app = createApp(App).use(createPinia()).use(router)
// 等首次路由守卫（恢复登录状态）完成后再挂载，避免未登录时闪现主界面
router.isReady().then(() => app.mount('#app'))
