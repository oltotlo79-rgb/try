// S28 データ分析（要件外の追加提案）：依頼・承認・製作のデータを集計する純粋関数。画面は表示だけを担う
import type { DB, Employee, InquiryCategory, WorkRequest } from './types'
import { DAY_MS, fiscalYearOf, parseISODate, toISODate } from './format'
import { STAGE_FLOW, STAGE_LABEL, dueTone, isEquipment, pendingStep, workStage, type WorkStage } from './rules'
import { splitAmount } from './stats'

const HOUR_MS = 60 * 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')

// ── 期間 ────────────────────────────────────────────────

export type RangeKey = '12m' | 'fy' | 'prevFy' | 'all'

export interface Range {
  key: RangeKey
  from: string // YYYY-MM-DD（含む）
  to: string // YYYY-MM-DD（含む）
  months: string[] // YYYY-MM
  label: string
}

export function monthAdd(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function monthsBetween(fromYm: string, toYm: string): string[] {
  const out: string[] = []
  for (let m = fromYm; m <= toYm && out.length < 240; m = monthAdd(m, 1)) out.push(m)
  return out
}

function lastDayOf(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** 実際に送信された依頼（下書きを除く） */
export const realRequests = (db: DB) => db.requests.filter((r) => r.number && r.status !== 'draft')

const reqDate = (r: WorkRequest) => (r.requestDate ? toISODate(r.requestDate) : null)

export function makeRange(key: RangeKey, db: DB, now: number): Range {
  const today = toISODate(now)
  const ym = today.slice(0, 7)
  const fy = fiscalYearOf(today)
  switch (key) {
    case '12m': {
      const f = monthAdd(ym, -11)
      return { key, from: `${f}-01`, to: today, months: monthsBetween(f, ym), label: '直近12か月' }
    }
    case 'fy':
      return { key, from: `${fy}-04-01`, to: today, months: monthsBetween(`${fy}-04`, ym), label: `${fy}年度（${fy}/4〜）` }
    case 'prevFy':
      return {
        key, from: `${fy - 1}-04-01`, to: `${fy}-03-31`, months: monthsBetween(`${fy - 1}-04`, `${fy}-03`),
        label: `${fy - 1}年度（${fy - 1}/4〜${fy}/3）`,
      }
    case 'all': {
      const dates = realRequests(db).map(reqDate).filter((d): d is string => !!d).sort()
      const f = (dates[0] ?? today).slice(0, 7)
      return { key, from: `${f}-01`, to: today, months: monthsBetween(f, ym), label: 'すべての期間' }
    }
  }
}

/** 同じ長さの直前の期間（「すべて」には無い） */
export function previousRange(r: Range): Range | null {
  if (r.key === 'all') return null
  const n = r.months.length
  const fromYm = monthAdd(r.from.slice(0, 7), -n)
  const toYm = monthAdd(r.to.slice(0, 7), -n)
  const day = Math.min(Number(r.to.slice(8)), lastDayOf(toYm))
  return { key: r.key, from: `${fromYm}-01`, to: `${toYm}-${pad(day)}`, months: monthsBetween(fromYm, toYm), label: '前の期間' }
}

export const inRange = (iso: string | null | undefined, r: Range) => !!iso && iso >= r.from && iso <= r.to

// ── 1件ごとの指標 ───────────────────────────────────────

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS)
}

/** リードタイム：依頼日→引き渡し完了日（日） */
export function leadTime(r: WorkRequest): number | null {
  const d = reqDate(r)
  return r.status === 'done' && r.deliveryDate && d ? daysBetween(d, r.deliveryDate) : null
}

/** 納期との差（日）：＋は遅れ、−は前倒し */
export function delayDays(r: WorkRequest): number | null {
  return r.status === 'done' && r.deliveryDate ? daysBetween(r.dueDate, r.deliveryDate) : null
}

export const wasReturned = (r: WorkRequest) => r.steps.some((s) => s.result === 'returned')

/** 回覧日数：最初の承認依頼の送信→最後の承認（回覧が完了した依頼だけ） */
export function circulationDays(r: WorkRequest): number | null {
  if (!['circulated', 'inProgress', 'done'].includes(r.status)) return null
  const sent = r.steps.map((s) => s.sentAt).filter((x): x is number => !!x)
  const acted = r.steps
    .filter((s) => s.round === r.round && (s.result === 'approved' || s.result === 'proxy'))
    .map((s) => s.actedAt)
    .filter((x): x is number => !!x)
  if (!sent.length || !acted.length) return null
  return (Math.max(...acted) - Math.min(...sent)) / DAY_MS
}

