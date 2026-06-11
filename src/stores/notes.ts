/**
 * 笔记 store：应用的核心数据状态。
 *
 * 职责：
 *   - 通过 repository（存储层）加载/保存笔记与文件夹；
 *   - 维护当前选中笔记、当前筛选（文件夹）、搜索关键词；
 *   - 把搜索结果、列表排序等「派生数据」用 computed 暴露给 UI；
 *   - 同步维护 SearchService 的全文索引。
 *
 * UI 只和这个 store 打交道，不直接碰存储层和搜索服务。
 */
import { defineStore, acceptHMRUpdate } from 'pinia'
import { ref, computed } from 'vue'
import type { Note, Folder, NoteFormat } from '@/types'
import { genId } from '@/platform'
import { getNoteRepository } from '@/services/repository'
import { searchService } from '@/services/SearchService'

const repo = getNoteRepository()

/** 特殊筛选标识：全部笔记 / 未分类 */
export const FILTER_ALL = '__all__'
export const FILTER_UNFILED = '__unfiled__'

export const useNotesStore = defineStore('notes', () => {
  // ---------- 原始状态 ----------
  const notes = ref<Note[]>([])
  const folders = ref<Folder[]>([])
  const loaded = ref(false)

  /** 当前选中的筛选：FILTER_ALL / FILTER_UNFILED / 某个 folderId */
  const currentFilter = ref<string>(FILTER_ALL)
  /** 当前打开的笔记 id */
  const selectedId = ref<string | null>(null)
  /** 搜索关键词 */
  const keyword = ref('')
  /** 当前选中用于筛选的标签（多选，AND 语义：笔记需包含全部选中标签） */
  const selectedTags = ref<string[]>([])

  /** 把文件夹名映射同步给搜索服务（让「搜文件夹名」能命中其下笔记） */
  function syncFolderNames() {
    const map: Record<string, string> = {}
    for (const f of folders.value) map[f.id] = f.name
    searchService.setFolderNames(map)
  }

  /** 重建搜索索引（仅索引未删除笔记），先同步文件夹名 */
  function rebuildIndex() {
    syncFolderNames()
    searchService.rebuild(notes.value.filter((n) => n.deletedAt === null))
  }

  /** 文件夹按 order 升序排列（用于侧边栏/下拉的稳定展示顺序） */
  function sortFolders() {
    folders.value.sort((a, b) => a.order - b.order)
  }

  // ---------- 初始化 ----------
  async function init() {
    if (loaded.value) return
    await repo.init()
    notes.value = await repo.listNotes()
    folders.value = await repo.listFolders()
    sortFolders()
    rebuildIndex() // 建全文索引（含文件夹名）
    loaded.value = true
  }

  // ---------- 派生数据 ----------
  /** 搜索命中的 id 集合（无关键词时为 null = 不过滤） */
  const searchHitIds = computed<Set<string> | null>(() => {
    if (!keyword.value.trim()) return null
    return new Set(searchService.search(keyword.value))
  })

  /** 经过「文件夹筛选 + 搜索 + 排序」后的笔记列表，供中间列表渲染（不含回收站） */
  const visibleNotes = computed<Note[]>(() => {
    // 0) 排除已软删除（回收站）的笔记
    let list = notes.value.filter((n) => n.deletedAt === null)

    // 1) 文件夹筛选
    if (currentFilter.value === FILTER_UNFILED) {
      list = list.filter((n) => n.folderId === null)
    } else if (currentFilter.value !== FILTER_ALL) {
      list = list.filter((n) => n.folderId === currentFilter.value)
    }

    // 2) 标签筛选（AND：需包含全部选中标签）
    if (selectedTags.value.length) {
      list = list.filter((n) => selectedTags.value.every((t) => n.tags.includes(t)))
    }

    // 3) 搜索筛选
    const hits = searchHitIds.value
    if (hits) list = list.filter((n) => hits.has(n.id))

    // 4) 排序：置顶优先，其次按手动排序权重 order 倒序
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return b.order - a.order
    })
  })

  /** 全部已用标签（去重，按字母序），供编辑器联想与筛选条展示 */
  const allTags = computed<string[]>(() => {
    const set = new Set<string>()
    for (const n of notes.value) {
      if (n.deletedAt !== null) continue
      n.tags.forEach((t) => set.add(t))
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  })

  /** 当前选中的笔记对象 */
  const selectedNote = computed<Note | null>(
    () => notes.value.find((n) => n.id === selectedId.value) ?? null,
  )

  /** 每个文件夹的笔记数量（侧边栏显示用，不含回收站） */
  const folderCounts = computed<Record<string, number>>(() => {
    const map: Record<string, number> = {}
    for (const n of notes.value) {
      if (n.deletedAt !== null) continue
      const key = n.folderId ?? FILTER_UNFILED
      map[key] = (map[key] || 0) + 1
    }
    return map
  })

  /** 回收站列表：已软删除的笔记，按删除时间倒序 */
  const trashedNotes = computed<Note[]>(() =>
    notes.value
      .filter((n) => n.deletedAt !== null)
      .sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  )

  // ---------- 笔记操作 ----------
  async function createNote(opts?: { folderId?: string | null; format?: NoteFormat }) {
    const now = Date.now()
    const note: Note = {
      id: genId(),
      title: '未命名笔记',
      content: '',
      format: opts?.format ?? 'md',
      folderId: opts?.folderId ?? (currentFilter.value.startsWith('__') ? null : currentFilter.value),
      tags: [],
      pinned: false,
      order: now, // 默认按时间排，最新在上
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await repo.saveNote(note)
    notes.value.push(note)
    searchService.add(note)
    selectedId.value = note.id
    return note
  }

  /** 更新笔记字段（局部），自动刷新 updatedAt 并同步索引 */
  async function updateNote(id: string, patch: Partial<Note>) {
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx === -1) return
    const updated: Note = { ...notes.value[idx], ...patch, updatedAt: Date.now() }
    notes.value[idx] = updated
    await repo.saveNote(updated)
    searchService.update(updated)
  }

  /** 软删除：移入回收站（可还原）。从搜索索引移除，使其不再被搜到。 */
  async function deleteNote(id: string) {
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx === -1) return
    const updated: Note = { ...notes.value[idx], deletedAt: Date.now() }
    notes.value[idx] = updated
    await repo.saveNote(updated)
    searchService.remove(id)
    if (selectedId.value === id) selectedId.value = null
  }

  /** 从回收站还原 */
  async function restoreNote(id: string) {
    const idx = notes.value.findIndex((n) => n.id === id)
    if (idx === -1) return
    const updated: Note = { ...notes.value[idx], deletedAt: null }
    notes.value[idx] = updated
    await repo.saveNote(updated)
    searchService.add(updated) // 重新进入搜索索引
  }

  /** 永久删除单条（不可恢复） */
  async function deleteNotePermanent(id: string) {
    await repo.deleteNote(id)
    notes.value = notes.value.filter((n) => n.id !== id)
    searchService.remove(id)
    if (selectedId.value === id) selectedId.value = null
  }

  /** 清空回收站：永久删除所有已软删除的笔记 */
  async function emptyTrash() {
    const ids = notes.value.filter((n) => n.deletedAt !== null).map((n) => n.id)
    for (const id of ids) await repo.deleteNote(id)
    notes.value = notes.value.filter((n) => n.deletedAt === null)
  }

  function select(id: string | null) {
    selectedId.value = id
  }

  /**
   * 按给定的 id 顺序重排笔记（拖拽排序用）。
   * 重新分配 order 值（靠前的更大），不改 updatedAt，使手动顺序稳定保留。
   */
  async function reorderNotes(orderedIds: string[]) {
    const base = Date.now() + orderedIds.length
    for (let i = 0; i < orderedIds.length; i++) {
      const idx = notes.value.findIndex((n) => n.id === orderedIds[i])
      if (idx === -1) continue
      const updated: Note = { ...notes.value[idx], order: base - i }
      notes.value[idx] = updated
      await repo.saveNote(updated)
    }
  }

  /** 移动笔记到指定文件夹（null = 未分类） */
  async function moveToFolder(id: string, folderId: string | null) {
    await updateNote(id, { folderId })
  }

  /** 切换标签筛选的选中状态 */
  function toggleTagFilter(tag: string) {
    const i = selectedTags.value.indexOf(tag)
    if (i === -1) selectedTags.value.push(tag)
    else selectedTags.value.splice(i, 1)
  }

  function clearTagFilter() {
    selectedTags.value = []
  }

  // ---------- 文件夹操作 ----------
  async function createFolder(name: string) {
    const folder: Folder = {
      id: genId(),
      name,
      parentId: null,
      order: folders.value.length,
      createdAt: Date.now(),
    }
    await repo.saveFolder(folder)
    folders.value.push(folder)
    syncFolderNames() // 新文件夹名进入搜索映射
    return folder
  }

  async function renameFolder(id: string, name: string) {
    const f = folders.value.find((x) => x.id === id)
    if (!f) return
    f.name = name
    await repo.saveFolder({ ...f })
    rebuildIndex() // 文件夹名变了，重建索引让其下笔记可被新名搜到
  }

  /** 按给定 id 顺序重排文件夹（拖拽排序用），重写 order 并持久化 */
  async function reorderFolders(orderedIds: string[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      const f = folders.value.find((x) => x.id === orderedIds[i])
      if (!f) continue
      f.order = i
      await repo.saveFolder({ ...f })
    }
    sortFolders()
  }

  async function deleteFolder(id: string) {
    await repo.deleteFolder(id)
    folders.value = folders.value.filter((f) => f.id !== id)
    // 该文件夹下笔记被归为未分类，刷新内存
    notes.value = notes.value.map((n) => (n.folderId === id ? { ...n, folderId: null } : n))
    if (currentFilter.value === id) currentFilter.value = FILTER_ALL
    rebuildIndex() // 文件夹消失，更新索引中的 folderName
  }

  // ---------- 备份还原后刷新内存 ----------
  /** 导入备份后调用：重新从存储层加载全部数据并重建索引 */
  async function reloadFromRepo() {
    notes.value = await repo.listNotes()
    folders.value = await repo.listFolders()
    sortFolders()
    rebuildIndex()
    selectedId.value = null
  }

  // ---------- 标签管理（重命名 / 删除，作用于全部笔记） ----------
  /** 内部：直接写库并更新索引，不改 updatedAt（标签维护不应算作"编辑"） */
  async function patchTagsRaw(note: Note, tags: string[]) {
    const idx = notes.value.findIndex((n) => n.id === note.id)
    if (idx === -1) return
    const updated: Note = { ...note, tags }
    notes.value[idx] = updated
    await repo.saveNote(updated)
    searchService.update(updated)
  }

  /** 重命名标签：把所有笔记里的 oldTag 改成 newTag（去重） */
  async function renameTag(oldTag: string, newTag: string) {
    const nt = newTag.trim()
    if (!nt || nt === oldTag) return
    for (const n of [...notes.value]) {
      if (!n.tags.includes(oldTag)) continue
      await patchTagsRaw(n, Array.from(new Set(n.tags.map((t) => (t === oldTag ? nt : t)))))
    }
    const si = selectedTags.value.indexOf(oldTag)
    if (si !== -1) selectedTags.value.splice(si, 1, nt)
  }

  /** 删除标签：从所有笔记移除该标签 */
  async function deleteTag(tag: string) {
    for (const n of [...notes.value]) {
      if (!n.tags.includes(tag)) continue
      await patchTagsRaw(n, n.tags.filter((t) => t !== tag))
    }
    const si = selectedTags.value.indexOf(tag)
    if (si !== -1) selectedTags.value.splice(si, 1)
  }

  // ---------- 批量操作 ----------
  /** 批量软删除（移入回收站） */
  async function bulkDelete(ids: string[]) {
    for (const id of ids) await deleteNote(id)
  }
  /** 批量移动到文件夹 */
  async function bulkMove(ids: string[], folderId: string | null) {
    for (const id of ids) await moveToFolder(id, folderId)
  }

  // ---------- 双链 ----------
  /** 按标题查找未删除笔记（大小写不敏感、去空白） */
  function findByTitle(title: string): Note | undefined {
    const t = title.trim().toLowerCase()
    return notes.value.find((n) => n.deletedAt === null && n.title.trim().toLowerCase() === t)
  }

  /** 打开同名笔记；不存在则新建一篇并打开（[[双链]] 点击用） */
  async function openOrCreateByTitle(title: string): Promise<Note> {
    const found = findByTitle(title)
    if (found) {
      selectedId.value = found.id
      return found
    }
    const n = await createNote()
    await updateNote(n.id, { title: title.trim() })
    return n
  }

  return {
    // state
    notes,
    folders,
    loaded,
    currentFilter,
    selectedId,
    keyword,
    selectedTags,
    // getters
    visibleNotes,
    trashedNotes,
    selectedNote,
    folderCounts,
    allTags,
    // actions
    init,
    createNote,
    updateNote,
    deleteNote,
    restoreNote,
    deleteNotePermanent,
    emptyTrash,
    select,
    reorderNotes,
    moveToFolder,
    toggleTagFilter,
    clearTagFilter,
    renameTag,
    deleteTag,
    bulkDelete,
    bulkMove,
    findByTitle,
    openOrCreateByTitle,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    reloadFromRepo,
  }
})

// HMR：编辑本 store 时热替换运行中的实例（新增的 action 也会即时生效，避免出现
// "xxx is not a function" 的陈旧实例问题）。
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useNotesStore, import.meta.hot))
}
