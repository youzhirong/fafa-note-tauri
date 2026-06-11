/**
 * 通用键值缓存（基于 IndexedDB / Dexie）。
 *
 * 为什么不用 localStorage：
 *   localStorage 上限约 5MB、且同步写、超限直接抛 QuotaExceededError，
 *   不适合缓存可能很大的内容（如 JSON 工具里粘贴的大文档）。
 *   IndexedDB 容量大得多（数百 MB+）、异步写，更稳。
 *
 * 为什么单独建库而不进笔记库（fafa-note）：
 *   - 与笔记数据完全解耦：这里的缓存坏掉/清空都不影响笔记；
 *   - 不必给生产笔记库做版本迁移（迁移有风险，且多处声明同名库易冲突）。
 *   - 同样是 IndexedDB，技术栈与笔记一致。
 *
 * 用法：kvGet/kvSet/kvRemove，value 统一存字符串（调用方自行 JSON 序列化）。
 */
import Dexie, { type Table } from 'dexie'

interface KvEntry {
  key: string
  value: string
}

class KvDb extends Dexie {
  kv!: Table<KvEntry, string>

  constructor() {
    super('fafa-note-kv') // 独立于笔记库 'fafa-note'
    this.version(1).stores({ kv: 'key' }) // 主键 = key
  }
}

const db = new KvDb()

/** 读取缓存；不存在或出错返回 undefined */
export async function kvGet(key: string): Promise<string | undefined> {
  try {
    const row = await db.kv.get(key)
    return row?.value
  } catch {
    return undefined
  }
}

/** 写入/覆盖缓存（同 key 覆盖，天然只保留最后一次） */
export async function kvSet(key: string, value: string): Promise<void> {
  await db.kv.put({ key, value })
}

/** 删除缓存 */
export async function kvRemove(key: string): Promise<void> {
  await db.kv.delete(key)
}
