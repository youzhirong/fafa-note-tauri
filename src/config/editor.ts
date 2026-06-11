/**
 * md-editor-v3 工具栏配置。
 *
 * 用户可在「设置」里勾选要显示的工具栏按钮，配置存进 settings.editorToolbars，
 * NoteEditor 把它传给 MdEditor 的 :toolbars。
 *
 * 这里列出常用、可独立开关的按钮名（与 md-editor-v3 的工具栏标识一致）。
 * 完整列表见 md-editor-v3 文档；如需更多，往 AVAILABLE_TOOLBARS 里加即可。
 */
export interface ToolbarOption {
  label: string
  value: string
}

/** 可供选择的工具栏按钮（label 用于设置页展示） */
export const AVAILABLE_TOOLBARS: ToolbarOption[] = [
  { label: '加粗', value: 'bold' },
  { label: '斜体', value: 'italic' },
  { label: '删除线', value: 'strikeThrough' },
  { label: '下划线', value: 'underline' },
  { label: '标题', value: 'title' },
  { label: '引用', value: 'quote' },
  { label: '无序列表', value: 'unorderedList' },
  { label: '有序列表', value: 'orderedList' },
  { label: '任务列表', value: 'task' },
  { label: '行内代码', value: 'codeRow' },
  { label: '代码块', value: 'code' },
  { label: '链接', value: 'link' },
  { label: '图片', value: 'image' },
  { label: '表格', value: 'table' },
  { label: '公式(katex)', value: 'katex' },
  { label: '流程图(mermaid)', value: 'mermaid' },
  { label: '撤销', value: 'revoke' },
  { label: '重做', value: 'next' },
  { label: '预览', value: 'preview' },
  { label: '目录', value: 'catalog' },
]

/** 默认显示的工具栏（兼顾常用与简洁） */
export const DEFAULT_TOOLBARS: string[] = [
  'bold',
  'italic',
  'strikeThrough',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'task',
  'codeRow',
  'code',
  'link',
  'image',
  'table',
  'revoke',
  'next',
  'preview',
  'catalog',
]
