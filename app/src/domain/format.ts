// 日付・金額の表示形式（日本時間で表示する）

const pad = (n: number) => String(n).padStart(2, '0')

export const DAY_MS = 24 * 60 * 60 * 1000

export function toISODate(d: Date | number): string {
  const x = typeof d === 'number' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** 今日の0時を基準に n 日ずらした日付 (YYYY-MM-DD) */
export function isoDaysFrom(base: number, n: number): string {
  const d = new Date(base)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** 2026/11/30 */
export function fmtDate(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const d = typeof v === 'number' ? new Date(v) : parseISODate(v)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** 11/30 */
export function fmtMD(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—'
  const d = typeof v === 'number' ? new Date(v) : parseISODate(v)
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
}

/** 10/21 10:15 */
export function fmtMDHM(v: number | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 2026/10/21 10:15 */
export function fmtDateTime(v: number | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return `${fmtDate(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fmtYen(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('ja-JP')
}

/** 今日0時から見た日数差（正: 未来） */
export function daysUntil(iso: string, now: number): number {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return Math.round((parseISODate(iso).getTime() - today.getTime()) / DAY_MS)
}

/** 経過日数（切り捨て） */
export function elapsedDays(from: number, now: number): number {
  return Math.floor((now - from) / DAY_MS)
}

/** 年度（4月〜翌3月）。1〜3月は前年の年度 */
export function fiscalYearOf(iso: string): number {
  const d = parseISODate(iso)
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
}

export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}
