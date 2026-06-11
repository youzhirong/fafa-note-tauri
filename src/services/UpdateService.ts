/**
 * 版本与更新服务。
 *
 * - 版本号：Tauri 端取应用真实版本（tauri.conf.json），Web 端用编译期注入的 __APP_VERSION__。
 * - 检查更新：仅桌面端（Tauri）有意义——用 plugin-updater 检查/下载/安装，再用 plugin-process 重启。
 *   Web 端随网页托管更新，刷新即最新，无需更新逻辑。
 *
 * 注意：自动更新要真正可用，还需在 tauri.conf.json 配置 plugins.updater 的 endpoints 与签名公钥
 * （见 docs/扩展指南.md「启用自动更新」）。未配置时本服务会返回 'unconfigured' 状态，友好提示。
 */
import { isTauri } from '@/platform'

export type UpdateStatus = 'latest' | 'updated' | 'error' | 'unconfigured' | 'web'

export interface UpdateResult {
  status: UpdateStatus
  message: string
  version?: string
}

/** 获取当前版本号 */
export async function getAppVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import('@tauri-apps/api/app')
      return await getVersion()
    } catch {
      /* 退回到编译期版本 */
    }
  }
  return __APP_VERSION__
}

/**
 * 检查更新并（若有）下载安装、重启。
 * @param onProgress 进度文本回调（下载阶段）
 */
export async function checkAndInstall(onProgress?: (msg: string) => void): Promise<UpdateResult> {
  if (!isTauri()) {
    return { status: 'web', message: 'Web 版随网页托管更新，刷新页面即为最新。' }
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()

    if (!update) {
      return { status: 'latest', message: '已是最新版本。' }
    }

    onProgress?.(`发现新版本 ${update.version}，正在下载…`)
    let downloaded = 0
    let total = 0
    await update.downloadAndInstall((event: any) => {
      // 进度事件：Started / Progress / Finished
      if (event.event === 'Started') total = event.data?.contentLength ?? 0
      else if (event.event === 'Progress') {
        downloaded += event.data?.chunkLength ?? 0
        const pct = total ? Math.round((downloaded / total) * 100) : 0
        onProgress?.(`下载中… ${pct}%`)
      } else if (event.event === 'Finished') {
        onProgress?.('下载完成，准备安装…')
      }
    })

    // 安装后重启应用
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return { status: 'updated', message: '更新完成，正在重启…', version: update.version }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    // 未配置 endpoints/公钥时的常见报错，给出更友好的提示
    if (/config|endpoint|not configured|pubkey|no such/i.test(msg)) {
      return {
        status: 'unconfigured',
        message: '更新服务尚未配置（需设置更新源 endpoints 与签名公钥），暂无法自动更新。',
      }
    }
    return { status: 'error', message: `检查更新失败：${msg}` }
  }
}
