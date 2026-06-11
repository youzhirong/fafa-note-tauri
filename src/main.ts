/**
 * 应用入口。
 * 负责装配 Vue + Pinia + Router + PrimeVue，并挂载根组件。
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'

// PrimeVue 4 的核心与主题（Aura 预设）
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'

// 图标字体
import 'primeicons/primeicons.css'
// 全局样式（含亮暗主题变量、布局基础样式）
import '@/assets/main.css'

import App from './App.vue'
import { router } from './router'
import { initLogger } from '@/services/logger'

// 尽早初始化日志收集，捕获启动阶段的 console 输出与全局错误
initLogger()

const app = createApp(App)

// 捕获 Vue 组件渲染期的错误，输出到 console（会被 logger 收集）
app.config.errorHandler = (err, _instance, info) => {
  console.error('[Vue]', err, info)
}

app.use(createPinia())
app.use(router)

app.use(PrimeVue, {
  // 主题用 CSS 变量驱动，配合 darkModeSelector 实现亮暗切换
  theme: {
    preset: Aura,
    options: {
      // 当 <html> 带有 .dark-theme 时启用暗色（与 settings store 的 applyTheme 对应）
      darkModeSelector: '.dark-theme',
    },
  },
})
app.use(ToastService)
app.use(ConfirmationService)
app.directive('tooltip', Tooltip)

app.mount('#app')
