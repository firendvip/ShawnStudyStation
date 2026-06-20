import type { EntryItem, PracticeDay, PdfReportItem, AppSettings, AuthUser } from './types'

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T>
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new Error('服务器返回异常')
  }
  if (!response.ok || !body.success || body.data === undefined) {
    throw new Error(body.error ?? '请求失败')
  }
  return body.data
}

// ===== 账号 =====

export async function fetchMe(): Promise<AuthUser | null> {
  const data = await parseEnvelope<{ user: AuthUser | null }>(await fetch('/api/auth/me'))
  return data.user
}

export async function requestCode(phone: string): Promise<{ demoCode?: string }> {
  const response = await fetch('/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  return parseEnvelope<{ demoCode?: string }>(response)
}

export async function login(phone: string, code: string): Promise<AuthUser> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  })
  const data = await parseEnvelope<{ user: AuthUser }>(response)
  return data.user
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST' })
}

export interface AddResult {
  added: EntryItem[]
  duplicates: string[]
}

export async function addEntries(texts: string[], recordDate?: string): Promise<AddResult> {
  const response = await fetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recordDate ? { texts, recordDate } : { texts }),
  })
  return parseEnvelope<AddResult>(response)
}

export async function fetchToday(): Promise<EntryItem[]> {
  return parseEnvelope<EntryItem[]>(await fetch('/api/entries'))
}

export async function removeEntry(id: string): Promise<void> {
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await parseEnvelope<{ deleted: boolean }>(response)
}

export async function updateEntry(id: string, text: string): Promise<EntryItem> {
  const response = await fetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return parseEnvelope<EntryItem>(response)
}

export type PracticePass = 'first' | 'second' | 'both'

export async function fetchPracticeForDate(
  date?: string,
  pass: PracticePass = 'both',
): Promise<PracticeDay[]> {
  const params = new URLSearchParams()
  if (date) params.set('date', date)
  if (pass !== 'both') params.set('pass', pass)
  const query = params.toString() ? `?${params.toString()}` : ''
  const data = await parseEnvelope<{ days: PracticeDay[] }>(
    await fetch(`/api/practice${query}`),
  )
  return data.days
}

export async function fetchAllEntries(): Promise<EntryItem[]> {
  return parseEnvelope<EntryItem[]>(await fetch('/api/entries?scope=all'))
}

export async function fetchPracticeForRange(from: string, to: string): Promise<PracticeDay[]> {
  const data = await parseEnvelope<{ days: PracticeDay[] }>(
    await fetch(`/api/practice?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  )
  return data.days
}

export async function fetchSettings(): Promise<AppSettings> {
  return parseEnvelope<AppSettings>(await fetch('/api/settings'))
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const response = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  await parseEnvelope<AppSettings>(response)
}

export async function fetchReports(): Promise<PdfReportItem[]> {
  const data = await parseEnvelope<{ reports: PdfReportItem[] }>(await fetch('/api/reports'))
  return data.reports
}

export interface PrintOptions {
  title?: string
  columns?: number
  fontSize?: number
  margin?: number
  rowGap?: number
  showIndex?: boolean
  showWriteSpace?: boolean
  showSubtitle?: boolean
  evenDistribute?: boolean
}

export async function generateManualReport(
  from: string,
  to: string,
  options: PrintOptions = {},
): Promise<PdfReportItem> {
  const response = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, ...options }),
  })
  const data = await parseEnvelope<{ report: PdfReportItem }>(response)
  return data.report
}

export function reportUrl(id: string): string {
  return `/api/reports/${encodeURIComponent(id)}`
}
