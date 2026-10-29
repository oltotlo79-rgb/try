// 成果確認（S17）の集計。基準日は引き渡し完了日（依頼書以外の作業は完了日）。
// 複数人で担当した作業は配分（％）で分けて計上する。
import type { DB } from './types'
import { fiscalYearOf } from './format'
import { equalRatios } from './rules'

export type Period = { kind: 'fy'; year: number } | { kind: 'month'; ym: string } // ym: 2026-10

export interface ContributionRow {
  employeeId: string
  name: string
  reqCount: number
  reqAmount: number
  otherCount: number
  otherAmount: number
  total: number
}

export function inPeriod(iso: string | null, p: Period): boolean {
  if (!iso) return false
  return p.kind === 'fy' ? fiscalYearOf(iso) === p.year : iso.slice(0, 7) === p.ym
}

/** 担当者ごとの按分額。配分（％）が人数と合わない・合計100でないときは均等。端数は最後の人に計上 */
export function splitAmount(amount: number, assignees: string[], ratios: number[]) {
  const ids = assignees.filter(Boolean)
  if (!ids.length) return []
  const valid = ratios.length === ids.length && ratios.reduce((a, b) => a + b, 0) === 100
  const rs = valid ? ratios : equalRatios(ids.length)
  let rest = amount
  return ids.map((id, i) => {
    const a = i === ids.length - 1 ? rest : Math.round((amount * rs[i]) / 100)
    rest -= a
    return { id, amount: a }
  })
}

export function contributionRows(db: DB, p: Period, includeOther: boolean): ContributionRow[] {
  const rows = new Map<string, ContributionRow>()
  const row = (id: string) => {
    let r = rows.get(id)
    if (!r) {
      const name = db.employees.find((e) => e.id === id)?.name ?? id
      r = { employeeId: id, name, reqCount: 0, reqAmount: 0, otherCount: 0, otherAmount: 0, total: 0 }
      rows.set(id, r)
    }
    return r
  }
  for (const req of db.requests) {
    if (req.status !== 'done' || !inPeriod(req.deliveryDate, p)) continue
    for (const s of splitAmount(req.contribution ?? 0, req.assignees, req.ratios)) {
      const r = row(s.id)
      r.reqCount += 1
      r.reqAmount += s.amount
    }
  }
  if (includeOther) {
    for (const w of db.otherWorks) {
      if (!inPeriod(w.completedDate, p)) continue
      for (const s of splitAmount(w.contribution ?? 0, w.assignees, w.ratios)) {
        const r = row(s.id)
        r.otherCount += 1
        r.otherAmount += s.amount
      }
    }
  }
  for (const r of rows.values()) r.total = r.reqAmount + r.otherAmount
  return [...rows.values()].sort((a, b) => b.total - a.total)
}
