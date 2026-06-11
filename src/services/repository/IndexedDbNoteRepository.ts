/**
 * 基于 IndexedDB 的存储实现（使用 Dexie 封装）。
 *
 * 为什么用 IndexedDB？
 *   - 浏览器原生，无需后端；
 *   - Tauri 的 WebView 同样支持，因此「一套实现跑全平台」；
 *   - 容量远大于 localStorage，适合存大量笔记正文。
 *
 * 数据库版本迁移：
 *   Dexie 通过 version(n).stores(...) 声明每个版本的表结构。
 *   后期改结构时，新增一个 this.version(2).stores({...}).upgrade(tx => {...})，
 *   不要修改已发布的旧版本声明，否则用户本地数据会迁移失败。
 */
import Dexie, { type Table } from 'dexie'
import type { Note, Folder } from '@/types'
import type { INoteRepository } from './INoteRepository'

class FafaNoteDb extends Dexie {
  // “!” 告诉 TS 这些字段会在构造函数里由 Dexie 赋值
  notes!: Table<Note, string>
  folders!: Table<Folder, string>

  constructor() {
    super('fafa-note') // IndexedDB 数据库名

    // ---- v1 表结构 ----
    // 主键是 id；后面的字段是建立索引的列（用于快速查询 / 排序）
    this.version(1).stores({
      notes: 'id, folderId, updatedAt, pinned, title',
      folders: 'id, parentId, order',
    })

    // ---- v2：新增软删除字段 deletedAt，并建索引（回收站功能） ----
    this.version(2)
      .stores({
        // 给 deletedAt 建索引，便于按「是否删除」快速过滤
        notes: 'id, folderId, updatedAt, pinned, title, deletedAt',
        folders: 'id, parentId, order',
      })
      .upgrade(async (tx) => {
        // 旧数据没有该字段，统一补成 null（正常笔记）
        await tx
          .table('notes')
          .toCollection()
          .modify((n) => {
            if (n.deletedAt === undefined) n.deletedAt = null
          })
      })

    // ---- v3：新增手动排序字段 order（拖拽排序用），默认用 updatedAt 回填 ----
    this.version(3)
      .stores({
        notes: 'id, folderId, updatedAt, pinned, title, deletedAt, order',
        folders: 'id, parentId, order',
      })
      .upgrade(async (tx) => {
        await tx
          .table('notes')
          .toCollection()
          .modify((n) => {
            if (n.order === undefined) n.order = n.updatedAt ?? Date.now()
          })
      })
  }
}

/**
 * 去响应式 + 深拷贝成纯对象。
 *
 * 为什么必须做：store 里的笔记/文件夹是 Vue 的响应式对象（Proxy），
 * 其嵌套字段（如 tags 数组）也是 Proxy。IndexedDB 写入使用结构化克隆
 * (structured clone)，**无法克隆 Proxy**，会抛 DataCloneError。
 * 这里统一转成普通对象后再落库。Note/Folder 都是 JSON 安全的，故用 JSON 往返最简单可靠。
 */
function plain<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

export class IndexedDbNoteRepository implements INoteRepository {
  private db = new FafaNoteDb()

  async init(): Promise<void> {
    // Dexie 在首次访问时会自动打开；这里显式 open 以便尽早暴露错误
    await this.db.open()
  }

  // ---------- 笔记 ----------
  listNotes(): Promise<Note[]> {
    return this.db.notes.toArray()
  }

  getNote(id: string): Promise<Note | undefined> {
    return this.db.notes.get(id)
  }

  async saveNote(note: Note): Promise<void> {
    await this.db.notes.put(plain(note)) // put = 有则更新，无则插入（去响应式后再写）
  }

  async deleteNote(id: string): Promise<void> {
    await this.db.notes.delete(id)
  }

  // ---------- 文件夹 ----------
  listFolders(): Promise<Folder[]> {
    return this.db.folders.toArray()
  }

  async saveFolder(folder: Folder): Promise<void> {
    await this.db.folders.put(plain(folder))
  }

  async deleteFolder(id: string): Promise<void> {
    // 删除文件夹时，把其下笔记归为「未分类」，避免出现孤儿数据
    await this.db.transaction('rw', this.db.notes, this.db.folders, async () => {
      await this.db.notes.where('folderId').equals(id).modify({ folderId: null })
      await this.db.folders.delete(id)
    })
  }

  // ---------- 批量 ----------
  async bulkImport(data: { notes: Note[]; folders: Folder[] }, replace: boolean): Promise<void> {
    await this.db.transaction('rw', this.db.notes, this.db.folders, async () => {
      if (replace) {
        await this.db.notes.clear()
        await this.db.folders.clear()
      }
      // bulkPut：合并模式下同 id 会被覆盖（以导入数据为准）；去响应式后再写
      await this.db.folders.bulkPut(plain(data.folders))
      await this.db.notes.bulkPut(plain(data.notes))
    })
  }

  async clearAll(): Promise<void> {
    await this.db.transaction('rw', this.db.notes, this.db.folders, async () => {
      await this.db.notes.clear()
      await this.db.folders.clear()
    })
  }
}
