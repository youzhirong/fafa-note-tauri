/**
 * JSON 结构对比工具（纯函数，无副作用，便于复用/测试）。
 *
 * 递归深比较两份已解析的 JSON 值，产出差异列表：
 *   - added   ：仅右侧存在（左侧缺）
 *   - removed ：仅左侧存在（右侧缺）
 *   - changed ：两侧都存在但值/类型不同
 * 对象按 key 并集递归；数组按下标递归；标量用 Object.is 判等。
 */

export type JsonDiffType = 'added' | 'removed' | 'changed'

export interface JsonDiffEntry {
  /** 差异所在路径，如 `root.a.b[0].c`；根用 `root` 表示 */
  path: string
  type: JsonDiffType
  /** 左侧值（removed / changed 时有意义） */
  leftValue?: unknown
  /** 右侧值（added / changed 时有意义） */
  rightValue?: unknown
}

/** 是否为「可继续递归」的纯对象（排除 null 与数组） */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 把一个 key 追加到路径上（数组下标用 [i]，对象键用 .key） */
function joinPath(base: string, key: string | number): string {
  return typeof key === 'number' ? `${base}[${key}]` : `${base}.${key}`
}

/**
 * 比较两份 JSON 值，返回差异列表。
 * @param left  左侧已解析的值
 * @param right 右侧已解析的值
 * @param path  当前递归路径（外部调用一般不传，默认 'root'）
 */
export function diffJson(left: unknown, right: unknown, path = 'root'): JsonDiffEntry[] {
  const out: JsonDiffEntry[] = []

  // 两侧都是数组：按下标逐项比较
  if (Array.isArray(left) && Array.isArray(right)) {
    const max = Math.max(left.length, right.length)
    for (let i = 0; i < max; i++) {
      const p = joinPath(path, i)
      if (i >= left.length) {
        out.push({ path: p, type: 'added', rightValue: right[i] })
      } else if (i >= right.length) {
        out.push({ path: p, type: 'removed', leftValue: left[i] })
      } else {
        out.push(...diffJson(left[i], right[i], p))
      }
    }
    return out
  }

  // 两侧都是纯对象：按 key 并集比较
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const k of keys) {
      const p = joinPath(path, k)
      const inL = Object.prototype.hasOwnProperty.call(left, k)
      const inR = Object.prototype.hasOwnProperty.call(right, k)
      if (!inL) {
        out.push({ path: p, type: 'added', rightValue: right[k] })
      } else if (!inR) {
        out.push({ path: p, type: 'removed', leftValue: left[k] })
      } else {
        out.push(...diffJson(left[k], right[k], p))
      }
    }
    return out
  }

  // 其余情况（标量、或两侧类型不同如 对象 vs 数组）：直接比较是否相等
  if (!Object.is(left, right)) {
    out.push({ path, type: 'changed', leftValue: left, rightValue: right })
  }
  return out
}
