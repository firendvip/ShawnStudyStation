import { describe, test, expect } from 'vitest'
import { toPinyin, toPinyinEntries } from './pinyin'

describe('toPinyin', () => {
  test('converts a single word with tone marks', () => {
    expect(toPinyin('你好')).toBe('nǐ hǎo')
  })

  test('converts a two-character word', () => {
    expect(toPinyin('苹果')).toBe('píng guǒ')
  })

  test('picks the word-context reading for polyphonic characters', () => {
    // 行 reads háng in 银行, not xíng
    expect(toPinyin('银行')).toBe('yín háng')
    // 重 reads chóng in 重复, not zhòng
    expect(toPinyin('重复')).toBe('chóng fù')
  })

  test('passes through non-Chinese text', () => {
    expect(toPinyin('abc')).toBe('abc')
  })

  test('returns empty string for empty input', () => {
    expect(toPinyin('')).toBe('')
  })
})

describe('toPinyinEntries', () => {
  test('maps each word to its pinyin', () => {
    expect(toPinyinEntries(['你好', '苹果'])).toEqual([
      { word: '你好', pinyin: 'nǐ hǎo' },
      { word: '苹果', pinyin: 'píng guǒ' },
    ])
  })

  test('returns empty array for empty list', () => {
    expect(toPinyinEntries([])).toEqual([])
  })
})
