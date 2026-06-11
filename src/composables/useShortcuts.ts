/**
 * 全局快捷键。
 *   Ctrl/Cmd + N  新建笔记
 *   Ctrl/Cmd + F  聚焦搜索框
 *   Ctrl/Cmd + S  立即保存当前笔记
 *
 * 设计：本组合式只负责「监听按键 + 决定做什么」。
 * 聚焦搜索、立即保存这类需要操作具体组件的动作，通过自定义 DOM 事件解耦：
 *   - NoteList 监听 'fafa:focus-search' 聚焦搜索框
 *   - NoteEditor 监听 'fafa:flush-save' 立即落库
 * 新建笔记直接调 store。
 *
 * 在 App.vue 里调用一次即可。
 */
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNotesStore } from '@/stores/notes'
import { useUiStore } from '@/stores/ui'

export const EV_FOCUS_SEARCH = 'fafa:focus-search'
export const EV_FLUSH_SAVE = 'fafa:flush-save'

export function useShortcuts() {
  const router = useRouter()
  const notes = useNotesStore()
  const ui = useUiStore()

  async function ensureNotesRoute() {
    if (router.currentRoute.value.path !== '/') await router.push('/')
  }

  async function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey
    if (!mod || e.altKey) return
    const key = e.key.toLowerCase()

    if (key === 'p') {
      e.preventDefault()
      ui.togglePalette() // 命令面板
    } else if (key === 'n') {
      e.preventDefault()
      await ensureNotesRoute()
      await notes.createNote()
    } else if (key === 'f') {
      e.preventDefault()
      await ensureNotesRoute()
      // 等路由/列表渲染后再聚焦
      requestAnimationFrame(() => window.dispatchEvent(new CustomEvent(EV_FOCUS_SEARCH)))
    } else if (key === 's') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent(EV_FLUSH_SAVE))
    }
  }

  onMounted(() => window.addEventListener('keydown', onKey))
  onUnmounted(() => window.removeEventListener('keydown', onKey))
}
