import { describe, test, expect } from 'vitest'
import { parseWords } from './parseWords'

describe('parseWords', () => {
  test('splits by newlines', () => {
    expect(parseWords('苹果\n香蕉\n葡萄')).toEqual(['苹果', '香蕉', '葡萄'])
  })

  test('splits by half-width and full-width spaces', () => {
    expect(parseWords('苹果 香蕉　葡萄')).toEqual(['苹果', '香蕉', '葡萄'])
  })

  test('splits by Chinese and ASCII punctuation', () => {
    expect(parseWords('苹果,香蕉，葡萄、橘子;梨;桃。李')).toEqual([
      '苹果',
      '香蕉',
      '葡萄',
      '橘子',
      '梨',
      '桃',
      '李',
    ])
  })

  test('handles mixed separators and collapses repeats', () => {
    expect(parseWords('苹果 ,，\n 香蕉')).toEqual(['苹果', '香蕉'])
  })

  test('trims and drops empty entries', () => {
    expect(parseWords('  苹果  \n\n  ')).toEqual(['苹果'])
  })

  test('returns empty array for blank input', () => {
    expect(parseWords('   \n  ')).toEqual([])
  })

  test('preserves duplicates by default', () => {
    expect(parseWords('苹果 苹果 香蕉')).toEqual(['苹果', '苹果', '香蕉'])
  })

  test('removes duplicates when dedupe enabled, keeping first order', () => {
    expect(parseWords('苹果 香蕉 苹果', { dedupe: true })).toEqual(['苹果', '香蕉'])
  })
})