export const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const pct = (n: number, d: number): number | null => (d ? (n / d) * 100 : null)

const matchDept = (r: WorkRequest, dept: string) => dept === 'all' || r.requester.dept === dept
const deptNameOf = (db: DB, deptId: string) => db.departments.find((d) => d.id === deptId)?.name ?? ''

/** 期間内に依頼された依頼 */
export const requestedIn = (db: DB, r: Range, dept: string) =>
  realRequests(db).filter((x) => matchDept(x, dept) && inRange(reqDate(x), r))

/** 期間内に引き渡しが完了した依頼 */
export const completedIn = (db: DB, r: Range, dept: string) =>
  realRequests(db).filter((x) => matchDept(x, dept) && x.status === 'done' && inRange(x.deliveryDate, r))

// ── KPI ────────────────────────────────────────────────

export interface Kpis {
  requested: number
  completed: number
  inProgress: number
  avgLead: number | null
  onTimeRate: number | null
  avgCirculation: number | null
  returnRate: number | null
  contribution: number
}

export function kpis(db: DB, r: Range, dept: string): Kpis {
  const req = requestedIn(db, r, dept)
  const done = completedIn(db, r, dept)
  const leads = done.map(leadTime).filter((x): x is number => x !== null)
  const onTime = done.filter((x) => (delayDays(x) ?? 1) <= 0).length
  const circ = req.map(circulationDays).filter((x): x is number => x !== null)
  const otherSum = db.otherWorks
    .filter((w) => inRange(w.completedDate, r) && (dept === 'all' || deptNameOf(db, w.deptId) === dept))
    .reduce((a, w) => a + (w.contribution ?? 0), 0)
  return {
    requested: req.length,
    completed: done.length,
    inProgress: realRequests(db).filter((x) => matchDept(x, dept) && x.status === 'inProgress').length,
    avgLead: avg(leads),
    onTimeRate: pct(onTime, done.length),
    avgCirculation: avg(circ),
    returnRate: pct(req.filter(wasReturned).length, req.length),
    contribution: done.reduce((a, x) => a + (x.contribution ?? 0), 0) + otherSum,
  }
}

// ── 月別 ───────────────────────────────────────────────

export interface MonthRow {
  ym: string
  requested: number
  completed: number
  onTime: number
  late: number
  contribReq: number
  contribOther: number
}

export function monthly(db: DB, r: Range, dept: string): MonthRow[] {
  const rows = new Map<string, MonthRow>(
    r.months.map((ym) => [ym, { ym, requested: 0, completed: 0, onTime: 0, late: 0, contribReq: 0, contribOther: 0 }]),
  )
  for (const x of requestedIn(db, r, dept)) rows.get(reqDate(x)!.slice(0, 7))!.requested += 1
  for (const x of completedIn(db, r, dept)) {
    const row = rows.get(x.deliveryDate!.slice(0, 7))!
    row.completed += 1
    if ((delayDays(x) ?? 0) <= 0) row.onTime += 1
    else row.late += 1
    row.contribReq += x.contribution ?? 0
  }
  for (const w of db.otherWorks) {
    if (!inRange(w.completedDate, r) || (dept !== 'all' && deptNameOf(db, w.deptId) !== dept)) continue
    rows.get(w.completedDate!.slice(0, 7))!.contribOther += w.contribution ?? 0
  }
  return [...rows.values()]
}

// ── 現在の工程の滞留 ───────────────────────────────────

export interface FunnelRow {
  key: 'circulating' | 'returned' | WorkStage
  label: string
  count: number
  /** 依頼日からの平均経過日数（回覧中は承認待ちになってからの日数） */
  avgAge: number | null
  overdue: number
}

export function funnel(db: DB, dept: string, now: number): FunnelRow[] {
  const all = realRequests(db).filter((x) => matchDept(x, dept))
  const age = (x: WorkRequest) => (x.requestDate ? (now - x.requestDate) / DAY_MS : 0)
  const row = (key: FunnelRow['key'], label: string, list: WorkRequest[], ageOf = age): FunnelRow => ({
    key, label, count: list.length, avgAge: avg(list.map(ageOf)), overdue: list.filter((x) => dueTone(x, now) === 'overdue').length,
  })
  const circulating = all.filter((x) => x.status === 'circulating')
  const rows: FunnelRow[] = [
    row('circulating', '回覧中（承認待ち）', circulating, (x) => {
      const p = pendingStep(x)
      return p?.sentAt ? (now - p.sentAt) / DAY_MS : age(x)
    }),
    row('returned', '差し戻し・引き戻し', all.filter((x) => x.status === 'returned' || x.status === 'pulledBack')),
  ]
  const stages: WorkStage[] = [STAGE_FLOW[0], 'waitAssign', ...STAGE_FLOW.slice(1)]
  for (const st of stages) {
    const list = all.filter((x) => workStage(x) === st)
    if (st === 'waitAssign' && !list.length) continue
    rows.push(row(st, STAGE_LABEL[st], list))
  }
  return rows
}

