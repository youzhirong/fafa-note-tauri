/**
 * ★ 工具菜单栏配置（左侧菜单的「数据来源」）★
 *
 * 左侧菜单栏是「数据驱动」的：Sidebar.vue 遍历这个数组来渲染菜单项。
 * ──────────────────────────────────────────────
 * 【如何新增一个菜单项 / 功能页】——三步：
 *   1. 在下面 NAV_ITEMS 里加一项（图标用 PrimeIcons 的 class，如 'pi pi-star'）；
 *   2. 在 src/views/ 下新建对应的页面组件，例如 TrashView.vue；
 *   3. 在 src/router/index.ts 的 routes 里加一条路由，path 与这里的 route 对应。
 * 完成后菜单栏自动出现该项，点击即可跳转。详见 docs/扩展指南.md。
 * ──────────────────────────────────────────────
 */

/** 菜单项类型 */
export interface NavItem {
  /** 唯一标识 */
  key: string
  /** 显示文字 */
  label: string
  /** PrimeIcons 图标 class */
  icon: string
  /** 点击后跳转的路由路径；不填则视为「分组标题/纯展示」 */
  route?: string
  /**
   * 位置：'top' 放在菜单栏上半部分，'bottom' 固定在底部（如设置）。
   * 默认 'top'。
   */
  placement?: 'top' | 'bottom'
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'notes', label: '笔记', icon: 'pi pi-book', route: '/', placement: 'top' },
  { key: 'stats', label: '统计', icon: 'pi pi-chart-bar', route: '/stats', placement: 'top' },
  { key: 'trash', label: '回收站', icon: 'pi pi-trash', route: '/trash', placement: 'top' },
  // 示例：后期可解开下面这项，并补上对应 view + route
  // { key: 'tags',  label: '标签',   icon: 'pi pi-tags',  route: '/tags' },

  // 底部固定项
  { key: 'logs', label: '日志', icon: 'pi pi-receipt', route: '/logs', placement: 'bottom' },
  { key: 'settings', label: '设置', icon: 'pi pi-cog', route: '/settings', placement: 'bottom' },
]
