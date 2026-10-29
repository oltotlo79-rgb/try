// S10 自分の依頼一覧：自分が出した依頼の一覧と進み具合を確認する
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronRight, FilePlus2, Home, Hourglass, Wrench } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { RequestStatus, WorkRequest } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { Empty, PageHead, Panel, ProgressBar, StatusBadge } from '../../components/ui'
import { currentRoundSteps, dueTone } from '../../domain/rules'
import { fmtDate } from '../../domain/format'
import './requester.css'

type Filter = 'all' | RequestStatus | 'attention' | 'working'

const GROUPS: Partial<Record<Filter, RequestStatus[]>> = {
  attention: ['returned', 'pulledBack'],
  working: ['circulated', 'inProgress'],
}

const FILTERS: [Filter, string][] = [
  ['all', 'すべて'],
  ['circulating', '回覧中'],
  ['returned', '差し戻し中'],
  ['pulledBack', '引き戻し中'],
  ['circulated', '回覧完了'],
  ['inProgress', '対応中'],
  ['done', '完了'],
  ['cancelled', '取り下げ'],
]

const isFilter = (v: string | undefined): v is Filter => !!v && (FILTERS.some(([k]) => k === v) || v in GROUPS)

function Progress({ req }: { req: WorkRequest }) {
  if (req.status === 'inProgress' || req.status === 'done') return <ProgressBar value={req.status === 'done' ? 100 : req.progress} />
  const steps = currentRoundSteps(req)
  if (!steps.length) return <span className="tx-4">—</span>
  const ok = steps.filter((s) => s.result === 'approved' || s.result === 'proxy').length
  return (
    <span className="row gap-6">
      <span className="mini-steps">
        {steps.map((s) => (
          <i
            key={s.id}
            className={
              s.result === 'approved' || s.result === 'proxy' ? 'ok' : s.result === 'pending' ? 'now' : s.result === 'returned' ? 'ng' : ''
            }
          />
        ))}
      </span>
      <span className="mono tiny tx-3">
        承認 {ok}/{steps.length}
      </span>
    </span>
  )
}

export default function S10MyRequests({ route }: { route: RouteOf<'S10'> }) {
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const [filter, setFilter] = useState<Filter>(isFilter(route.filter) ? route.filter : 'all')
  const now = Date.now()

  const mine = useMemo(
    () =>
      db.requests
        .filter((r) => r.requester.employeeId === me.id && r.number)
        .sort((a, b) => (b.requestDate ?? 0) - (a.requestDate ?? 0)),
    [db, me.id],
  )
  const list = filter === 'all' ? mine : mine.filter((r) => (GROUPS[filter] ?? [filter]).includes(r.status))
  const count = (pred: (r: WorkRequest) => boolean) => mine.filter(pred).length

  const stats: { key: Filter; label: string; value: number; icon: typeof Hourglass; glow: string; color: string }[] = [
    { key: 'circulating', label: '回覧中', value: count((r) => r.status === 'circulating'), icon: Hourglass, glow: 'rgba(255,255,255,.12)', color: 'var(--tx-1)' },
    { key: 'attention', label: '差し戻し・引き戻し', value: count((r) => r.status === 'returned' || r.status === 'pulledBack'), icon: AlertTriangle, glow: 'rgba(255,181,71,.25)', color: 'var(--warn)' },
    { key: 'working', label: '回覧完了・対応中', value: count((r) => r.status === 'circulated' || r.status === 'inProgress'), icon: Wrench, glow: 'rgba(90,169,255,.25)', color: 'var(--info)' },
    { key: 'done', label: '完了', value: count((r) => r.status === 'done'), icon: CheckCircle2, glow: 'rgba(52,224,161,.2)', color: 'var(--ok)' },
  ]

  return (
    <div className="page">
      <PageHead
        sid="S10"
        en="MY REQUESTS"
        title="自分の依頼一覧"
        desc="自分が出した依頼の一覧と進み具合を確認できます。行をクリックすると詳細を開きます。"
        actions={
          <>
            <button className="btn" onClick={() => go({ s: 'S04' })}>
              <Home /> メニューへ
            </button>
            <button className="btn btn-primary" onClick={() => useApp.getState().newDraft()}>
              <FilePlus2 /> 新しく依頼する
            </button>
          </>
        }
      />

      <div className="stat-row">
        {stats.map((s) => (
          <button
            key={s.key}
            className={`stat ${filter === s.key ? 'on' : ''}`}
            style={{ ['--glow' as string]: s.glow }}
            onClick={() => setFilter(filter === s.key ? 'all' : s.key)}
          >
            <div className="stat-label">
              <s.icon style={{ color: s.color }} />
              {s.label}
            </div>
            <div className="stat-value" style={{ color: s.value ? s.color : 'var(--tx-3)' }}>
              {s.value}
              <small>件</small>
            </div>
          </button>
        ))}
      </div>

      <Panel
        tight
        title="自分の依頼"
        sub={`${list.length}件を表示`}
        actions={
          <div className="seg">
            {FILTERS.map(([k, label]) => (
              <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
        }
      >
        {list.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>依頼番号</th>
                  <th>依頼日</th>
                  <th>件名</th>
                  <th>納期</th>
                  <th>状態</th>
                  <th style={{ width: 200 }}>進み具合</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const tone = dueTone(r, now)
                  const warn = r.status === 'returned' || r.status === 'pulledBack'
                  return (
                    <tr key={r.id} className={`click ${warn ? 'warnrow' : ''} ${r.status === 'cancelled' ? 'muted' : ''}`} onClick={() => go({ s: 'S11', reqId: r.id })}>
                      <td className="id-cell">{r.number}</td>
                      <td className="mono small tx-2">{fmtDate(r.requestDate)}</td>
                      <td style={{ fontWeight: 500 }}>{r.title}</td>
                      <td className={`mono small ${tone === 'overdue' ? 'tx-danger' : tone === 'soon' ? 'tx-warn' : 'tx-2'}`}>
                        {fmtDate(r.dueDate)}
                      </td>
                      <td>
                        <StatusBadge req={r} />
                      </td>
                      <td>
                        <Progress req={r} />
                      </td>
                      <td className="r tx-3">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={mine.length ? '条件に合う依頼はありません' : 'まだ依頼はありません'}
            desc={mine.length ? '状態の絞り込みを「すべて」に戻してください。' : '「新しく依頼する」から最初の依頼を作成できます。'}
            action={
              mine.length ? (
                <button className="btn" onClick={() => setFilter('all')}>すべて表示</button>
              ) : (
                <button className="btn btn-primary" onClick={() => useApp.getState().newDraft()}>
                  <FilePlus2 /> 新しく依頼する
                </button>
              )
            }
          />
        )}
      </Panel>
      <p className="hint mt-12">
        表示するのは、ログインした本人が依頼者の依頼だけです。差し戻し中・引き戻し中の依頼はオレンジで表示します。
      </p>
    </div>
  )
}