// ── 分布 ───────────────────────────────────────────────

export interface Bin {
  label: string
  count: number
  tone: 'early' | 'neutral' | 'late' | 'base'
}

/** 納期との差の分布（前倒し・当日・遅れ） */
export function delayBins(done: WorkRequest[]): Bin[] {
  const bins: (Bin & { test: (d: number) => boolean })[] = [
    { label: '8日以上前', count: 0, tone: 'early', test: (d) => d <= -8 },
    { label: '1〜7日前', count: 0, tone: 'early', test: (d) => d >= -7 && d <= -1 },
    { label: '当日', count: 0, tone: 'neutral', test: (d) => d === 0 },
    { label: '1〜3日遅れ', count: 0, tone: 'late', test: (d) => d >= 1 && d <= 3 },
    { label: '4〜7日遅れ', count: 0, tone: 'late', test: (d) => d >= 4 && d <= 7 },
    { label: '8日以上遅れ', count: 0, tone: 'late', test: (d) => d >= 8 },
  ]
  for (const x of done) {
    const d = delayDays(x)
    if (d === null) continue
    const b = bins.find((y) => y.test(d))
    if (b) b.count += 1
  }
  return bins.map(({ label, count, tone }) => ({ label, count, tone }))
}

export function leadBins(done: WorkRequest[]): Bin[] {
  const edges: [string, number, number][] = [
    ['〜14日', 0, 14], ['15〜28日', 15, 28], ['29〜42日', 29, 42], ['43〜56日', 43, 56], ['57日〜', 57, Infinity],
  ]
  return edges.map(([label, lo, hi]) => ({
    label, tone: 'base' as const,
    count: done.filter((x) => {
      const d = leadTime(x)
      return d !== null && d >= lo && d <= hi
    }).length,
  }))
}

export function circulationBins(reqs: WorkRequest[]): Bin[] {
  const edges: [string, number, number][] = [
    ['1日未満', 0, 1], ['1〜2日', 1, 2], ['2〜3日', 2, 3], ['3〜5日', 3, 5], ['5日以上', 5, Infinity],
  ]
  const days = reqs.map(circulationDays).filter((x): x is number => x !== null)
  return edges.map(([label, lo, hi]) => ({ label, tone: 'base' as const, count: days.filter((d) => d >= lo && d < hi).length }))
}

/** 遅れが大きかった完了済みの依頼 */
export function mostDelayed(db: DB, r: Range, dept: string, limit = 6) {
  return completedIn(db, r, dept)
    .map((x) => ({ req: x, delay: delayDays(x) ?? 0, lead: leadTime(x) }))
    .filter((x) => x.delay > 0)
    .sort((a, b) => b.delay - a.delay)
    .slice(0, limit)
}

// ── 承認・回覧 ─────────────────────────────────────────

export const STAGE_ROLES = ['回覧者1', '回覧者2', '回覧者3', '回覧先1', '回覧先2', '回覧先3']

export interface StageStat {
  role: string
  count: number
  avgHours: number | null
  maxHours: number | null
  returned: number
  proxy: number
}

/** 期間内に処理（承認・差し戻し・代理承認）された承認の記録 */
function actedSteps(db: DB, r: Range, dept: string) {
  return realRequests(db)
    .filter((x) => matchDept(x, dept))
    .flatMap((x) => x.steps.map((s) => ({ req: x, step: s })))
    .filter(({ step }) => step.actedAt && step.sentAt && inRange(toISODate(step.actedAt), r))
}

export function approvalByStage(db: DB, r: Range, dept: string): StageStat[] {
  const acted = actedSteps(db, r, dept)
  return STAGE_ROLES.map((role) => {
    const list = acted.filter(({ step }) => step.role === role)
    const approved = list.filter(({ step }) => step.result === 'approved')
    const hours = approved.map(({ step }) => (step.actedAt! - step.sentAt!) / HOUR_MS)
    return {
      role,
      count: approved.length,
      avgHours: avg(hours),
      maxHours: hours.length ? Math.max(...hours) : null,
      returned: list.filter(({ step }) => step.result === 'returned').length,
      proxy: list.filter(({ step }) => step.result === 'proxy').length,
    }
  })
}

