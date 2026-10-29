import type { DB } from './types'

/** DB 内で一意な内部ID */
export function newId(db: DB, prefix: string): string {
  db.seq.id += 1
  return `${prefix}${db.seq.id}`
}

/** 推測できない長いランダムな文字列（承認用URLの鍵）。実システムでは256bitの乱数 */
export function randomToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  // base62 風に見せるため一部を英字へ
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  return Array.from(s.slice(0, 40), (_, i) => chars[(parseInt(s.slice(i, i + 2), 16) + i * 7) % chars.length]).join('')
}

export function requestNumber(year: number, seq: number) {
  return `R${year}-${String(seq).padStart(4, '0')}`
}

export function inquiryNumber(year: number, seq: number) {
  return `Q${year}-${String(seq).padStart(4, '0')}`
}
