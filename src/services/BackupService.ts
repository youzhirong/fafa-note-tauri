/**
 * 备份 / 还原服务（导入导出 JSON）。
 *
 * 平台差异：
 *   - Tauri：可读写真实磁盘路径。
 *       · 导出：若设置里填了 backupPath，直接写到该目录；否则弹「保存」对话框。
 *       · 还原：若填了 restorePath，从该目录选文件；否则弹「打开」对话框。
 *   - Web：浏览器不能直接访问任意磁盘路径。
 *       · 导出：触发浏览器下载。
 *       · 还原：由 UI 用 <input type=file> 选文件，再调用 parseBackup()。
 *
 * 因此本服务把「读写文件」和「解析数据」拆开，UI 按平台组合调用。
 */
import { isTauri } from '@/platform'
import { BACKUP_VERSION, type BackupBundle, type Note, type Folder, type AppSettings } from '@/types'

/** 组装备份数据对象 */
export function buildBundle(
  notes: Note[],
  folders: Folder[],
  settings?: AppSettings,
): BackupBundle {
  return {
    app: 'fafa-note',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    notes,
    folders,
    settings,
  }
}

/** 解析并校验备份文本，返回结构化数据；格式不对则抛错 */
export function parseBackup(text: string): BackupBundle {
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('文件不是合法的 JSON')
  }
  if (data?.app !== 'fafa-note' || !Array.isArray(data.notes)) {
    throw new Error('这不是 fafa-note 的备份文件')
  }
  if (data.version > BACKUP_VERSION) {
    throw new Error(`备份版本(${data.version})高于当前应用支持的版本(${BACKUP_VERSION})，请升级应用`)
  }
  // 兼容字段缺失 / 旧版本备份：补全新增字段，避免导入后笔记「消失」
  data.folders = Array.isArray(data.folders) ? data.folders : []
  data.notes = data.notes.map((n: any) => ({
    ...n,
    tags: Array.isArray(n.tags) ? n.tags : [],
    deletedAt: n.deletedAt ?? null, // 旧备份无此字段，默认正常笔记
    order: typeof n.order === 'number' ? n.order : (n.updatedAt ?? Date.now()),
  }))
  return data as BackupBundle
}

/** 生成默认文件名 */
function defaultFileName(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `fafa-note-backup-${stamp}.json`
}

/**
 * 导出备份。
 * @param bundle  备份数据
 * @param backupPath  Tauri 端的默认备份目录（Web 端忽略）
 * @returns 实际写入的路径（Web 端返回下载文件名）
 */
export async function exportBackup(bundle: BackupBundle, backupPath = ''): Promise<string> {
  const json = JSON.stringify(bundle, null, 2)
  const fileName = defaultFileName()

  if (isTauri()) {
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')

    if (backupPath.trim()) {
      // 直接写到用户配置的备份目录
      if (!(await exists(backupPath))) {
        await mkdir(backupPath, { recursive: true })
      }
      const fullPath = `${backupPath.replace(/[\\/]$/, '')}/${fileName}`
      await writeTextFile(fullPath, json)
      return fullPath
    }

    // 没配置目录 → 弹保存对话框
    const { save } = await import('@tauri-apps/plugin-dialog')
    const target = await save({
      defaultPath: fileName,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    })
    if (!target) throw new Error('已取消导出')
    await writeTextFile(target, json)
    return target
  }

  // ---- Web：触发浏览器下载 ----
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return fileName
}

/** Web 端自动备份在 localStorage 的存储键 */
export const AUTO_BACKUP_KEY = 'fafa-note:autobackup'

/**
 * 自动备份（定时调度调用，静默执行，不弹对话框）。
 *   - Tauri：写入备份目录下的滚动文件 fafa-note-autobackup.json（每次覆盖，不堆积）。
 *     未设置备份目录则抛错（由调用方记录日志）。
 *   - Web：写入 localStorage（无后端/文件系统，作为可恢复快照；超容量会抛错）。
 * @returns 写入位置描述
 */
