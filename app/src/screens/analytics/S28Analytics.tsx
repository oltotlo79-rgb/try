// S28 データ分析（要件外の追加提案）：依頼・承認・製作のデータを期間と部署で絞り込み、傾向を見る
import { useMemo, useState, type ReactNode } from 'react'
import {
  AlarmClock, ArrowDownRight, ArrowUpRight, BarChart3, CalendarClock, CheckCircle2, Coins, Download, FileInput, Gauge, Home,
  Hourglass, Layers, Lightbulb, MessageCircleQuestion, Minus, ShieldCheck, Timer, Undo2, Users, Workflow,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { Avatar, Badge, Empty, PageHead, Panel, Seg } from '../../components/ui'
import {
  MIN_COMPARE, approvalByPerson, approvalByStage, circulationBins, completedIn, delayBins, deptStats, funnel, inquiryStats, insights, kpis,
  leadBins, makeRange, monthly, mostDelayed, previousRange, proxyEvents, realRequests, recentReturns, requestedIn, workload,
  type Bin, type Kpis, type RangeKey,
} from '../../domain/analytics'
import { fmtDate, fmtMD, fmtMDHM, fmtYen, toISODate } from '../../domain/format'
import { saveTextFile, toCsv } from '../../lib/files'
import hero from '../../assets/img/analytics_hero.webp'
import './analytics.css'

// 色（dataviz の検証済みパレット。S17 と同じ。文字には使わない）
const C1 = '#1ba3cb' // 系列1（依頼・依頼書・期限内）
const C2 = '#7f6cf2' // 系列2（完了・依頼書以外）
const LATE = '#ff6b6b' // 遅延（状態色）
const WARM = '#f0884d' // 分布の遅れ側
const MID = '#6d7a8b' // 分布の中央（当日）

type Tab = 'overview' | 'due' | 'approval' | 'members' | 'depts'
const TABS: [Tab, string, typeof Gauge][] = [
  ['overview', '概要', Gauge],
  ['due', '納期・リードタイム', CalendarClock],
  ['approval', '承認・回覧', ShieldCheck],
  ['members', '担当者・負荷', Users],
  ['depts', '部署・問い合わせ', Layers],
]

const n1 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : (Math.round(v * 10) / 10).toLocaleString('ja-JP'))
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('ja-JP'))
const yenCompact = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万` : v.toLocaleString('ja-JP'))

/** 目盛りをきりのよい値にする */
function niceStep(max: number, integer: boolean) {
  if (max <= 0) return 1
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  const s = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
  return integer ? Math.max(1, Math.ceil(s)) : s
}

export default function S28Analytics({ route }: { route: RouteOf<'S28'> }) {
  void route
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const [now] = useState(() => Date.now())
  const [rangeKey, setRangeKey] = useState<RangeKey>('12m')
  const [dept, setDept] = useState('all')
  const [tab, setTab] = useState<Tab>('overview')

  const range = useMemo(() => makeRange(rangeKey, db, now), [rangeKey, db, now])
  const prev = useMemo(() => previousRange(range), [range])
  const depts = useMemo(() => [...new Set(realRequests(db).map((r) => r.requester.dept))].sort(), [db])
  const k = useMemo(() => kpis(db, range, dept), [db, range, dept])
  // 前の期間のデータが少ないときは比較しない
  const kp = useMemo(() => {
    if (!prev) return null
    const p = kpis(db, prev, dept)
    return p.requested >= MIN_COMPARE ? p : null
  }, [db, prev, dept])
  const months = useMemo(() => monthly(db, range, dept), [db, range, dept])
  const notes = useMemo(() => insights(db, range, dept, now), [db, range, dept, now])
  const hasData = k.requested + k.completed > 0

  const exportCsv = () => {
    const head = ['月', '依頼件数', '完了件数', '期限内', '遅延', '貢献額_依頼書(円)', '貢献額_依頼書以外(円)']
    const body = months.map((m) => [m.ym, m.requested, m.completed, m.onTime, m.late, m.contribReq, m.contribOther])
    saveTextFile(`データ分析_月別_${toISODate(now).replace(/-/g, '')}.csv`, toCsv([head, ...body]), 'csv')
  }

  return (
    <div className="page wide">
      <PageHead
        sid="S28"
        en="ANALYTICS · 追加提案"
        title="データ分析"
        desc="依頼・承認・製作のデータを集計して、件数の推移・納期・承認にかかる時間・担当者の負荷を確認します。"
        actions={
          <>
            <button className="btn" onClick={exportCsv}><Download /> 月別CSV出力</button>
            <button className="btn btn-ghost" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>
          </>
        }
      />

      <section className="an-hero">
        <img src={hero} alt="" />
        <div className="an-hero-shade" />
        <div className="an-hero-body">
          <div className="an-filter">
            <span className="label">期間</span>
            <Seg<RangeKey>
              value={rangeKey}
              onChange={setRangeKey}
              options={[['12m', '直近12か月'], ['fy', '今年度'], ['prevFy', '前年度'], ['all', 'すべて']]}
            />
          </div>
          <div className="an-filter">
            <span className="label">依頼部署</span>
            <select className="select" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: 180 }}>
              <option value="all">すべての部署</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <span className="grow" />
          <div className="an-period">
            <b>{range.label}</b>
            <span className="mono">{fmtDate(range.from)} 〜 {fmtDate(range.to)}</span>
            {prev && <span className="tiny tx-3">比較：{fmtDate(prev.from)} 〜 {fmtDate(prev.to)}</span>}
          </div>
        </div>
      </section>

      <KpiGrid k={k} kp={kp} hasPrev={!!prev} />

      {notes.length > 0 && (
        <Panel title="インサイト" icon={<Lightbulb />} sub="データから自動で読み取った気づき" className="mt-16">
          <ul className="an-insights">
            {notes.map((t) => (
              <li key={t}><span className="an-insight-dot" />{t}</li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="tabs mt-24">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {!hasData && tab !== 'overview' && tab !== 'members' ? (
        <Panel><Empty title="この期間のデータはありません" desc="期間や依頼部署を変えてみてください" /></Panel>
      ) : (
        <div key={tab} className="an-tab">
          {tab === 'overview' && <Overview months={months} dept={dept} now={now} hasData={hasData} />}
          {tab === 'due' && <DueTab rangeKey={rangeKey} dept={dept} now={now} months={months} />}
          {tab === 'approval' && <ApprovalTab rangeKey={rangeKey} dept={dept} now={now} />}
          {tab === 'members' && <MembersTab rangeKey={rangeKey} dept={dept} now={now} />}
          {tab === 'depts' && <DeptsTab rangeKey={rangeKey} dept={dept} now={now} />}
        </div>
      )}
      <p className="hint mt-16">
        ※ 要件定義書にはない追加提案の画面です。集計の基準日：依頼件数は依頼日、完了・リードタイム・納期遵守は引き渡し完了日、貢献額は引き渡し完了日（依頼書以外の作業は完了日）。
      </p>
    </div>
  )
}

// ── KPI ────────────────────────────────────────────────

function KpiGrid({ k, kp, hasPrev }: { k: Kpis; kp: Kpis | null; hasPrev: boolean }) {
  type Def = { label: string; icon: ReactNode; value: string; unit: string; cur: number | null; prev: number | null; good: 'up' | 'down' | 'none'; deltaUnit: string; dp?: number }
  const defs: Def[] = [
    { label: '依頼件数', icon: <FileInput />, value: n0(k.requested), unit: '件', cur: k.requested, prev: kp?.requested ?? null, good: 'none', deltaUnit: '件' },
    { label: '完了件数', icon: <CheckCircle2 />, value: n0(k.completed), unit: '件', cur: k.completed, prev: kp?.completed ?? null, good: 'up', deltaUnit: '件' },
    { label: '現在対応中', icon: <Timer />, value: n0(k.inProgress), unit: '件', cur: null, prev: null, good: 'none', deltaUnit: '' },
    { label: '平均リードタイム', icon: <Hourglass />, value: n1(k.avgLead), unit: '日', cur: k.avgLead, prev: kp?.avgLead ?? null, good: 'down', deltaUnit: '日', dp: 1 },
    { label: '納期遵守率', icon: <AlarmClock />, value: n0(k.onTimeRate), unit: '%', cur: k.onTimeRate, prev: kp?.onTimeRate ?? null, good: 'up', deltaUnit: 'pt' },
    { label: '平均回覧日数', icon: <Workflow />, value: n1(k.avgCirculation), unit: '日', cur: k.avgCirculation, prev: kp?.avgCirculation ?? null, good: 'down', deltaUnit: '日', dp: 1 },
    { label: '差し戻し率', icon: <Undo2 />, value: n0(k.returnRate), unit: '%', cur: k.returnRate, prev: kp?.returnRate ?? null, good: 'down', deltaUnit: 'pt' },
    { label: '貢献額合計', icon: <Coins />, value: yenCompact(k.contribution), unit: '円', cur: k.contribution, prev: kp?.contribution ?? null, good: 'up', deltaUnit: '円' },
  ]
  return (
    <div className="an-kpis mt-16">
      {defs.map((d) => {
        const diff = d.cur !== null && d.prev !== null ? d.cur - d.prev : null
        const flat = diff === null || Math.abs(diff) < (d.dp ? 0.05 : 0.5)
        const better = !flat && d.good !== 'none' && ((diff! > 0) === (d.good === 'up'))
        const tone = flat || d.good === 'none' ? 'tx-3' : better ? 'tx-ok' : 'tx-danger'
        const shown = diff === null ? '' : d.deltaUnit === '円' ? yenCompact(Math.abs(diff)) : d.dp ? n1(Math.abs(diff)) : n0(Math.abs(diff))
        return (
          <div key={d.label} className="stat an-kpi">
            <div className="stat-label">{d.icon}{d.label}</div>
            <div className="stat-value">{d.value}<small>{d.value === '—' ? '' : d.unit}</small></div>
            <div className={`an-delta ${tone}`}>
              {diff === null ? (
                <span className="tx-4">{d.label === '現在対応中' ? '今日時点' : hasPrev ? '前の期間はデータが少ないため比較なし' : '比較なし'}</span>
              ) : (
                <>
                  {flat ? <Minus size={13} /> : diff > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {flat ? '前の期間と同じ' : `${shown}${d.deltaUnit} 前の期間比`}
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── 図の部品 ───────────────────────────────────────────

interface Series { key: string; label: string; color: string }
interface ColDatum { label: string; sub?: string; values: Record<string, number> }

/** 縦棒（積み上げ／並べる）。ホバーで内訳を表示する */
function ColumnChart({
  data, series, mode, fmt = (v) => n0(v), integer = true, height = 210, unit,
}: { data: ColDatum[]; series: Series[]; mode: 'stacked' | 'grouped'; fmt?: (v: number) => string; integer?: boolean; height?: number; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map((d) =>
    mode === 'stacked' ? series.reduce((a, s) => a + (d.values[s.key] ?? 0), 0) : Math.max(0, ...series.map((s) => d.values[s.key] ?? 0)),
  )
  const max = Math.max(0, ...totals)
  const step = niceStep(max, integer)
  const top = Math.max(step, Math.ceil(max / step) * step)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const h = (v: number) => `${(v / top) * 100}%`
  return (
    <div className="an-cols">
      {series.length > 1 && (
        <div className="chart-legend an-legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}
        </div>
      )}
      <div className="an-cols-body" style={{ height }}>
        <div className="an-yaxis">
          {ticks.map((t) => <span key={t} style={{ bottom: h(t) }}>{fmt(t)}</span>)}
        </div>
        <div className="an-plot">
          {ticks.map((t) => <i key={t} className="an-gridline" style={{ bottom: h(t) }} />)}
          <div className="an-groups">
            {data.map((d, i) => (
              <div key={d.label + i} className={`an-group ${hover === i ? 'on' : ''}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                {mode === 'grouped' ? (
                  <div className="an-grouped">
                    {series.map((s) => (
                      <i key={s.key} style={{ height: h(d.values[s.key] ?? 0), background: s.color }} />
                    ))}
                  </div>
                ) : (
                  <div className="an-stack" style={{ height: h(totals[i]) }}>
                    {series.map((s) => {
                      const v = d.values[s.key] ?? 0
                      return v > 0 ? <i key={s.key} style={{ flexGrow: v, background: s.color }} /> : null
                    })}
                  </div>
                )}
                {hover === i && (
                  <div className={`chart-tip an-tip ${i > data.length / 2 ? 'left' : ''}`}>
                    <b>{d.sub ? `${d.sub}年` : ''}{d.label}</b>
                    {series.map((s) => (
                      <span key={s.key} className="an-tip-row">
                        <span className="k"><i style={{ background: s.color }} />{s.label}</span>
                        <span className="v">{fmt(d.values[s.key] ?? 0)}{unit}</span>
                      </span>
                    ))}
                    {mode === 'stacked' && series.length > 1 && <span className="sum"><span>合計</span><span>{fmt(totals[i])}{unit}</span></span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="an-xlabels">
        {data.map((d, i) => (
          <span key={d.label + i}>{d.label}{d.sub && <small>{d.sub}</small>}</span>
        ))}
      </div>
    </div>
  )
}

/** 分布（少ない本数の縦棒。値は棒の上に表示） */
function BinChart({ bins, colorOf, unit = '件' }: { bins: Bin[]; colorOf: (b: Bin) => string; unit?: string }) {
  const max = Math.max(1, ...bins.map((b) => b.count))
  const total = bins.reduce((a, b) => a + b.count, 0)
  if (!total) return <Empty title="対象のデータがありません" />
  return (
    <div className="an-bins">
      {bins.map((b) => (
        <div key={b.label} className="an-bin" title={`${b.label}：${b.count}${unit}（${Math.round((b.count / total) * 100)}%）`}>
          <span className="an-bin-val mono">{b.count}</span>
          <div className="an-bin-track">
            <i style={{ height: `${(b.count / max) * 100}%`, background: colorOf(b) }} />
          </div>
          <span className="an-bin-label">{b.label}</span>
        </div>
      ))}
    </div>
  )
}

/** 横棒（順位・比較） */
function HBar({ value, max, color = C1 }: { value: number; max: number; color?: string }) {
  return (
    <div className="an-hbar">
      <i style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, background: color }} />
    </div>
  )
}

