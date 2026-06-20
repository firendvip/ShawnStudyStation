import { pinyin } from 'pinyin-pro'

/**
 * 拼音转换封装。带声调符号(nǐ hǎo),按整词转换,
 * 由 pinyin-pro 的词库自动为多音字选择读音。
 */

export interface PinyinEntry {
  word: string
  pinyin: string
}

export function toPinyin(word: string): string {
  if (!word) {
    return ''
  }
  // toneType: 'symbol' → 带声调符号;type: 'string' → 音节间以空格分隔
  // nonZh: 'consecutive' → 非中文字符保持原样,不被空格拆开
  return pinyin(word, { toneType: 'symbol', type: 'string', nonZh: 'consecutive' })
}

export function toPinyinEntries(words: string[]): PinyinEntry[] {
  return words.map((word) => ({ word, pinyin: toPinyin(word) }))
}
