/**
 * 把用户输入的原始文本切分成「字/词」数组。
 * 支持的分隔符:换行、空格(含全角空格)、Tab,以及中英文标点
 * (逗号、顿号、分号、句号等)。
 */

// 分隔符:空白字符(含全角空格 　) + 常见中英文标点
const SEPARATOR = /[\s,，、;；。.!！?？]+/u

export interface ParseWordsOptions {
  /** 是否去重(保留首次出现顺序),默认 false */
  dedupe?: boolean
}

export function parseWords(raw: string, options: ParseWordsOptions = {}): string[] {
  const words = raw
    .split(SEPARATOR)
    .map((word) => word.trim())
    .filter((word) => word.length > 0)

  if (!options.dedupe) {
    return words
  }

  const seen = new Set<string>()
  return words.filter((word) => {
    if (seen.has(word)) {
      return false
    }
    seen.add(word)
    return true
  })
}
