/**
 * 设置 store。
 *
 * 持久化策略：用 localStorage（Web + Tauri WebView 都支持），
 * 这样设置本身不依赖平台文件系统，最简单可靠。
 * （备份/还原才需要真实磁盘路径，那是另一回事，见 BackupService。）
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, watch, computed } from 'vue'
import { DEFAULT_SETTINGS, type AppSettings } from '@/types'

const STORAGE_KEY = 'fafa-note:settings'

/** 从 localStorage 读取，缺字段用默认值补全（向后兼容新增设置项） */
function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    const parsed = JSON.parse(raw)
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      layout: { ...DEFAULT_SETTINGS.layout, ...(parsed.layout || {}) },
    }
  } catch {
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(load())

  // 任意设置变更 → 自动写回 localStorage
  watch(
    settings,
    (val) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
      applyTheme(val.theme)
    },
    { deep: true },
  )

  /** 应用主题到 <html data-theme>，配合 CSS 变量切换亮暗 */
  function applyTheme(theme: AppSettings['theme']) {
    const root = document.documentElement
    const dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark-theme', dark)
  }

  function reset() {
    settings.value = structuredClone(DEFAULT_SETTINGS)
  }

  // 暴露代理地址给 HttpService 调用方便
  const proxyUrl = computed(() => settings.value.proxyUrl)

  // 首次应用一次主题
  applyTheme(settings.value.theme)

  return { settings, proxyUrl, reset, applyTheme }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useSettingsStore, import.meta.hot))
}
