/**
 * 版本与更新服务。
 *
 * - 版本号：Tauri 端取应用真实版本（tauri.conf.json，由 app.config.json 同步而来），
 *   Web 端用编译期注入的 __APP_VERSION__（同样来自 app.config.json）。
 * - 检查更新：仅桌面端（Tauri）有意义。流程拆成两步，把「是否升级」的决定权交给用户：
 *     1) checkForUpdate()       —— 只查询有没有新版本、拿到更新说明，**不下载**。
 *     2) runDownloadAndInstall() —— 用户确认后才下载、安装并重启。
 *   Web 端随网页托管更新，刷新即最新，无需更新逻辑。
 *
 * 注意：自动更新要真正可用，还需在 tauri.conf.json 配置 plugins.updater 的 endpoints 与签名公钥
 * （见 docs/扩展指南.md「启用自动更新」）。未配置时本服务会返回 'unconfigured' 状态，友好提示。
 */
import { isTauri } from '@/platform'

/** plugin-updater 的 check() 返回的更新对象（动态 import，避免 Web 端打包报错） */
export type TauriUpdate = {
  version: string
  body?: string | null
  downloadAndInstall: (onEvent: (event: any) => void) => Promise<void>
}

export type CheckStatus = 'available' | 'latest' | 'web' | 'unconfigured' | 'error'

export interface CheckResult {
  status: CheckStatus
  message: string
  /** 是否发现可用的新版本 */
  available: boolean
  /** 新版本号（available 时有值） */
  version?: string
  /** 更新说明 / release notes（available 时尽量有值） */
  notes?: string
  /** plugin-updater 的更新句柄，供 runDownloadAndInstall 使用（不要放进响应式对象，需 markRaw） */
  update?: TauriUpdate
}

export type UpdateStatus = 'updated' | 'error'

export interface UpdateResult {
  status: UpdateStatus
  message: string
  version?: string
}

/** 把未配置 endpoints/公钥时的常见报错，识别成更友好的提示 */
function isUnconfiguredError(msg: string): boolean {
  return /config|endpoint|not configured|pubkey|no such/i.test(msg)
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
 * 仅检查是否有新版本，**不下载**。
 * 发现新版本时返回 version / notes 与 update 句柄，由调用方决定是否继续下载。
 */
export async function checkForUpdate(): Promise<CheckResult> {
  if (!isTauri()) {
    return {
      status: 'web',
      available: false,
      message: 'Web 版随网页托管更新，刷新页面即为最新。',
    }
  }

  try {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = (await check()) as TauriUpdate | null

    if (!update) {
      return { status: 'latest', available: false, message: '已是最新版本。' }
    }

    return {
      status: 'available',
      available: true,
      version: update.version,
      notes: (update.body ?? '').trim() || '（本次更新未提供更新说明）',
      message: `发现新版本 ${update.version}`,
      update,
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    if (isUnconfiguredError(msg)) {
      return {
        status: 'unconfigured',
        available: false,
        message: '更新服务尚未配置（需设置更新源 endpoints 与签名公钥），暂无法自动更新。',
      }
    }
    return { status: 'error', available: false, message: `检查更新失败：${msg}` }
  }
}

/**
 * 下载并安装指定更新，完成后重启应用。
 * 仅在用户确认升级后调用。
 * @param update     由 checkForUpdate() 返回的更新句柄
 * @param onProgress 进度回调，传入 0–100 的百分比与一段文本
 */
export async function runDownloadAndInstall(
  update: TauriUpdate,
  onProgress?: (pct: number, msg: string) => void,
): Promise<UpdateResult> {
  try {
    onProgress?.(0, `正在下载新版本 ${update.version}…`)
    let downloaded = 0
    let total = 0
    await update.downloadAndInstall((event: any) => {
      // 进度事件：Started / Progress / Finished
      if (event.event === 'Started') {
        total = event.data?.contentLength ?? 0
      } else if (event.event === 'Progress') {
        downloaded += event.data?.chunkLength ?? 0
        const pct = total ? Math.round((downloaded / total) * 100) : 0
        onProgress?.(pct, `下载中… ${pct}%`)
      } else if (event.event === 'Finished') {
        onProgress?.(100, '下载完成，准备安装…')
      }
    })

    // 安装后重启应用
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
    return { status: 'updated', message: '更新完成，正在重启…', version: update.version }
  } catch (e: any) {
    const msg = String(e?.message ?? e)
    return { status: 'error', message: `更新失败：${msg}` }
  }
}
