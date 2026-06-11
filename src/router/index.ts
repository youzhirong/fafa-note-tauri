/**
 * 路由配置。
 *
 * 使用 hash 历史模式（createWebHashHistory）：
 *   - Tauri 加载的是本地文件，hash 模式不依赖服务器路由配置，最稳；
 *   - Web 静态托管时也无需服务器做 history fallback，刷新不 404。
 *
 * 【如何新增一个页面路由】
 *   1. 在 src/views/ 新建页面组件；
 *   2. 在下面 routes 里加一条；
 *   3. 若要出现在左侧菜单，去 src/config/navigation.ts 加一项（route 对应这里的 path）。
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'notes',
    // 懒加载：按需分包，首屏更快
    component: () => import('@/views/NotesView.vue'),
    meta: { title: '笔记' },
  },
  {
    path: '/logs',
    name: 'logs',
    component: () => import('@/views/LogsView.vue'),
    meta: { title: '日志' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/trash',
    name: 'trash',
    component: () => import('@/views/TrashView.vue'),
    meta: { title: '回收站' },
  },
  {
    path: '/stats',
    name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: { title: '统计' },
  },

  // 兜底：未知路径回首页
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
