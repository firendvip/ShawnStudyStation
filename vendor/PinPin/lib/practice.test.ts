import { describe, test, expect } from 'vitest'
import { sliceForDay, dayCounts } from './practice'
import type { EntryItem } from './types'

function makeEntries(n: number): EntryItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: String(i),
    text: `字${i}`,
    pinyin: `p${i}`,
    recordDate: '2026-06-01',
  }))
}

describe('dayCounts', () => {
  test('splits evenly when divisible (700 -> 100 each)', () => {
    expect(dayCounts(700)).toEqual([100, 100, 100, 100, 100, 100, 100])
  })

  test('puts remainder on the earliest days (10 -> 2,2,2,1,1,1,1)', () => {
    expect(dayCounts(10)).toEqual([2, 2, 2, 1, 1, 1, 1])
  })

  test('handles fewer than 7 (3 -> 1,1,1,0,0,0,0)', () => {
    expect(dayCounts(3)).toEqual([1, 1, 1, 0, 0, 0, 0])
  })

  test('handles zero', () => {
    expect(dayCounts(0)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })
})

describe('sliceForDay', () => {
  test('FIFO: first entry lands on day 0 (苹果 written on 6/8, not 6/14)', () => {
    const entries = makeEntries(700)
    const day0 = sliceForDay(entries, 0)
    expect(day0).toHaveLength(100)
    expect(day0[0].id).toBe('0') // the first-recorded word
  })

  test('day 1 continues after day 0', () => {
    const entries = makeEntries(700)
    expect(sliceForDay(entries, 1)[0].id).toBe('100')
  })

  test('last day gets the final slice', () => {
    const entries = makeEntries(700)
    const day6 = sliceForDay(entries, 6)
    expect(day6).toHaveLength(100)
    expect(day6[day6.length - 1].id).toBe('699')
  })

  test('remainder distribution: 10 entries, day 0 has 2, day 6 has 1', () => {
    const entries = makeEntries(10)
    expect(sliceForDay(entries, 0)).toHaveLength(2)
    expect(sliceForDay(entries, 6)).toHaveLength(1)
  })

  test('every entry is covered exactly once across the 7 days', () => {
    const entries = makeEntries(23)
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => sliceForDay(entries, d).map((e) => e.id))
    expect(all).toEqual(entries.map((e) => e.id))
  })
})
