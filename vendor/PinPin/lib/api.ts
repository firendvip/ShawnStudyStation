import type { EntryItem, PracticeDay, PdfReportItem, AppSettings, AuthUser } from './types'

/**
 * 访客身份令牌:跨站 iframe(本地 localhost 子站被 file:// 主站内嵌)下三方 cookie 不可用,
 * 改为在本页 localStorage 持久化一个随机令牌,并随每次请求以 x-guest-token 头携带,
 * 保证录入(写)与列表(读)落在同一访客身份上。同源生产环境(/pinpin/)也兼容。
 */
const GUEST_TOKEN_KEY = 'pinpin_guest_token'
function guestToken(): string {
  if (typeof window === 'undefined') return ''
  let t = ''
  try {
    t = window.localStorage.getItem(GUEST_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
  if (!t) {
    const rand = (): string => Math.random().toString(36).slice(2)
    t = (window.crypto?.randomUUID?.() ?? rand() + rand() + rand()).replace(/-/g, '')
    try {
      window.localStorage.setItem(GUEST_TOKEN_KEY, t)
    } catch {
      /* localStorage 不可用时退回 cookie 流程 */
    }
  }
  return t
}
/** 统一的请求封装:自动附带访客令牌头。 */
function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  const t = guestToken()
  if (t) headers.set('x-guest-token', t)
  return globalThis.fetch(input, { ...init, headers })
}

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
  const data = await parseEnvelope<{ user: AuthUser | null }>(await apiFetch('/api/auth/me'))
  return data.user
}

export async function requestCode(phone: string): Promise<{ demoCode?: string }> {
  const response = await apiFetch('/api/auth/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone }),
  })
  return parseEnvelope<{ demoCode?: string }>(response)
}

export async function login(phone: string, code: string): Promise<AuthUser> {
  const response = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  })
  const data = await parseEnvelope<{ user: AuthUser }>(response)
  return data.user
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' })
}

export interface AddResult {
  added: EntryItem[]
  duplicates: string[]
}

export async function addEntries(texts: string[], recordDate?: string): Promise<AddResult> {
  const response = await apiFetch('/api/entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recordDate ? { texts, recordDate } : { texts }),
  })
  return parseEnvelope<AddResult>(response)
}

export async function fetchToday(): Promise<EntryItem[]> {
  return parseEnvelope<EntryItem[]>(await apiFetch('/api/entries'))
}

export async function removeEntry(id: string): Promise<void> {
  const response = await apiFetch(`/api/entries/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  await parseEnvelope<{ deleted: boolean }>(response)
}

export async function updateEntry(id: string, text: string): Promise<EntryItem> {
  const response = await apiFetch(`/api/entries/${encodeURIComponent(id)}`, {
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
    await apiFetch(`/api/practice${query}`),
  )
  return data.days
}

export async function fetchAllEntries(): Promise<EntryItem[]> {
  return parseEnvelope<EntryItem[]>(await apiFetch('/api/entries?scope=all'))
}

export async function fetchPracticeForRange(from: string, to: string): Promise<PracticeDay[]> {
  const data = await parseEnvelope<{ days: PracticeDay[] }>(
    await apiFetch(`/api/practice?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  )
  return data.days
}

export async function fetchSettings(): Promise<AppSettings> {
  return parseEnvelope<AppSettings>(await apiFetch('/api/settings'))
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const response = await apiFetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  await parseEnvelope<AppSettings>(response)
}

export async function fetchReports(): Promise<PdfReportItem[]> {
  const data = await parseEnvelope<{ reports: PdfReportItem[] }>(await apiFetch('/api/reports'))
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

export interface ReportRanges {
  recFrom: string
  recTo: string
  writeFrom: string
  writeTo: string
}

export async function generateManualReport(
  ranges: ReportRanges,
  options: PrintOptions = {},
): Promise<PdfReportItem> {
  const response = await apiFetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...ranges, ...options }),
  })
  const data = await parseEnvelope<{ report: PdfReportItem }>(response)
  return data.report
}

export function reportUrl(id: string): string {
  return `/api/reports/${encodeURIComponent(id)}`
}

export async function deleteReport(id: string): Promise<void> {
  const response = await apiFetch(`/api/reports/${encodeURIComponent(id)}`, { method: 'DELETE' })
  await parseEnvelope<{ deleted: boolean }>(response)
}
