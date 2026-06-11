/**
 * 存储层抽象接口（Repository 模式）。
 *
 * ★ 这是整个架构「可扩展」的核心 ★
 * 上层（store / service）只依赖这个接口，不关心数据实际存在哪里。
 * 默认实现是 IndexedDbNoteRepository（浏览器 + Tauri 都能跑）。
 * 后期想在桌面端换成 SQLite，只需新增一个实现该接口的类，
 * 然后在 repository/index.ts 的工厂里切换即可，UI 完全不用动。
 */
import type { Note, Folder } from '@/types'

export interface INoteRepository {
  /** 初始化（建表 / 打开数据库 / 迁移）。应用启动时调用一次。 */
  init(): Promise<void>

  // ---------- 笔记 ----------
  /** 获取全部笔记（按更新时间倒序由上层决定，这里只负责取数据） */
  listNotes(): Promise<Note[]>
  getNote(id: string): Promise<Note | undefined>
  /** 新增或更新（upsert） */
  saveNote(note: Note): Promise<void>
  deleteNote(id: string): Promise<void>

  // ---------- 文件夹 ----------
  listFolders(): Promise<Folder[]>
  saveFolder(folder: Folder): Promise<void>
  deleteFolder(id: string): Promise<void>

  // ---------- 批量（导入 / 还原备份用） ----------
  /** 用给定数据整体替换或合并；replace=true 时先清空 */
  bulkImport(data: { notes: Note[]; folders: Folder[] }, replace: boolean): Promise<void>
  /** 清空所有数据（谨慎） */
  clearAll(): Promise<void>
}
