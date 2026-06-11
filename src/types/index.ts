/**
 * 全局数据模型定义。
 *
 * 设计原则：所有实体都带 id / createdAt / updatedAt，方便排序、同步与冲突处理。
 * 后期新增字段时，尽量「只增不改」，并在存储层做好版本迁移（见 storage 层注释）。
 */
import { DEFAULT_TOOLBARS } from '@/config/editor'

/** 笔记内容格式 */
export type NoteFormat = 'md' | 'txt'

/**
 * 笔记实体。
 * content 直接存正文文本（Markdown 或纯文本），不拆表，简单且利于全文搜索。
 */
export interface Note {
  id: string
  title: string
  content: string
  format: NoteFormat
  /** 所属文件夹 id，null 表示「未分类」 */
  folderId: string | null
  /** 标签（预留，后期做标签筛选） */
  tags: string[]
  /** 是否置顶 */
  pinned: boolean
  /**
   * 手动排序权重，越大越靠前（列表按 pinned → order 倒序排列）。
   * 新建笔记取当前时间戳，因此默认「最新在上」；拖拽排序会重写该值。
   */
  order: number
  /**
   * 软删除时间戳。null = 正常笔记；有值 = 已在回收站（值为删除时间）。
   * 软删除让误删可恢复，回收站里可还原或永久删除。
   */
  deletedAt: number | null
  /** 毫秒时间戳 */
  createdAt: number
  updatedAt: number
}

/**
 * 文件夹 / 分类。parentId 支持后期做成树形结构。
 */
export interface Folder {
  id: string
  name: string
  parentId: string | null
  /** 排序权重，越小越靠前 */
  order: number
  createdAt: number
}

/** 三列布局相关的 UI 配置，会被持久化，记住用户习惯 */
export interface LayoutSettings {
  /** 左侧菜单栏是否收起 */
  sidebarCollapsed: boolean
  /** 中间笔记列表的宽度百分比（Splitter 用） */
  listSizePct: number
  /** 左侧菜单栏宽度百分比 */
  sidebarSizePct: number
}

/**
 * 应用设置。
 * 注意：备份/还原地址在 Web 端无意义（浏览器不能直接写任意磁盘路径），
 * 仅在 Tauri 桌面/移动端生效；Web 端走「下载 / 选择文件」交互。
 */
export interface AppSettings {
  /** 主题：跟随系统 / 亮 / 暗 */
  theme: 'system' | 'light' | 'dark'
  /** 备份目录（仅 Tauri 生效），导出时默认写到这里 */
  backupPath: string
  /** 还原目录（仅 Tauri 生效），还原时默认从这里找文件 */
  restorePath: string
  /**
   * 代理地址，用于 Web 端解决跨域(CORS)。
   * 支持两种写法：
   *   1) 占位符模式： https://my-proxy.com/?url={url}  —— {url} 会被替换为目标地址
   *   2) 前缀模式：   https://my-proxy.com/            —— 直接拼在目标地址前面
   * 留空则不使用代理。Tauri 端不需要代理（plugin-http 无跨域限制）。
   */
  proxyUrl: string
  /** Markdown 编辑器要显示的工具栏按钮（取值见 config/editor.ts） */
  editorToolbars: string[]
  /** 编辑器/预览字号（px） */
  editorFontSize: number
  /** 打开笔记时的默认视图模式 */
  defaultViewMode: EditorViewMode
  /** 标签颜色映射：标签名 -> 颜色值（十六进制），未设置则用主题色 */
  tagColors: Record<string, string>
  /** 是否开启自动定时备份 */
  autoBackup: boolean
  /** 自动备份间隔（分钟） */
  autoBackupIntervalMinutes: number
  /** 上次自动备份时间戳（0 表示从未） */
  lastAutoBackupAt: number
  /** 布局相关 */
  layout: LayoutSettings
}

/** Markdown 视图模式：仅编辑 / 编辑+预览 / 仅预览 */
export type EditorViewMode = 'edit' | 'live' | 'preview'

/** 设置默认值，首次启动 / 重置时使用 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  backupPath: '',
  restorePath: '',
  proxyUrl: '',
  editorToolbars: [...DEFAULT_TOOLBARS],
  editorFontSize: 14,
  defaultViewMode: 'live',
  tagColors: {},
  autoBackup: false,
  autoBackupIntervalMinutes: 30,
  lastAutoBackupAt: 0,
  layout: {
    sidebarCollapsed: false,
    sidebarSizePct: 18,
    listSizePct: 28,
  },
}

/**
 * 备份文件的结构（导出 JSON 时的顶层对象）。
 * 带 version 字段，方便未来格式升级时做兼容处理。
 */
export interface BackupBundle {
  app: 'fafa-note'
  version: number
  exportedAt: number
  notes: Note[]
  folders: Folder[]
  /** 设置可选择性导出，默认导出（不含本机敏感路径时可剔除） */
  settings?: AppSettings
}

/** 当前备份格式版本号 */
export const BACKUP_VERSION = 1
