// S14 依頼書一覧：すべての依頼書の一覧と進捗。月・状態・担当者・依頼部署・依頼者・キーワードで絞り込む
import { useMemo, useState } from 'react'
import {
  AlertOctagon, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Eraser, Filter, Home, LayoutList, Send, Timer, UserX,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import type { RequestStatus, WorkRequest } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { Avatar, Badge, Empty, Field, PageHead, Panel, ProgressBar, Seg, StatusBadge } from '../../components/ui'
import { STAGE_FLOW, STAGE_LABEL, dueTone, findEmployee, isEquipment, statusShort, workStage, type WorkStage } from '../../domain/rules'
import { daysUntil, fmtDate, fmtMD, toISODate } from '../../domain/format'
import { saveTextFile, toCsv } from '../../lib/files'
import './equipment.css'

type StatusKey = 'all' | 'circulating' | 'circulated' | 'inProgress' | 'done' | 'returned' | 'cancelled'
/** 状態、または「st:工程」（打ち合わせ待ち・買い入れ待ちなど） */
type StatusFilter = StatusKey | `st:${WorkStage}`
const STATUS_OPTIONS: [StatusKey, string][] = [
  ['all', 'すべて'],
  ['circulating', '回覧中'],
  ['circulated', '回覧完了（担当者待ち）'],
  ['inProgress', '対応中（すべて）'],
  ['done', '完了済み'],
  ['returned', '差し戻し・引き戻し'],
  ['cancelled', '取り下げ'],
]
const STATUS_MATCH: Record<StatusKey, RequestStatus[]> = {
  all: [],
  circulating: ['circulating'],
  circulated: ['circulated'],
  inProgress: ['inProgress'],
  done: ['done'],
  returned: ['returned', 'pulledBack'],
  cancelled: ['cancelled'],
}
const matchStatus = (r: WorkRequest, f: StatusFilter) =>
  f === 'all' ? true : f.startsWith('st:') ? workStage(r) === f.slice(3) : STATUS_MATCH[f as StatusKey].includes(r.status)

interface Filters {
  month: string // 'all' または YYYY-MM
  basis: 'request' | 'due'
  status: StatusFilter
  assignee: string // 'all' | 'none' | 社員ID
  dept: string // 'all' | 部署名
  requester: string
  keyword: string
}

const EMPTY: Filters = { month: 'all', basis: 'request', status: 'all', assignee: 'all', dept: 'all', requester: '', keyword: '' }

type SortKey = 'number' | 'requestDate' | 'dept' | 'title' | 'dueDate' | 'assignee' | 'status'
const PAGE = 50

export default function S14RequestList({ route }: { route: RouteOf<'S14'> }) {
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()

  const initial: Filters =
    route.preset === 'unassigned' ? { ...EMPTY, status: 'circulated', assignee: 'none' }
    : route.preset === 'mine' ? { ...EMPTY, assignee: me.id }
    : EMPTY
  const [draft, setDraft] = useState<Filters>(initial)
  const [applied, setApplied] = useState<Filters>(initial)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'requestDate', dir: -1 })
  const [page, setPage] = useState(0)

  const all = useMemo(() => db.requests.filter((r) => r.status !== 'draft' && r.number), [db])
  const members = useMemo(() => db.employees.filter((e) => isEquipment(e) && e.active), [db])
  const depts = useMemo(() => [...new Set(all.map((r) => r.requester.dept))].sort(), [all])
  const months = useMemo(() => {
    const set = new Set<string>()
    for (const r of all) {
      if (r.requestDate) set.add(toISODate(r.requestDate).slice(0, 7))
      set.add(r.dueDate.slice(0, 7))
    }
    return [...set].sort().reverse()
  }, [all])

  const assigneeNames = (r: WorkRequest) =>
    r.assignees.map((id) => findEmployee(db, id)?.name.split(/[\s　]/)[0]).filter(Boolean).join('・') || '未定'

  const filtered = useMemo(() => {
    const f = applied
    return all.filter((r) => {
      if (f.month !== 'all') {
        const m = f.basis === 'request' ? (r.requestDate ? toISODate(r.requestDate).slice(0, 7) : '') : r.dueDate.slice(0, 7)
        if (m !== f.month) return false
      }
      if (!matchStatus(r, f.status)) return false
      if (f.assignee === 'none' && r.assignees.some(Boolean)) return false
      if (f.assignee !== 'all' && f.assignee !== 'none' && !r.assignees.includes(f.assignee)) return false
      if (f.dept !== 'all' && r.requester.dept !== f.dept) return false
      if (f.requester.trim() && !r.requester.name.replace(/\s/g, '').includes(f.requester.replace(/\s/g, ''))) return false
      if (f.keyword.trim()) {
        const k = f.keyword.trim()
        if (!r.title.includes(k) && !r.description.includes(k)) return false
      }
      return true
    })
  }, [all, applied])

  const sorted = useMemo(() => {
    const val = (r: WorkRequest): string | number => {
      switch (sort.key) {
        case 'number': return r.number
        case 'requestDate': return r.requestDate ?? 0
        case 'dept': return r.requester.dept
        case 'title': return r.title
        case 'dueDate': return r.dueDate
        case 'assignee': return assigneeNames(r)
        case 'status': return statusShort(r)
      }
    }
    return [...filtered].sort((a, b) => {
      const x = val(a), y = val(b)
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, db])

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const rows = sorted.slice(cur * PAGE, cur * PAGE + PAGE)

  const stageCounts = Object.fromEntries(STAGE_FLOW.map((st) => [st, all.filter((r) => workStage(r) === st).length])) as Record<WorkStage, number>
  const counts = {
    circulating: all.filter((r) => r.status === 'circulating').length,
    unassigned: all.filter((r) => r.status === 'circulated').length,
    inProgress: all.filter((r) => r.status === 'inProgress').length,
    overdue: all.filter((r) => dueTone(r, now) === 'overdue').length,
  }

  const apply = (f: Filters) => {
    setDraft(f)
    setApplied(f)
    setPage(0)
  }
  const overdueOnly = applied === OVERDUE_MARK
  const visible = overdueOnly ? sorted.filter((r) => dueTone(r, now) === 'overdue') : rows

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'requestDate' || key === 'number' ? -1 : 1 }))

  const exportCsv = () => {
    const head = ['依頼番号', '依頼日', '依頼部署', '依頼者', '件名', '納期', '担当者1', '担当者2', '状態', '製作進捗(%)', '引き渡し完了日', '貢献額(円)']
    const body = sorted.map((r) => [
      r.number, fmtDate(r.requestDate), r.requester.dept, r.requester.name, r.title, fmtDate(r.dueDate),
      findEmployee(db, r.assignees[0])?.name ?? '', findEmployee(db, r.assignees[1])?.name ?? '',
      statusShort(r), r.progress, r.deliveryDate ? fmtDate(r.deliveryDate) : '', r.contribution ?? '',
    ])
    saveTextFile(`依頼書一覧_${toISODate(now).replace(/-/g, '')}.csv`, toCsv([head, ...body]), 'csv')
  }

  const SortTh = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <th className={`sortable ${className ?? ''}`} onClick={() => toggleSort(k)}>
      <span className="row gap-4" style={{ display: 'inline-flex' }}>
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  )

  return (
    <div className="page wide">
      <PageHead
        sid="S14"
        en="REQUEST LIST"
        title="依頼書一覧"
        desc="すべての依頼書の一覧と進捗です。行をクリックすると詳細・進捗更新の画面を開きます。"
        actions={
          <>
            <button className="btn" onClick={exportCsv}><Download /> CSV出力</button>
            <button className="btn btn-ghost" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>
          </>
        }
      />

      <div className="eq-stats">
        <button className="stat" onClick={() => apply({ ...EMPTY, status: 'circulating' })}>
          <div className="stat-label"><Send className="tx-2" /> 回覧中</div>
          <div className="stat-value">{counts.circulating}<small>件</small></div>
        </button>
        <button className="stat" style={{ ['--glow' as string]: 'rgba(90,169,255,.22)' }} onClick={() => apply({ ...EMPTY, status: 'circulated', assignee: 'none' })}>
          <div className="stat-label"><UserX style={{ color: 'var(--info)' }} /> 担当者未定（回覧完了）</div>
          <div className="stat-value" style={{ color: counts.unassigned ? 'var(--info)' : undefined }}>{counts.unassigned}<small>件</small></div>
        </button>
        <button className="stat" onClick={() => apply({ ...EMPTY, status: 'inProgress' })}>
          <div className="stat-label"><Timer className="tx-cyan" /> 対応中</div>
          <div className="stat-value">{counts.inProgress}<small>件</small></div>
        </button>
        <button className="stat" style={{ ['--glow' as string]: 'rgba(255,107,107,.22)' }} onClick={() => { setDraft(EMPTY); setApplied(OVERDUE_MARK); setPage(0) }}>
          <div className="stat-label"><AlertOctagon className="tx-danger" /> 納期超過</div>
          <div className="stat-value" style={{ color: counts.overdue ? 'var(--danger)' : undefined }}>{counts.overdue}<small>件</small></div>
        </button>
      </div>

      <div className="pipeline mt-16">
        <div className="pipeline-head">
          <b>工程ごとの件数</b>
          <span className="tiny tx-3">クリックで絞り込み・入力済みの打ち合わせ・見積り依頼・買い入れ・製作完了日から判定</span>
        </div>
        <div className="pipeline-row">
          {([['circulating', '回覧中', counts.circulating] as const, ...STAGE_FLOW.map((st) => [`st:${st}` as const, STAGE_LABEL[st], stageCounts[st]] as const)]).map(([key, label, n], i) => (
            <button key={key} className={`pipeline-step ${applied.status === key ? 'on' : ''} ${n ? '' : 'zero'}`} onClick={() => apply({ ...EMPTY, status: key })}>
              <span className="pipeline-no mono">{String(i + 1).padStart(2, '0')}</span>
              <span className="pipeline-label">{label}</span>
              <span className="pipeline-count mono">{n}<small>件</small></span>
            </button>
          ))}
        </div>
      </div>

      <Panel title="絞り込み条件" icon={<Filter />} className="mt-16">
        <div className="eq-filters">
          <Field label="期間（月）">
            <div className="row gap-6">
              <select className="select" value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })} style={{ flex: 1 }}>
                <option value="all">すべての期間</option>
                {months.map((m) => (
                  <option key={m} value={m}>{Number(m.slice(0, 4))}年{Number(m.slice(5))}月</option>
                ))}
              </select>
              <Seg value={draft.basis} options={[['request', '依頼日'], ['due', '納期']]} onChange={(v) => setDraft({ ...draft, basis: v })} />
            </div>
          </Field>
          <Field label="状態">
            <select className="select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as StatusFilter })}>
              <optgroup label="状態">
                {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </optgroup>
              <optgroup label="工程（回覧完了〜対応中）">
                {STAGE_FLOW.map((st) => <option key={st} value={`st:${st}`}>{STAGE_LABEL[st]}</option>)}
              </optgroup>
            </select>
          </Field>
          <Field label="担当者">
            <select className="select" value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })}>
              <option value="all">すべて</option>
              <option value="none">未定</option>
              {members.map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === me.id ? '（自分）' : ''}</option>)}
            </select>
          </Field>
          <Field label="依頼部署">
            <select className="select" value={draft.dept} onChange={(e) => setDraft({ ...draft, dept: e.target.value })}>
              <option value="all">すべて</option>
              {depts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="依頼者">
            <input className="input" placeholder="名前の一部でも検索できます" value={draft.requester}
              onChange={(e) => setDraft({ ...draft, requester: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply(draft)} />
          </Field>
          <Field label="キーワード">
            <input className="input" placeholder="件名・依頼内容から検索" value={draft.keyword}
              onChange={(e) => setDraft({ ...draft, keyword: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply(draft)} />
          </Field>
        </div>
        <div className="row end mt-16">
          <button className="btn btn-ghost" onClick={() => apply(EMPTY)}><Eraser /> 条件クリア</button>
          <button className="btn btn-primary" onClick={() => apply(draft)}><Filter /> 絞り込む</button>
        </div>
      </Panel>

      <Panel
        className="mt-16"
        title="依頼書の一覧"
        icon={<LayoutList />}
        sub={overdueOnly ? '納期超過の依頼書だけを表示しています' : '行をクリックで詳細へ。列名をクリックすると並び替えます。'}
        actions={
          <div className="row gap-16">
            <span className="eq-legend"><i className="lg-red" />納期超過</span>
            <span className="eq-legend"><i className="lg-yellow" />納期まで7日以内</span>
            <Badge tone="cyan">{overdueOnly ? counts.overdue : sorted.length}件</Badge>
          </div>
        }
        tight
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <SortTh k="number">依頼番号</SortTh>
                <SortTh k="requestDate">依頼日</SortTh>
                <SortTh k="dept">依頼部署</SortTh>
                <SortTh k="title">件名</SortTh>
                <SortTh k="dueDate">納期</SortTh>
                <SortTh k="assignee">担当者</SortTh>
                <SortTh k="status">状態・進捗</SortTh>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const tone = dueTone(r, now)
                const d = daysUntil(r.dueDate, now)
                const ids = r.assignees.filter((x): x is string => !!x)
                return (
                  <tr key={r.id} className={`click ${tone ?? ''} ${r.status === 'cancelled' ? 'muted' : ''}`} onClick={() => go({ s: 'S15', reqId: r.id })}>
                    <td className="id-cell">{r.number}</td>
                    <td className="mono small tx-2">{fmtMD(r.requestDate)}</td>
                    <td className="nowrap">{r.requester.dept}<div className="tiny tx-3">{r.requester.name}</div></td>
                    <td style={{ maxWidth: 340 }}>
                      <div className="eq-title">{r.title}</div>
                      {r.drawings.length > 0 && <div className="tiny tx-3">図面 {new Set(r.drawings.map((x) => x.sheetNo)).size}枚</div>}
                    </td>
                    <td className="nowrap">
                      <span className="mono small">{fmtMD(r.dueDate)}</span>
                      {tone === 'overdue' && <div className="tiny tx-danger">{-d}日超過</div>}
                      {tone === 'soon' && <div className="tiny tx-warn">{d === 0 ? '本日' : `あと${d}日`}</div>}
                    </td>
                    <td className="nowrap">
                      {ids.length ? (
                        <span className="row gap-6">
                          <span className="eq-avatars">
                            {ids.map((id) => <Avatar key={id} emp={findEmployee(db, id)} size="sm" />)}
                          </span>
                          <span className="small">{assigneeNames(r)}</span>
                        </span>
                      ) : (
                        <span className="tx-3 small">未定</span>
                      )}
                    </td>
                    <td style={{ minWidth: 190 }}>
                      {r.status === 'inProgress' ? (
                        <div className="col gap-4">
                          <StatusBadge req={r} />
                          <ProgressBar value={r.progress} />
                        </div>
                      ) : (
                        <StatusBadge req={r} />
                      )}
                    </td>
                  </tr>
                )
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty title="条件に合う依頼書がありません" desc="絞り込み条件を変えてみてください" action={<button className="btn" onClick={() => apply(EMPTY)}><Eraser /> 条件クリア</button>} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!overdueOnly && pages > 1 && (
          <div className="row end eq-pager">
            <span className="small tx-3">{cur * PAGE + 1}〜{Math.min(sorted.length, (cur + 1) * PAGE)}件 / 全{sorted.length}件</span>
            <button className="btn btn-sm btn-icon" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft /></button>
            <span className="mono small">{cur + 1} / {pages}</span>
            <button className="btn btn-sm btn-icon" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight /></button>
          </div>
        )}
        {!overdueOnly && pages === 1 && <div className="eq-pager small tx-3">並び順は依頼日の新しい順（列名で変更）・1ページ50件</div>}
      </Panel>
    </div>
  )
}

/** 「納期超過」タイルを押したときの印（他の条件とは別扱い） */
const OVERDUE_MARK: Filters = { ...EMPTY }
