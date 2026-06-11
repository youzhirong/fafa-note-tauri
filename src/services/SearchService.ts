/**
 * 搜索服务：基于 MiniSearch 的内存全文索引。
 *
 * 为什么不用数据库搜索？
 *   - IndexedDB 没有内置全文搜索；
 *   - MiniSearch 在内存里建倒排索引，对几千~几万条笔记的关键词搜索是毫秒级；
 *   - 支持前缀匹配、模糊匹配、多字段权重。
 *
 * 用法：笔记加载后调用 rebuild() 建索引；增删改时调用 add/update/remove 增量维护；
 * 搜索时调用 search()。store 层已封装好，UI 不用直接碰这里。
 *
 * 后期若换成 SQLite FTS5，可让 SearchService 改为调用数据库，对外接口不变。
 */
import MiniSearch from 'minisearch'
import type { Note } from '@/types'

class SearchService {
  private mini: MiniSearch<Note>
  /** 文件夹 id -> 名称映射，用于把「文件夹名」纳入全文搜索 */
  private folderNames: Record<string, string> = {}

  constructor() {
    this.mini = this.create()
  }

  private create() {
    // 捕获当前 folderNames 引用，extractField 在 add 时读取
    const folderNames = () => this.folderNames
    return new MiniSearch<Note>({
      fields: ['title', 'content', 'tags', 'folderName'], // 参与搜索的字段
      storeFields: ['id'], // 命中后返回的字段（只需 id，正文从 store 拿）
      searchOptions: {
        prefix: true, // 前缀匹配：输入 "lap" 能命中 "laptop"
        fuzzy: 0.2, // 容错：允许少量拼写差异
        boost: { title: 2 }, // 标题权重更高
      },
      extractField: (doc, field) => {
        // tags 是数组，转成空格分隔的字符串参与索引
        if (field === 'tags') return (doc.tags || []).join(' ')
        // folderName 是派生字段：按 folderId 查映射，使「搜文件夹名」能命中其下笔记
        if (field === 'folderName') return doc.folderId ? (folderNames()[doc.folderId] ?? '') : ''
        return (doc as any)[field]
      },
    })
  }

  /** 设置文件夹名映射（在 rebuild/add 前调用，保证派生字段可解析） */
  setFolderNames(map: Record<string, string>): void {
    this.folderNames = map
  }

  /** 用全部笔记重建索引（首次加载 / 批量导入后调用） */
  rebuild(notes: Note[]): void {
    this.mini = this.create()
    this.mini.addAll(notes)
  }

  add(note: Note): void {
    this.mini.add(note)
  }

  update(note: Note): void {
    // MiniSearch 不能直接 update，需先删后加（id 不存在时 remove 会抛错，故包一层）
    try {
      this.mini.discard(note.id)
    } catch {
      /* 索引中没有该条，忽略 */
    }
    this.mini.add(note)
  }

  remove(id: string): void {
    try {
      this.mini.discard(id)
    } catch {
      /* 忽略不存在的 id */
    }
  }

  /** 返回命中的笔记 id 列表（按相关度排序） */
  search(query: string): string[] {
    const q = query.trim()
    if (!q) return []
    return this.mini.search(q).map((r) => r.id as string)
  }
}

// 单例，全应用共用一份索引
export const searchService = new SearchService()