export async function autoBackup(bundle: BackupBundle, backupPath: string): Promise<string> {
  const json = JSON.stringify(bundle)

  if (isTauri()) {
    if (!backupPath.trim()) throw new Error('未设置备份目录，自动备份已跳过')
    const { writeTextFile, mkdir, exists } = await import('@tauri-apps/plugin-fs')
    if (!(await exists(backupPath))) await mkdir(backupPath, { recursive: true })
    const full = `${backupPath.replace(/[\\/]$/, '')}/fafa-note-autobackup.json`
    await writeTextFile(full, json)
    return full
  }

  try {
    localStorage.setItem(AUTO_BACKUP_KEY, json)
    return `localStorage(${AUTO_BACKUP_KEY})`
  } catch {
    throw new Error('自动备份写入失败（可能超出浏览器存储容量）')
  }
}

/**
 * 导出单个文本文件（单篇笔记导出为 .md / .txt 用）。
 * Tauri 弹保存对话框写磁盘；Web 触发浏览器下载。
 * @returns 实际写入路径（Web 端返回文件名）
 */
export async function exportTextFile(content: string, fileName: string): Promise<string> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeTextFile } = await import('@tauri-apps/plugin-fs')
    const ext = fileName.split('.').pop() || 'md'
    const target = await save({
      defaultPath: fileName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    })
    if (!target) throw new Error('已取消导出')
    await writeTextFile(target, content)
    return target
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return fileName
}

/**
 * 导出二进制文件（如 .xlsx）。
 * Tauri 弹保存对话框写磁盘（二进制 writeFile）；Web 触发浏览器下载。
 * @param data 文件二进制内容
 * @param fileName 默认文件名（含扩展名）
 * @param mime Web 下载用的 MIME 类型
 * @returns 实际写入路径（Web 端返回文件名）
 */
export async function exportBinaryFile(
  data: Uint8Array,
  fileName: string,
  mime: string,
): Promise<string> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const ext = fileName.split('.').pop() || 'bin'
    const target = await save({
      defaultPath: fileName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    })
    if (!target) throw new Error('已取消导出')
    await writeFile(target, data)
    return target
  }

  // 拷贝到独立 ArrayBuffer，确保 Blob 入参类型干净（规避 Uint8Array 泛型/共享内存的类型问题）
  const ab = new ArrayBuffer(data.byteLength)
  new Uint8Array(ab).set(data)
  const blob = new Blob([ab], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return fileName
}

/**
 * 从磁盘读取备份文本（仅 Tauri）。
 * @param restorePath 还原目录，用作对话框默认路径
 */
export async function readBackupViaDialog(restorePath = ''): Promise<BackupBundle> {
  if (!isTauri()) throw new Error('Web 端请使用文件选择器')

  const { open } = await import('@tauri-apps/plugin-dialog')
  const { readTextFile } = await import('@tauri-apps/plugin-fs')

  const selected = await open({
    multiple: false,
    directory: false,
    defaultPath: restorePath || undefined,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!selected || Array.isArray(selected)) throw new Error('已取消还原')

  const text = await readTextFile(selected as string)
  return parseBackup(text)
}

/** Web 端：从用户选择的 File 读取并解析 */
export async function readBackupFromFile(file: File): Promise<BackupBundle> {
  const text = await file.text()
  return parseBackup(text)
}

/**
 * 让用户选择一个目录（用于设置页配置「备份地址 / 还原地址」）。
 * 仅 Tauri 可用；Web 端返回空串。
 */
export async function pickDirectory(): Promise<string> {
  if (!isTauri()) return ''
  const { open } = await import('@tauri-apps/plugin-dialog')
  const dir = await open({ directory: true, multiple: false })
  return typeof dir === 'string' ? dir : ''
}
