import { describe, expect, it } from 'vitest'
import { buildSeed } from '../data/seed'
import {
  approvalByStage, circulationBins, completedIn, deptStats, delayBins, funnel, inquiryStats, insights, kpis, leadBins, makeRange,
  monthly, previousRange, realRequests, requestedIn, workload,
} from './analytics'

const NOW = new Date(2026, 9, 29, 10, 0).getTime()
const db = buildSeed(NOW)

describe('データ分析の期間', () => {
  it('直近12か月は12か月、前の期間は同じ長さで直前', () => {
    const r = makeRange('12m', db, NOW)
    expect(r.months).toHaveLength(12)
    expect(r.months[11]).toBe('2026-10')
    const p = previousRange(r)!
    expect(p.months).toHaveLength(12)
    expect(p.months[11]).toBe('2025-10')
    expect(p.to < r.from).toBe(true)
  })

  it('年度は4月始まり、前年度は4月〜翌3月', () => {
    expect(makeRange('fy', db, NOW).from).toBe('2026-04-01')
    const prev = makeRange('prevFy', db, NOW)
    expect([prev.from, prev.to, prev.months.length]).toEqual(['2025-04-01', '2026-03-31', 12])
    expect(previousRange(makeRange('all', db, NOW))).toBeNull()
  })
})

describe('データ分析の指標', () => {
  const r = makeRange('all', db, NOW)

  it('KPIの率は0〜100%、件数は一覧と一致する', () => {
    const k = kpis(db, r, 'all')
    expect(k.requested).toBe(requestedIn(db, r, 'all').length)
    expect(k.completed).toBe(completedIn(db, r, 'all').length)
    for (const v of [k.onTimeRate, k.returnRate]) if (v !== null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100)
    expect(k.avgLead === null || k.avgLead >= 0).toBe(true)
    expect(k.inProgress).toBe(realRequests(db).filter((x) => x.status === 'inProgress').length)
  })

  it('月別の合計はKPIと一致する', () => {
    const rows = monthly(db, r, 'all')
    const k = kpis(db, r, 'all')
    expect(rows.reduce((a, x) => a + x.requested, 0)).toBe(k.requested)
    expect(rows.reduce((a, x) => a + x.completed, 0)).toBe(k.completed)
    expect(rows.every((x) => x.onTime + x.late === x.completed)).toBe(true)
    expect(rows.reduce((a, x) => a + x.contribReq + x.contribOther, 0)).toBe(k.contribution)
  })

  it('分布の件数は対象の件数と一致する', () => {
    const done = completedIn(db, r, 'all')
    expect(delayBins(done).reduce((a, b) => a + b.count, 0)).toBe(done.length)
    expect(leadBins(done).reduce((a, b) => a + b.count, 0)).toBe(done.length)
    const reqs = requestedIn(db, r, 'all')
    expect(circulationBins(reqs).reduce((a, b) => a + b.count, 0)).toBeLessThanOrEqual(reqs.length)
  })

  it('工程の滞留は現在の依頼の状態と一致する', () => {
    const rows = funnel(db, 'all', NOW)
    const active = realRequests(db).filter((x) => ['circulating', 'returned', 'pulledBack', 'circulated', 'inProgress'].includes(x.status))
    expect(rows.reduce((a, x) => a + x.count, 0)).toBe(active.length)
    expect(rows[0].key).toBe('circulating')
  })

  it('承認の段階・部署・担当者・問い合わせの集計', () => {
    const stages = approvalByStage(db, r, 'all')
    expect(stages.map((s) => s.role)).toEqual(['回覧者1', '回覧者2', '回覧者3', '回覧先1', '回覧先2', '回覧先3'])
    expect(stages.some((s) => s.count > 0 && (s.avgHours ?? 0) > 0)).toBe(true)
    const depts = deptStats(db, r)
    expect(depts.reduce((a, d) => a + d.requested, 0)).toBe(kpis(db, r, 'all').requested)
    const load = workload(db, r, 'all', NOW)
    expect(load.every((m) => m.employee.roles.equipment)).toBe(true)
    expect(load.reduce((a, m) => a + m.inProgress, 0)).toBeGreaterThanOrEqual(kpis(db, r, 'all').inProgress)
    const q = inquiryStats(db, r)
    expect(q.byCategory.reduce((a, c) => a + c.count, 0)).toBe(q.total)
  })

  it('インサイトは1〜5件の文章', () => {
    const list = insights(db, makeRange('12m', db, NOW), 'all', NOW)
    expect(list.length).toBeGreaterThan(0)
    expect(list.length).toBeLessThanOrEqual(5)
    expect(list.every((s) => s.endsWith('。'))).toBe(true)
  })

  it('部署で絞り込むと件数は全体以下', () => {
    const all = kpis(db, r, 'all')
    const one = kpis(db, r, '製造二課')
    expect(one.requested).toBeLessThanOrEqual(all.requested)
    expect(one.completed).toBeLessThanOrEqual(all.completed)
  })
})