/** 率のメーター（0〜100%） */
function RateMeter({ value }: { value: number | null }) {
  if (value === null) return <span className="tx-3">—</span>
  const tone = value >= 90 ? 'var(--ok)' : value >= 70 ? 'var(--warn)' : 'var(--danger)'
  return (
    <span className="an-meter">
      <span className="an-meter-track"><i style={{ width: `${value}%`, background: tone }} /></span>
      <span className="mono">{Math.round(value)}%</span>
    </span>
  )
}

const monthLabel = (ym: string, i: number) => {
  const m = Number(ym.slice(5))
  return { label: `${m}月`, sub: i === 0 || m === 1 ? ym.slice(0, 4) : undefined }
}

// ── タブ：概要 ─────────────────────────────────────────

function Overview({ months, dept, now, hasData }: { months: ReturnType<typeof monthly>; dept: string; now: number; hasData: boolean }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const rows = useMemo(() => funnel(db, dept, now), [db, dept, now])
  const maxCount = Math.max(1, ...rows.map((r) => r.count))
  return (
    <div className="col gap-16">
      <div className="grid-2">
        <Panel title="月別の依頼件数・完了件数" icon={<BarChart3 />} sub="依頼件数は依頼日、完了件数は引き渡し完了日で数えます">
          {hasData ? (
            <ColumnChart
              mode="grouped"
              unit="件"
              series={[{ key: 'requested', label: '依頼件数', color: C1 }, { key: 'completed', label: '完了件数', color: C2 }]}
              data={months.map((m, i) => ({ ...monthLabel(m.ym, i), values: { requested: m.requested, completed: m.completed } }))}
            />
          ) : <Empty title="この期間のデータはありません" />}
        </Panel>
        <Panel title="月別の貢献額" icon={<Coins />} sub="引き渡し完了日（依頼書以外の作業は完了日）で集計">
          {months.some((m) => m.contribReq + m.contribOther > 0) ? (
            <ColumnChart
              mode="stacked"
              unit="円"
              integer={false}
              fmt={yenCompact}
              series={[{ key: 'req', label: '依頼書', color: C1 }, { key: 'other', label: '依頼書以外の作業', color: C2 }]}
              data={months.map((m, i) => ({ ...monthLabel(m.ym, i), values: { req: m.contribReq, other: m.contribOther } }))}
            />
          ) : <Empty title="この期間の貢献額はありません" />}
        </Panel>
      </div>
      <Panel title="現在の工程の滞留" icon={<Workflow />} sub="今日時点で進行中の依頼が、どの工程に何件あるか（行をクリックすると依頼書一覧へ）" tight>
        <div className="an-funnel">
          {rows.map((r, i) => (
            <button key={r.key} className="an-funnel-row" onClick={() => go({ s: 'S14' })}>
              <span className="an-funnel-no mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="an-funnel-label">{r.label}</span>
              <span className="an-funnel-track"><i style={{ width: `${(r.count / maxCount) * 100}%` }} /></span>
              <span className="an-funnel-count mono">{r.count}<small>件</small></span>
              <span className="an-funnel-age small tx-2">{r.count ? `平均 ${n1(r.avgAge)}日${r.key === 'circulating' ? '（承認待ち）' : '（依頼から）'}` : '—'}</span>
              <span className="an-funnel-flag">{r.overdue > 0 && <Badge tone="danger" sm dot>納期超過 {r.overdue}</Badge>}</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  )
}

// ── タブ：納期・リードタイム ───────────────────────────

function DueTab({ rangeKey, dept, now, months }: { rangeKey: RangeKey; dept: string; now: number; months: ReturnType<typeof monthly> }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const range = useMemo(() => makeRange(rangeKey, db, now), [rangeKey, db, now])
  const done = useMemo(() => completedIn(db, range, dept), [db, range, dept])
  const delayed = useMemo(() => mostDelayed(db, range, dept, 8), [db, range, dept])
  return (
    <div className="col gap-16">
      <div className="grid-2">
        <Panel title="月別の納期遵守" icon={<AlarmClock />} sub="引き渡し完了日が納期以内なら「期限内」">
          {done.length ? (
            <ColumnChart
              mode="stacked"
              unit="件"
              series={[{ key: 'onTime', label: '期限内', color: C1 }, { key: 'late', label: '遅延', color: LATE }]}
              data={months.map((m, i) => ({ ...monthLabel(m.ym, i), values: { onTime: m.onTime, late: m.late } }))}
            />
          ) : <Empty title="この期間に完了した依頼はありません" />}
        </Panel>
        <Panel title="納期との差の分布" icon={<CalendarClock />} sub="引き渡し完了日 − 納期（前倒し／当日／遅れ）">
          <div className="chart-legend an-legend">
            <span><i style={{ background: C1 }} />前倒し</span>
            <span><i style={{ background: MID }} />当日</span>
            <span><i style={{ background: WARM }} />遅れ</span>
          </div>
          <BinChart bins={delayBins(done)} colorOf={(b) => (b.tone === 'early' ? C1 : b.tone === 'neutral' ? MID : WARM)} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="リードタイムの分布" icon={<Hourglass />} sub="依頼日から引き渡し完了日までの日数">
          <BinChart bins={leadBins(done)} colorOf={() => C1} />
        </Panel>
        <Panel title="遅れが大きかった依頼" icon={<AlarmClock />} sub="行をクリックすると依頼書の詳細へ" tight>
          {delayed.length ? (
            <table className="table">
              <thead><tr><th>依頼番号</th><th>件名</th><th>部署</th><th className="r">納期</th><th className="r">完了</th><th className="r">遅れ</th></tr></thead>
              <tbody>
                {delayed.map(({ req, delay }) => (
                  <tr key={req.id} className="click" onClick={() => go({ s: 'S15', reqId: req.id })}>
                    <td className="id-cell">{req.number}</td>
                    <td className="an-ellipsis">{req.title}</td>
                    <td className="nowrap small">{req.requester.dept}</td>
                    <td className="r mono small">{fmtMD(req.dueDate)}</td>
                    <td className="r mono small">{fmtMD(req.deliveryDate)}</td>
                    <td className="r"><Badge tone="danger" sm>{delay}日</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="遅れた依頼はありません" desc="この期間はすべて納期以内に引き渡されました" />}
        </Panel>
      </div>
    </div>
  )
}

// ── タブ：承認・回覧 ───────────────────────────────────

function ApprovalTab({ rangeKey, dept, now }: { rangeKey: RangeKey; dept: string; now: number }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const range = useMemo(() => makeRange(rangeKey, db, now), [rangeKey, db, now])
  const stages = useMemo(() => approvalByStage(db, range, dept), [db, range, dept])
  const people = useMemo(() => approvalByPerson(db, range, dept), [db, range, dept])
  const returns = useMemo(() => recentReturns(db, range, dept), [db, range, dept])
  const proxies = useMemo(() => proxyEvents(db, range, dept), [db, range, dept])
  const reqs = useMemo(() => requestedIn(db, range, dept), [db, range, dept])
  const maxH = Math.max(1, ...stages.map((s) => s.avgHours ?? 0))
  const maxP = Math.max(1, ...people.map((p) => p.avgHours))
  return (
    <div className="col gap-16">
      <div className="grid-2">
        <Panel title="段階ごとの平均承認時間" icon={<Timer />} sub="承認依頼メールの送信から承認までの時間（代理承認は除く）" tight>
          <table className="table">
            <thead><tr><th>段階</th><th style={{ width: '42%' }}>平均</th><th className="r">件数</th><th className="r">最長</th><th className="r">差し戻し</th><th className="r">代理</th></tr></thead>
            <tbody>
              {stages.map((s) => (
                <tr key={s.role} className={s.count ? '' : 'muted'}>
                  <td className="nowrap">{s.role}</td>
                  <td>
                    <div className="an-barcell">
                      <HBar value={s.avgHours ?? 0} max={maxH} />
                      <span className="mono small">{s.avgHours === null ? '—' : `${n1(s.avgHours)}時間`}</span>
                    </div>
                  </td>
                  <td className="r mono">{s.count}</td>
                  <td className="r mono small tx-2">{s.maxHours === null ? '—' : `${n1(s.maxHours)}h`}</td>
                  <td className="r mono">{s.returned || <span className="tx-4">0</span>}</td>
                  <td className="r mono">{s.proxy || <span className="tx-4">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="回覧日数の分布" icon={<Workflow />} sub="最初の承認依頼から最後の承認まで（期間内に依頼された依頼）">
          <BinChart bins={circulationBins(reqs)} colorOf={() => C1} />
        </Panel>
      </div>
      <div className="grid-2">
        <Panel title="承認者ごとの平均承認時間" icon={<Users />} sub="時間がかかっている順（上位10人）" tight>
          {people.length ? (
            <table className="table">
              <thead><tr><th>承認者</th><th>段階</th><th style={{ width: '36%' }}>平均</th><th className="r">件数</th></tr></thead>
              <tbody>
                {people.slice(0, 10).map((p) => (
                  <tr key={p.employeeId}>
                    <td className="nowrap"><span className="row gap-6"><Avatar name={p.name} size="sm" color="var(--role-approver)" />{p.name}<span className="tiny tx-3">{p.dept}</span></span></td>
                    <td className="small tx-2">{p.roles.join('・')}</td>
                    <td><div className="an-barcell"><HBar value={p.avgHours} max={maxP} color={C2} /><span className="mono small">{n1(p.avgHours)}時間</span></div></td>
                    <td className="r mono">{p.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty title="この期間の承認はありません" />}
        </Panel>
        <div className="col gap-16">
          <Panel title="最近の差し戻し理由" icon={<Undo2 />} sub="クリックすると依頼書の詳細へ" tight>
            {returns.length ? (
              <div className="an-events">
                {returns.map((e) => (
                  <button key={e.at + e.reqId} className="an-event" onClick={() => go({ s: 'S15', reqId: e.reqId })}>
                    <span className="mono tiny tx-3">{fmtMDHM(e.at)}</span>
                    <span className="grow">
                      <span className="small"><span className="id-cell">{e.reqNumber}</span>　{e.reqTitle}</span>
                      <span className="an-event-text">「{e.comment}」</span>
                    </span>
                    <span className="tiny tx-2 nowrap">{e.role} {e.approver}</span>
                  </button>
                ))}
              </div>
            ) : <Empty title="この期間の差し戻しはありません" />}
          </Panel>
          <Panel title={`代理承認 ${proxies.length}件`} icon={<ShieldCheck />} sub="管理者・IT担当者が代わりに承認した記録" tight>
            {proxies.length ? (
              <div className="an-events">
                {proxies.map((e) => (
                  <button key={e.at + e.reqId} className="an-event" onClick={() => go({ s: 'S15', reqId: e.reqId })}>
                    <span className="mono tiny tx-3">{fmtMDHM(e.at)}</span>
                    <span className="grow">
                      <span className="small"><span className="id-cell">{e.reqNumber}</span>　{e.role} {e.approver}</span>
                      <span className="an-event-text">{e.comment}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : <div className="small tx-3" style={{ padding: '14px 20px' }}>この期間の代理承認はありません</div>}
          </Panel>
        </div>
      </div>
    </div>
  )
}

// ── タブ：担当者・負荷 ─────────────────────────────────

function MembersTab({ rangeKey, dept, now }: { rangeKey: RangeKey; dept: string; now: number }) {
  const db = useApp((s) => s.db)
  const range = useMemo(() => makeRange(rangeKey, db, now), [rangeKey, db, now])
  const rows = useMemo(() => workload(db, range, dept, now), [db, range, dept, now])
  const maxOpen = Math.max(1, ...rows.map((r) => r.inProgress))
  const maxAmt = Math.max(1, ...rows.map((r) => r.contribution))
  return (
    <Panel title="担当者ごとの負荷と実績" icon={<Users />} sub="対応中・納期は今日時点、完了件数・リードタイム・貢献額は選んだ期間（2人担当の貢献額は配分で按分）" tight>
      <table className="table">
        <thead>
          <tr>
            <th>担当者</th><th style={{ width: '22%' }}>対応中</th><th className="r">納期7日以内</th><th className="r">納期超過</th>
            <th className="r">依頼書以外（未完了）</th><th className="r">完了</th><th className="r">平均リードタイム</th><th style={{ width: '20%' }}>貢献額</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.employee.id}>
              <td className="nowrap"><span className="row gap-6"><Avatar emp={m.employee} size="sm" />{m.employee.name}</span></td>
              <td><div className="an-barcell"><HBar value={m.inProgress} max={maxOpen} /><span className="mono small">{m.inProgress}件</span></div></td>
              <td className="r">{m.dueSoon ? <Badge tone="warn" sm>{m.dueSoon}件</Badge> : <span className="tx-4 mono">0</span>}</td>
              <td className="r">{m.overdue ? <Badge tone="danger" sm>{m.overdue}件</Badge> : <span className="tx-4 mono">0</span>}</td>
              <td className="r mono">{m.otherOpen}</td>
              <td className="r mono">{m.completed}</td>
              <td className="r mono">{m.avgLead === null ? '—' : `${n1(m.avgLead)}日`}</td>
              <td><div className="an-barcell"><HBar value={m.contribution} max={maxAmt} color={C2} /><span className="mono small">{fmtYen(m.contribution)}</span></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

// ── タブ：部署・問い合わせ ─────────────────────────────

function DeptsTab({ rangeKey, dept, now }: { rangeKey: RangeKey; dept: string; now: number }) {
  const db = useApp((s) => s.db)
  const range = useMemo(() => makeRange(rangeKey, db, now), [rangeKey, db, now])
  const rows = useMemo(() => deptStats(db, range), [db, range])
  const q = useMemo(() => inquiryStats(db, range), [db, range])
  const maxReq = Math.max(1, ...rows.map((r) => r.requested))
  const maxQ = Math.max(1, ...q.byCategory.map((c) => c.count))
  return (
    <div className="col gap-16">
      <Panel title="部署別の依頼と納期" icon={<Layers />} sub="依頼部署ごとの件数・リードタイム・納期遵守率・差し戻し率・貢献額（選んだ部署は強調表示）" tight>
        {rows.length ? (
          <table className="table">
            <thead>
              <tr><th>依頼部署</th><th style={{ width: '24%' }}>依頼件数</th><th className="r">完了</th><th className="r">平均リードタイム</th><th>納期遵守率</th><th className="r">差し戻し率</th><th className="r">貢献額</th></tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.dept} className={dept !== 'all' && dept !== d.dept ? 'muted' : ''}>
                  <td className="nowrap"><b style={{ fontWeight: 500 }}>{d.dept}</b></td>
                  <td><div className="an-barcell"><HBar value={d.requested} max={maxReq} /><span className="mono small">{d.requested}件</span></div></td>
                  <td className="r mono">{d.completed}</td>
                  <td className="r mono">{d.avgLead === null ? '—' : `${n1(d.avgLead)}日`}</td>
                  <td><RateMeter value={d.onTimeRate} /></td>
                  <td className="r mono">{d.returnRate === null ? '—' : `${Math.round(d.returnRate)}%`}</td>
                  <td className="r mono">{fmtYen(d.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <Empty title="この期間のデータはありません" />}
      </Panel>
      <div className="grid-2">
        <Panel title="問い合わせの分類" icon={<MessageCircleQuestion />} sub="期間内に作成された問い合わせ" tight>
          <table className="table">
            <thead><tr><th>分類</th><th style={{ width: '45%' }}>件数</th><th className="r">平均初回回答</th></tr></thead>
            <tbody>
              {q.byCategory.map((c) => (
                <tr key={c.category} className={c.count ? '' : 'muted'}>
                  <td>{c.category}</td>
                  <td><div className="an-barcell"><HBar value={c.count} max={maxQ} color={C2} /><span className="mono small">{c.count}件</span></div></td>
                  <td className="r mono small">{c.avgFirstAnswerHours === null ? '—' : `${n1(c.avgFirstAnswerHours)}時間`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="an-qstats">
          <div className="stat"><div className="stat-label"><MessageCircleQuestion />問い合わせ（期間内）</div><div className="stat-value">{q.total}<small>件</small></div></div>
          <div className="stat"><div className="stat-label"><Timer />平均初回回答時間</div><div className="stat-value">{n1(q.avgFirstAnswerHours)}<small>{q.avgFirstAnswerHours === null ? '' : '時間'}</small></div></div>
          <div className="stat" style={{ ['--glow' as string]: 'rgba(255,181,71,.2)' }}><div className="stat-label"><Hourglass />未回答（今日時点）</div><div className="stat-value" style={{ color: q.open ? 'var(--warn)' : undefined }}>{q.open}<small>件</small></div></div>
          <div className="stat"><div className="stat-label"><CheckCircle2 />解決済み（期間内）</div><div className="stat-value">{q.resolved}<small>件</small></div></div>
        </div>
      </div>
    </div>
  )
}
