/**
 * 自动定时备份调度。
 *
 * 根据设置里的「开关 + 间隔分钟」建立/清除定时器；到点静默备份一次。
 * 备份目标见 BackupService.autoBackup（Tauri 写磁盘滚动文件，Web 写 localStorage 快照）。
 *
 * 在 App.vue 调用一次。失败只记日志，不打扰用户（可在「日志」页查看）。
 */
import { watch, onUnmounted } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useNotesStore } from '@/stores/notes'
import { buildBundle, autoBackup } from '@/services/BackupService'

export function useAutoBackup() {
  const settingsStore = useSettingsStore()
  const notes = useNotesStore()
  let timer: ReturnType<typeof setInterval> | null = null

  async function run() {
    try {
      const bundle = buildBundle(notes.notes, notes.folders)
      const where = await autoBackup(bundle, settingsStore.settings.backupPath)
      settingsStore.settings.lastAutoBackupAt = Date.now()
      console.info('[自动备份] 成功 →', where)
    } catch (e: any) {
      console.warn('[自动备份] 跳过/失败:', e?.message ?? e)
    }
  }

  function reschedule() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    const s = settingsStore.settings
    if (!s.autoBackup) return
    const minutes = Math.max(1, Number(s.autoBackupIntervalMinutes) || 30)
    timer = setInterval(run, minutes * 60 * 1000)
  }

  // 开关或间隔变化时重排；immediate 保证启动即按当前设置生效
  watch(
    () => [settingsStore.settings.autoBackup, settingsStore.settings.autoBackupIntervalMinutes],
    reschedule,
    { immediate: true },
  )

  onUnmounted(() => {
    if (timer) clearInterval(timer)
  })
}