export interface ApproverStat {
  employeeId: string
  name: string
  dept: string
  roles: string[]
  count: number
  avgHours: number
  maxHours: number
  returned: number
}

export function approvalByPerson(db: DB, r: Range, dept: string): ApproverStat[] {
  const map = new Map<string, ApproverStat & { hours: number[] }>()
  for (const { step } of actedSteps(db, r, dept)) {
    const a = step.approver
    const cur = map.get(a.employeeId) ?? { employeeId: a.employeeId, name: a.name, dept: a.dept, roles: [], count: 0, avgHours: 0, maxHours: 0, returned: 0, hours: [] }
    if (!cur.roles.includes(step.role)) cur.roles.push(step.role)
    if (step.result === 'approved') cur.hours.push((step.actedAt! - step.sentAt!) / HOUR_MS)
    if (step.result === 'returned') cur.returned += 1
    map.set(a.employeeId, cur)
  }
  return [...map.values()]
    .filter((x) => x.hours.length)
    .map(({ hours, ...x }) => ({ ...x, count: hours.length, avgHours: avg(hours)!, maxHours: Math.max(...hours) }))
    .sort((a, b) => b.avgHours - a.avgHours)
}

export interface StepEvent {
  at: number
  role: string
  approver: string
  approverDept: string
  comment: string
  reqId: string
  reqNumber: string
  reqTitle: string
}

export function recentReturns(db: DB, r: Range, dept: string, limit = 8): StepEvent[] {
  return actedSteps(db, r, dept)
    .filter(({ step }) => step.result === 'returned')
    .map(({ req, step }) => ({
      at: step.actedAt!, role: step.role, approver: step.approver.name, approverDept: step.approver.dept, comment: step.comment ?? '',
      reqId: req.id, reqNumber: req.number, reqTitle: req.title,
    }))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
}

export function proxyEvents(db: DB, r: Range, dept: string): StepEvent[] {
  return actedSteps(db, r, dept)
    .filter(({ step }) => step.result === 'proxy')
    .map(({ req, step }) => ({
      at: step.actedAt!, role: step.role, approver: step.approver.name, approverDept: step.approver.dept,
      comment: `${step.proxy?.by.name ?? ''}：${step.proxy?.reason ?? ''}`, reqId: req.id, reqNumber: req.number, reqTitle: req.title,
    }))
    .sort((a, b) => b.at - a.at)
}

// ── 担当者の負荷 ───────────────────────────────────────

export interface MemberLoad {
  employee: Employee
  inProgress: number
  dueSoon: number
  overdue: number
  completed: number
  avgLead: number | null
  contribution: number
  otherOpen: number
}

export function workload(db: DB, r: Range, dept: string, now: number): MemberLoad[] {
  const all = realRequests(db).filter((x) => matchDept(x, dept))
  const done = completedIn(db, r, dept)
  return db.employees
    .filter((e) => isEquipment(e) && e.active)
    .map((e) => {
      const open = all.filter((x) => x.status === 'inProgress' && x.assignees.includes(e.id))
      const mine = done.filter((x) => x.assignees.includes(e.id))
      const reqAmount = mine.reduce((a, x) => a + (splitAmount(x.contribution ?? 0, x.assignees, x.ratios).find((s) => s.id === e.id)?.amount ?? 0), 0)
      const others = db.otherWorks.filter((w) => w.assignees.includes(e.id) && (dept === 'all' || deptNameOf(db, w.deptId) === dept))
      const otherAmount = others
        .filter((w) => inRange(w.completedDate, r))
        .reduce((a, w) => a + (splitAmount(w.contribution ?? 0, w.assignees, w.ratios).find((s) => s.id === e.id)?.amount ?? 0), 0)
      return {
        employee: e,
        inProgress: open.length,
        dueSoon: open.filter((x) => dueTone(x, now) === 'soon').length,
        overdue: open.filter((x) => dueTone(x, now) === 'overdue').length,
        completed: mine.length,
        avgLead: avg(mine.map(leadTime).filter((x): x is number => x !== null)),
        contribution: reqAmount + otherAmount,
        otherOpen: others.filter((w) => !w.completedDate).length,
      }
    })
    .sort((a, b) => b.inProgress - a.inProgress || b.completed - a.completed)
}

// ── 部署・問い合わせ ───────────────────────────────────

export interface DeptStat {
  dept: string
  requested: number
  completed: number
  avgLead: number | null
  onTimeRate: number | null
  returnRate: number | null
  contribution: number
}

