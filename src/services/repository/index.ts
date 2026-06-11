/**
 * 存储仓库工厂。
 *
 * 全应用通过 getNoteRepository() 拿到「当前生效」的存储实现，
 * 这里是唯一需要切换存储引擎的地方。
 *
 * 切换到 SQLite 的方法（后期桌面端优化用）：
 *   1. 安装 @tauri-apps/plugin-sql，并在 src-tauri 注册插件；
 *   2. 新建 storage/sqlite/SqliteNoteRepository.ts 实现 INoteRepository；
 *   3. 在下面用 isTauri() 判断，桌面端返回 SQLite 实现、Web 端返回 IndexedDB 实现。
 *
 *   例如：
 *     import { isTauri } from '@/platform'
 *     return isTauri() ? new SqliteNoteRepository() : new IndexedDbNoteRepository()
 */
import type { INoteRepository } from './INoteRepository'
import { IndexedDbNoteRepository } from './IndexedDbNoteRepository'

let instance: INoteRepository | null = null

export function getNoteRepository(): INoteRepository {
  if (!instance) {
    // 默认：IndexedDB（Web + Tauri 通用）
    instance = new IndexedDbNoteRepository()
  }
  return instance
}

export type { INoteRepository }
