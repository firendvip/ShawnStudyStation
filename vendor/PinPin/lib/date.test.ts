import { describe, test, expect } from 'vitest'
import {
  addDays,
  diffDays,
  writeDateFor,
  formatCN,
  cycleRange,
  cycleIndexFor,
  completedCycleRanges,
  CYCLE_DAYS,
} from './date'

describe('addDays', () => {
  test('adds one day', () => {
    expect(addDays('2026-06-19', 1)).toBe('2026-06-20')
  })
  test('rolls over month end', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })
  test('rolls over year end', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
  test('subtracts with negative n', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('diffDays', () => {
  test('counts days between dates', () => {
    expect(diffDays('2026-06-01', '2026-06-08')).toBe(7)
  })
  test('is zero for same day', () => {
    expect(diffDays('2026-06-01', '2026-06-01')).toBe(0)
  })
})

describe('writeDateFor', () => {
  test('write date is the day after the record date', () => {
    expect(writeDateFor('2026-06-19')).toBe('2026-06-20')
  })
})

describe('formatCN', () => {
  test('formats as 月日', () => {
    expect(formatCN('2026-06-19')).toBe('6月19日')
  })
})

describe('cycle helpers', () => {
  test('CYCLE_DAYS is 7', () => {
    expect(CYCLE_DAYS).toBe(7)
  })

  test('cycleRange spans seven days inclusive', () => {
    expect(cycleRange('2026-06-01', 0)).toEqual({ start: '2026-06-01', end: '2026-06-07' })
    expect(cycleRange('2026-06-01', 1)).toEqual({ start: '2026-06-08', end: '2026-06-14' })
  })

  test('cycleIndexFor maps a date to its cycle', () => {
    expect(cycleIndexFor('2026-06-01', '2026-06-07')).toBe(0)
    expect(cycleIndexFor('2026-06-01', '2026-06-08')).toBe(1)
  })

  test('completedCycleRanges returns only fully ended cycles', () => {
    const completed = completedCycleRanges('2026-06-01', '2026-06-09')
    expect(completed).toEqual([{ index: 0, start: '2026-06-01', end: '2026-06-07' }])
  })

  test('completedCycleRanges is empty before the first cycle ends', () => {
    expect(completedCycleRanges('2026-06-01', '2026-06-05')).toEqual([])
  })
})