export function deptStats(db: DB, r: Range): DeptStat[] {
  const names = [...new Set(realRequests(db).map((x) => x.requester.dept))]
  return names
    .map((dept) => {
      const k = kpis(db, r, dept)
      return {
        dept, requested: k.requested, completed: k.completed, avgLead: k.avgLead, onTimeRate: k.onTimeRate,
        returnRate: k.returnRate, contribution: k.contribution,
      }
    })
    .filter((d) => d.requested || d.completed)
    .sort((a, b) => b.requested - a.requested || b.completed - a.completed)
}

export interface InquiryStat {
  category: InquiryCategory
  count: number
  avgFirstAnswerHours: number | null
}

export function inquiryStats(db: DB, r: Range) {
  const list = db.inquiries.filter((q) => inRange(toISODate(q.createdAt), r))
  const firstAnswer = (q: (typeof list)[number]) => {
    const a = q.messages.filter((m) => m.kind === 'answer').sort((x, y) => x.at - y.at)[0]
    return a ? (a.at - q.createdAt) / HOUR_MS : null
  }
  const cats: InquiryCategory[] = ['使い方', '不具合', '要望', 'その他']
  const byCategory: InquiryStat[] = cats.map((c) => {
    const qs = list.filter((q) => q.category === c)
    return { category: c, count: qs.length, avgFirstAnswerHours: avg(qs.map(firstAnswer).filter((x): x is number => x !== null)) }
  })
  return {
    total: list.length,
    open: db.inquiries.filter((q) => q.status === 'open').length,
    resolved: list.filter((q) => q.status === 'resolved').length,
    avgFirstAnswerHours: avg(list.map(firstAnswer).filter((x): x is number => x !== null)),
    byCategory,
  }
}

// ── インサイト（自動の気づき） ─────────────────────────

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('ja-JP')

/** 前の期間と比べるのに必要な最小の依頼件数（少なすぎる比較は誤解を招くため出さない） */
export const MIN_COMPARE = 10

export function insights(db: DB, r: Range, dept: string, now: number): string[] {
  const out: string[] = []
  const k = kpis(db, r, dept)
  const prev = previousRange(r)
  if (prev) {
    const p = kpis(db, prev, dept)
    if (p.requested >= MIN_COMPARE && k.requested !== p.requested) {
      const d = ((k.requested - p.requested) / p.requested) * 100
      out.push(`依頼件数は前の期間（${p.requested}件）より${Math.abs(Math.round(d))}%${d > 0 ? '増えて' : '減って'}${k.requested}件です。`)
    }
  }
  const stages = approvalByStage(db, r, dept).filter((s) => s.avgHours !== null && s.count >= 2)
  if (stages.length) {
    const slow = [...stages].sort((a, b) => b.avgHours! - a.avgHours!)[0]
    out.push(`承認に最も時間がかかっている段階は「${slow.role}」で、平均${fmt1(slow.avgHours!)}時間です。`)
  }
  const depts = deptStats(db, r).filter((d) => d.completed >= 2 && d.onTimeRate !== null)
  if (depts.length) {
    const worst = [...depts].sort((a, b) => a.onTimeRate! - b.onTimeRate!)[0]
    if (worst.onTimeRate! < 100) out.push(`納期遵守率が最も低い部署は「${worst.dept}」で、${Math.round(worst.onTimeRate!)}%です。`)
  }
  const load = workload(db, r, dept, now).filter((m) => m.inProgress > 0)
  if (load.length) {
    const top = load[0]
    const due = top.dueSoon + top.overdue
    out.push(`対応中の依頼が最も多いのは${top.employee.name}さん（${top.inProgress}件${due ? `、うち納期7日以内・超過 ${due}件` : ''}）です。`)
  }
  const stuck = funnel(db, dept, now).filter((f) => f.key !== 'circulating' && f.key !== 'returned' && f.count > 0)
  if (stuck.length) {
    const big = [...stuck].sort((a, b) => b.count - a.count)[0]
    out.push(`現在いちばん多く滞留している工程は「${big.label}」（${big.count}件）です。`)
  }
  if (k.returnRate !== null && k.returnRate > 0) {
    const ret = approvalByStage(db, r, dept).sort((a, b) => b.returned - a.returned)[0]
    if (ret.returned) out.push(`差し戻し率は${Math.round(k.returnRate)}%。差し戻しが多い段階は「${ret.role}」（${ret.returned}件）です。`)
  }
  return out.slice(0, 5)
}
