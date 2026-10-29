// S17 成果確認：担当者ごとの貢献額をグラフと表で比較する。年度・月で絞り込み、依頼書以外の作業を含めるかを切り替える
import { useMemo, useState } from 'react'
import { BarChart3, Download, Home, Info, Table2, Trophy, Users, Wrench, FileCheck2, Coins } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { Avatar, Empty, PageHead, Panel, Seg } from '../../components/ui'
import { contributionRows, inPeriod, splitAmount, type ContributionRow, type Period } from '../../domain/stats'
import { findEmployee, isEquipment } from '../../domain/rules'
import { fiscalYearOf, fmtYen, toISODate } from '../../domain/format'
import { saveTextFile, toCsv } from '../../lib/files'
import resultsImg from '../../assets/img/menu_results.webp'
import './equipment.css'

/** 目盛りをきりのよい値にする */
function niceStep(max: number) {
  if (max <= 0) return 100000
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}
const compactYen = (v: number) => (v === 0 ? '0' : v >= 10000 ? `${(v / 10000).toLocaleString('ja-JP')}万` : v.toLocaleString('ja-JP'))

export default function S17Results({ route }: { route: RouteOf<'S17'> }) {
  void route
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()
  const thisFy = fiscalYearOf(toISODate(now))
  const thisMonth = toISODate(now).slice(0, 7)

  const [kind, setKind] = useState<'fy' | 'month'>('fy')
  const [fy, setFy] = useState(thisFy)
  const [ym, setYm] = useState(thisMonth)
  const [includeOther, setIncludeOther] = useState(true)
  const [hover, setHover] = useState<string | null>(null)

  // 選べる年度・月（データのある期間＋今年度・今月）
  const { years, months } = useMemo(() => {
    const dates = [
      ...db.requests.filter((r) => r.status === 'done' && r.deliveryDate).map((r) => r.deliveryDate!),
      ...db.otherWorks.filter((w) => w.completedDate).map((w) => w.completedDate!),
    ]
    const ys = new Set([thisFy, ...dates.map(fiscalYearOf)])
    const ms = new Set([thisMonth, ...dates.map((d) => d.slice(0, 7))])
    return { years: [...ys].sort((a, b) => b - a), months: [...ms].sort().reverse() }
  }, [db, thisFy, thisMonth])

  const period: Period = kind === 'fy' ? { kind: 'fy', year: fy } : { kind: 'month', ym }
  const periodLabel = kind === 'fy' ? `${fy}年度（${fy}/4〜${fy + 1}/3）` : `${Number(ym.slice(0, 4))}年${Number(ym.slice(5))}月`

  const rows: ContributionRow[] = useMemo(() => {
    const got = contributionRows(db, period, includeOther)
    // 実績のない設備メンバーも0円で並べる（比較のため）
    for (const e of db.employees.filter((x) => isEquipment(x) && x.active)) {
      if (!got.some((r) => r.employeeId === e.id))
        got.push({ employeeId: e.id, name: e.name, reqCount: 0, reqAmount: 0, otherCount: 0, otherAmount: 0, total: 0 })
    }
    return got.sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, kind, fy, ym, includeOther])

  // 件数は依頼そのものの数（2人担当を二重に数えない）
  const doneReqs = db.requests.filter((r) => r.status === 'done' && inPeriod(r.deliveryDate, period))
  const doneOther = includeOther ? db.otherWorks.filter((w) => inPeriod(w.completedDate, period)) : []
  const total = rows.reduce((a, r) => a + r.total, 0)
  const reqTotal = rows.reduce((a, r) => a + r.reqAmount, 0)
  const otherTotal = rows.reduce((a, r) => a + r.otherAmount, 0)
  const top = rows[0]?.total ? rows[0] : null
  const shared = doneReqs.filter((r) => r.assignees.filter(Boolean).length >= 2).length

  const max = Math.max(0, ...rows.map((r) => r.total))
  const step = niceStep(max)
  const domain = Math.max(step, Math.ceil(max / step) * step)
  const SCALE = 84 // 棒の最大幅（％）。残りは値のラベル用
  const pct = (v: number) => (v / domain) * SCALE
  const ticks = Array.from({ length: Math.round(domain / step) + 1 }, (_, i) => i * step)

  const exportCsv = () => {
    const head = ['担当者', '依頼書_件数', '依頼書_貢献額(円)', '依頼書以外_件数', '依頼書以外_貢献額(円)', '合計_貢献額(円)']
    const body = rows.map((r) => [r.name, r.reqCount, r.reqAmount, includeOther ? r.otherCount : '', includeOther ? r.otherAmount : '', r.total])
    const sum = ['合計', '', reqTotal, '', includeOther ? otherTotal : '', total]
    const name = kind === 'fy' ? `成果確認_${fy}年度.csv` : `成果確認_${ym.replace('-', '')}.csv`
    saveTextFile(name, toCsv([[`集計期間：${periodLabel}`], head, ...body, sum]), 'csv')
  }

  return (
    <div className="page wide">
      <PageHead
        sid="S17"
        en="CONTRIBUTION RESULTS"
        title="成果確認"
        desc="担当者ごとの貢献額をグラフと表で比較します。"
        actions={
          <>
            <button className="btn" onClick={exportCsv}><Download /> CSV出力</button>
            <button className="btn btn-ghost" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>
          </>
        }
      />

      <Panel>
        <div className="eq-controls">
          <span className="label">期間</span>
          <Seg value={kind} options={[['fy', '年度'], ['month', '月']]} onChange={setKind} />
          {kind === 'fy' ? (
            <select className="select" style={{ width: 240 }} value={fy} onChange={(e) => setFy(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}年度（{y}/4〜{y + 1}/3）</option>)}
            </select>
          ) : (
            <select className="select" style={{ width: 180 }} value={ym} onChange={(e) => setYm(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{Number(m.slice(0, 4))}年{Number(m.slice(5))}月</option>)}
            </select>
          )}
          <span className="grow" />
          <label className="check">
            <input type="checkbox" checked={includeOther} onChange={(e) => setIncludeOther(e.target.checked)} />
            依頼書以外の作業を含める
          </label>
        </div>
      </Panel>

      <div className="eq-hero mt-16">
        <img className="eq-hero-img" src={resultsImg} alt="" />
        <div>
          <div className="eq-kpi-label row gap-6"><Coins size={15} className="tx-cyan" />貢献額の合計</div>
          <div className="eq-kpi-value">{fmtYen(total)}<small>円</small></div>
          <div className="tiny tx-3">{periodLabel}</div>
        </div>
        <div>
          <div className="eq-kpi-label row gap-6"><FileCheck2 size={15} className="tx-cyan" />完了した依頼書</div>
          <div className="eq-kpi-value">{doneReqs.length}<small>件</small></div>
          <div className="tiny tx-3">うち複数人で担当 {shared}件</div>
        </div>
        <div>
          <div className="eq-kpi-label row gap-6"><Wrench size={15} style={{ color: 'var(--violet)' }} />依頼書以外の作業</div>
          <div className="eq-kpi-value">{includeOther ? doneOther.length : '—'}<small>{includeOther ? '件' : ''}</small></div>
          <div className="tiny tx-3">{includeOther ? `貢献額 ${fmtYen(otherTotal)}円` : '集計に含めていません'}</div>
        </div>
        <div>
          <div className="eq-kpi-label row gap-6"><Trophy size={15} className="tx-warn" />最も貢献した人</div>
          <div className="eq-kpi-value" style={{ fontFamily: 'var(--font)', fontSize: 22 }}>{top ? top.name : '—'}</div>
          <div className="tiny tx-3">{top ? `${fmtYen(top.total)}円` : '実績がありません'}</div>
        </div>
      </div>

      <Panel
        className="mt-16"
        title="担当者別の貢献額"
        icon={<BarChart3 />}
        sub={`${periodLabel}・棒にマウスを乗せると内訳を表示します`}
        actions={
          includeOther ? (
            <div className="chart-legend">
              <span><i className="l1" />依頼書</span>
              <span><i className="l2" />依頼書以外の作業</span>
            </div>
          ) : undefined
        }
      >
        {total === 0 ? (
          <Empty title="この期間の実績はありません" desc="期間を変えてみてください" />
        ) : (
          <div className="chart" role="img" aria-label={`担当者別の貢献額（${periodLabel}）`}>
            {rows.map((r) => {
              const emp = findEmployee(db, r.employeeId)
              const w = pct(r.total)
              return (
                <div
                  key={r.employeeId}
                  className={`chart-row ${hover === r.employeeId ? 'on' : ''}`}
                  onMouseEnter={() => setHover(r.employeeId)}
                  onMouseLeave={() => setHover(null)}
                >
                  <div className="chart-name">
                    <Avatar emp={emp} size="sm" />
                    {r.name}
                  </div>
                  <div className="chart-track">
                    <div className="chart-grid">
                      {ticks.map((t) => <i key={t} style={{ left: `${pct(t)}%` }} />)}
                    </div>
                    <div className="chart-bars" style={{ width: `${w}%` }}>
                      {r.reqAmount > 0 && <span className="chart-seg s1" style={{ flexGrow: r.reqAmount }} />}
                      {r.otherAmount > 0 && <span className="chart-seg s2" style={{ flexGrow: r.otherAmount }} />}
                    </div>
                    <span className="chart-val" style={{ left: `${w}%` }}>
                      {r.total ? `${fmtYen(r.total)}円` : <span className="tx-3">0円</span>}
                    </span>
                    {hover === r.employeeId && (
                      <div className="chart-tip" style={{ left: `min(${w}%, calc(100% - 260px))` }}>
                        <b>{r.name}</b>
                        <span className="k"><i style={{ background: '#1ba3cb' }} />依頼書</span>
                        <span className="n">{r.reqCount}件</span>
                        <span className="v">{fmtYen(r.reqAmount)}円</span>
                        {includeOther && (
                          <>
                            <span className="k"><i style={{ background: '#7f6cf2' }} />依頼書以外</span>
                            <span className="n">{r.otherCount}件</span>
                            <span className="v">{fmtYen(r.otherAmount)}円</span>
                          </>
                        )}
                        <span className="sum"><span>合計</span><span>{fmtYen(r.total)}円</span></span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            <div className="chart-axis">
              <span />
              <div className="chart-axis-ticks">
                {ticks.map((t) => <span key={t} style={{ left: `${pct(t)}%` }}>{compactYen(t)}</span>)}
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel className="mt-16" title="担当者別の内訳" icon={<Table2 />} sub="件数と貢献額の内訳（表でも確認できます）" tight>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>担当者</th>
                <th className="r">依頼書 件数</th>
                <th className="r">依頼書 貢献額</th>
                <th className="r">依頼書以外 件数</th>
                <th className="r">依頼書以外 貢献額</th>
                <th className="r">合計 貢献額</th>
                <th className="r" style={{ width: 120 }}>構成比</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} onMouseEnter={() => setHover(r.employeeId)} onMouseLeave={() => setHover(null)}>
                  <td><span className="row"><Avatar emp={findEmployee(db, r.employeeId)} size="sm" />{r.name}</span></td>
                  <td className="r mono">{r.reqCount}件</td>
                  <td className="r mono">{fmtYen(r.reqAmount)}</td>
                  <td className="r mono">{includeOther ? `${r.otherCount}件` : '—'}</td>
                  <td className="r mono">{includeOther ? fmtYen(r.otherAmount) : '—'}</td>
                  <td className="r mono" style={{ fontWeight: 600 }}>{fmtYen(r.total)}円</td>
                  <td className="r mono tx-2">{total ? `${((r.total / total) * 100).toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td><span className="row gap-6"><Users size={15} className="tx-cyan" />合計</span></td>
                <td className="r mono">{doneReqs.length}件</td>
                <td className="r mono">{fmtYen(reqTotal)}</td>
                <td className="r mono">{includeOther ? `${doneOther.length}件` : '—'}</td>
                <td className="r mono">{includeOther ? fmtYen(otherTotal) : '—'}</td>
                <td className="r mono">{fmtYen(total)}円</td>
                <td className="r mono">100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <div className="notice info mt-16">
        <Info />
        <span>
          集計の基準日は<b>引き渡し完了日</b>（依頼書以外の作業は<b>完了日</b>）です。複数人で担当した依頼は、配分（％）で分けてそれぞれに計上します
          （例：150,000円・3人で配分40／30／30％ → {splitAmount(150000, ['a', 'b', 'c'], [40, 30, 30]).map((x) => `${fmtYen(x.amount)}円`).join('／')}）。合計行の件数は依頼そのものの数です。
        </span>
      </div>
    </div>
  )
}
