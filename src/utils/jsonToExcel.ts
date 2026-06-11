/**
 * 把 JSON 转成 Excel（.xlsx）字节流。
 *
 * 规则（按需求）：
 *   - 顶层是「数组」    → 直接作为表格的行；
 *   - 顶层是「对象」    → 包成单元素数组，导出为 1 行；
 *   - 每行都是纯对象    → 列 = 所有行 key 的并集（按首次出现顺序），列式表格；
 *   - 否则（基本类型 / 数组元素 / 混合）→ 单列「值」，每行一个值。
 *
 * ★ 所有单元格一律以「文本」写入（t:'s' + 数字格式 '@'），
 *   彻底避免 Excel 把大数字 / 长串数字显示成科学计数法（如 1.23457E+18）。
 *   嵌套的对象 / 数组用 JSON.stringify 转成文本放进单元格。
 *
 * 注意（无法在此层解决的精度问题）：
 *   传入的 value 已是 JSON.parse 的结果，超过 2^53 的整数在 JS 阶段已丢精度。
 *   若需 100% 保留原始大整数，应在解析阶段用 bigint 解析器，超出本工具范围。
 *
 * xlsx 体积较大，采用动态 import，仅首次导出时按需加载。
 */

/** 任意值 → 单元格文本 */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v) // 嵌套对象/数组 → JSON 文本
  return String(v) // number / boolean / string → 字符串（不做数值化，避免科学计数法）
}

/**
 * 生成 .xlsx 字节流。
 * @param value 已解析的 JSON 值
 * @returns xlsx 文件的二进制内容
 * @throws 数据为空时抛错
 */
export async function jsonToXlsxBytes(value: unknown): Promise<Uint8Array> {
  const XLSX = await import('xlsx')

  // 对象 → 包成数组（1 行）；数组 → 原样
  const rows: unknown[] = Array.isArray(value) ? value : [value]
  if (rows.length === 0) throw new Error('数据为空，无法导出')

  // 是否每行都是纯对象（决定列式表格 or 单列）
  const allObjects = rows.every((r) => r !== null && typeof r === 'object' && !Array.isArray(r))

  let aoa: string[][]
  if (allObjects) {
    // 列 = 所有行 key 的并集，按首次出现顺序
    const cols: string[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      for (const k of Object.keys(r as Record<string, unknown>)) {
        if (!seen.has(k)) {
          seen.add(k)
          cols.push(k)
        }
      }
    }
    aoa = [cols]
    for (const r of rows) {
      aoa.push(cols.map((c) => cellText((r as Record<string, unknown>)[c])))
    }
  } else {
    // 基本类型 / 数组 / 混合 → 单列
    aoa = [['值']]
    for (const r of rows) aoa.push([cellText(r)])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // 双保险：把每个单元格显式标记为字符串 + 文本格式
  const ref = ws['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    for (let R = range.s.r; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (cell) {
          cell.t = 's' // string 类型
          cell.z = '@' // 文本数字格式
        }
      }
    }
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(out)
}
