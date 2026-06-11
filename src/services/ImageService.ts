/**
 * 图片服务：把粘贴/上传的图片转成可在 Markdown 里引用的 URL。
 *
 * 平台策略（按你的要求）：
 *   - Web：转 base64 data URL 内联返回。图片随笔记正文一起存进 IndexedDB，
 *     不依赖外部文件，导出备份也自带，刷新/换机都不丢。
 *     （代价：大图会让笔记体积变大；如需优化可改为单独的 IndexedDB 图片表 + Blob URL。）
 *   - Tauri：写入应用数据目录 appData/images/ 下的真实文件，
 *     通过 convertFileSrc 生成 asset 协议 URL 供 WebView 显示。图片落在本地磁盘。
 */
import { isTauri, genId } from '@/platform'

/** 从文件名/MIME 推断扩展名 */
function extOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()! : ''
  if (fromName) return fromName.toLowerCase()
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  }
  return map[file.type] || 'png'
}

/** Web：File → base64 data URL */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * 保存一张图片，返回可直接写进 Markdown 的 URL。
 */
export async function saveImage(file: File): Promise<string> {
  if (isTauri()) {
    const { writeFile, mkdir, exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
    const { appDataDir, join } = await import('@tauri-apps/api/path')
    const { convertFileSrc } = await import('@tauri-apps/api/core')

    const name = `${genId()}.${extOf(file)}`
    // 确保 appData/images 目录存在
    if (!(await exists('images', { baseDir: BaseDirectory.AppData }))) {
      await mkdir('images', { baseDir: BaseDirectory.AppData, recursive: true })
    }
    // 写入二进制
    const bytes = new Uint8Array(await file.arrayBuffer())
    await writeFile(`images/${name}`, bytes, { baseDir: BaseDirectory.AppData })

    // 生成 WebView 可访问的 asset URL
    const full = await join(await appDataDir(), 'images', name)
    return convertFileSrc(full)
  }

  // Web：内联 base64
  return fileToDataUrl(file)
}
