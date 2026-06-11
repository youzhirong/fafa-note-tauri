/**
 * UI 状态 store：管理三列布局的交互状态。
 * 布局尺寸/收起状态实际持久化在 settings.layout 里，这里提供便捷的操作方法，
 * 并把 settings 中的布局值「桥接」成响应式状态供布局组件使用。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { computed, ref } from 'vue'
import { useSettingsStore } from './settings'

export const useUiStore = defineStore('ui', () => {
  const settingsStore = useSettingsStore()

  /** 命令面板（Ctrl/Cmd+P）是否打开 */
  const paletteOpen = ref(false)
  function openPalette() {
    paletteOpen.value = true
  }
  function closePalette() {
    paletteOpen.value = false
  }
  function togglePalette() {
    paletteOpen.value = !paletteOpen.value
  }

  /** 左侧菜单栏是否收起 */
  const sidebarCollapsed = computed({
    get: () => settingsStore.settings.layout.sidebarCollapsed,
    set: (v: boolean) => {
      settingsStore.settings.layout.sidebarCollapsed = v
    },
  })

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  /** 保存用户拖拽后的列宽（Splitter resizeend 事件回调用） */
  function saveSizes(sidebarPct: number, listPct: number) {
    settingsStore.settings.layout.sidebarSizePct = sidebarPct
    settingsStore.settings.layout.listSizePct = listPct
  }

  return {
    sidebarCollapsed,
    toggleSidebar,
    saveSizes,
    paletteOpen,
    openPalette,
    closePalette,
    togglePalette,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot))
}
