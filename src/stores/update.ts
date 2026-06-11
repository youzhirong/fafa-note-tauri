/**
 * 更新状态 store（仅桌面端有实际意义）。
 *
 * 为什么要单独建 store？——更新流程（检查→确认→下载→重启）会跨越「切换菜单」这种组件卸载：
 * 关于页是路由懒加载组件，切走就被销毁。若把进度放在组件局部 ref 里，切走再切回进度就丢了，
 * 但下载其实还在后台跑。把状态放进单例 store 后，下载继续、进度持续更新，切回关于页直接读 store
 * 即可恢复显示，进度不再「丢失」。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { markRaw, ref } from 'vue'
import {
  checkForUpdate,
  runDownloadAndInstall,
  type CheckStatus,
  type TauriUpdate,
} from '@/services/UpdateService'

/** idle：未开始；done：下载完成（一般会随即重启）；其余对应检查/下载各阶段 */
export type UpdatePhase = 'idle' | 'checking' | 'downloading' | 'done' | CheckStatus

export const useUpdateStore = defineStore('update', () => {
  const phase = ref<UpdatePhase>('idle')
  const message = ref('')
  const latestVersion = ref('')
  const notes = ref('')
  const progress = ref(0) // 0–100
  const downloading = ref(false)

  // plugin-updater 的更新句柄：非响应式（markRaw），仅在 check→download 之间暂存
  let pending: TauriUpdate | null = null

  /** 是否正忙（按钮 loading） */
  function busy() {
    return phase.value === 'checking' || downloading.value
  }

  /** 只检查，不下载。返回检查结果状态，供 UI 决定弹确认框 / toast */
  async function check(): Promise<CheckStatus> {
    if (busy()) return phase.value as CheckStatus
    phase.value = 'checking'
    message.value = '正在检查更新…'
    progress.value = 0
    pending = null

    const r = await checkForUpdate()
    phase.value = r.status
    message.value = r.message
    if (r.available && r.update) {
      latestVersion.value = r.version ?? ''
      notes.value = r.notes ?? ''
      pending = markRaw(r.update)
    } else {
      latestVersion.value = ''
      notes.value = ''
    }
    return r.status
  }

  /** 用户确认升级后调用：下载、安装并重启 */
  async function download() {
    if (!pending || downloading.value) return
    downloading.value = true
    phase.value = 'downloading'
    progress.value = 0
    message.value = `正在下载新版本 ${latestVersion.value}…`

    const r = await runDownloadAndInstall(pending, (pct, msg) => {
      progress.value = pct
      message.value = msg
    })

    // 成功时应用会重启，一般走不到这；失败时落回提示
    if (r.status === 'error') {
      phase.value = 'error'
      message.value = r.message
    } else {
      phase.value = 'done'
      message.value = r.message
    }
    downloading.value = false
  }

  /** 重置回初始状态 */
  function reset() {
    phase.value = 'idle'
    message.value = ''
    latestVersion.value = ''
    notes.value = ''
    progress.value = 0
    downloading.value = false
    pending = null
  }

  return {
    phase,
    message,
    latestVersion,
    notes,
    progress,
    downloading,
    busy,
    check,
    download,
    reset,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUpdateStore, import.meta.hot))
}
