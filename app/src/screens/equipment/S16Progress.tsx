// S16 作業進捗：各メンバーが担当している作業（依頼書＋依頼書以外の作業）と進み具合を確認する
import { useMemo, useState } from 'react'
import { AlertOctagon, Check, ChevronRight, Home, ListChecks, Timer, Wrench } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Employee, OtherWork, WorkRequest } from '../../domain/types'
import { useApp, useMe } from '../../store'
import { Avatar, Badge, Empty, Field, PageHead, Panel, ProgressBar, RoleTags, Seg, StatusBadge } from '../../components/ui'
import { deptName, dueTone, isEquipment, isLeaderPlus } from '../../domain/rules'
import { daysUntil, fmtMD } from '../../domain/format'
import './equipment.css'

type Scope = 'active' | 'all'

interface Row {
  key: string
  kind: 'req' | 'other'
  title: string
  slot?: string
  dept: string
  due: string | null
  progress: number
  req?: WorkRequest
  work?: OtherWork
  doneDate: string | null
}

export default function S16Progress({ route }: { route: RouteOf<'S16'> }) {
  void route
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const [member, setMember] = useState<string>('all')
  const [scope, setScope] = useState<Scope>('active')
  const now = Date.now()

  const members = useMemo(() => db.employees.filter((e) => isEquipment(e) && e.active), [db])

  const rowsOf = (e: Employee): Row[] => {
    const rows: Row[] = []
    for (const r of db.requests) {
      if (!r.assignees.includes(e.id)) continue
      if (scope === 'active' ? r.status !== 'inProgress' : !['inProgress', 'done'].includes(r.status)) continue
      const n = r.assignees.filter(Boolean).length
      rows.push({
        key: r.id, kind: 'req', title: r.title, slot: n >= 2 ? `担当${r.assignees.indexOf(e.id) + 1}／${n}人` : undefined,
        dept: r.requester.dept, due: r.dueDate, progress: r.progress, req: r, doneDate: r.deliveryDate,
      })
    }
    for (const w of db.otherWorks) {
      if (!w.assignees.includes(e.id)) continue
      if (scope === 'active' && w.completedDate) continue
      const n = w.assignees.filter(Boolean).length
      rows.push({
        key: w.id, kind: 'other', title: w.title, slot: n >= 2 ? `担当${w.assignees.indexOf(e.id) + 1}／${n}人` : undefined,
        dept: deptName(db, w.deptId), due: null, progress: w.progress, work: w, doneDate: w.completedDate,
      })
    }
    return rows.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'))
  }

  const shown = members.filter((m) => member === 'all' || m.id === member)
  const groups = shown.map((m) => ({ emp: m, rows: rowsOf(m) }))
  const activeReqs = db.requests.filter((r) => r.status === 'inProgress')
  const activeOther = db.otherWorks.filter((w) => !w.completedDate)
  const overdue = activeReqs.filter((r) => dueTone(r, now) === 'overdue').length

  return (
    <div className="page wide">
      <PageHead
        sid="S16"
        en="WORK PROGRESS"
        title="作業進捗"
        desc="メンバーごとに、担当している依頼書と依頼書以外の作業の進み具合を確認します。複数人で担当している作業は、それぞれの人の行に表示します。"
        actions={<button className="btn btn-ghost" onClick={() => go({ s: 'S04' })}><Home /> メニューへ</button>}
      />

      <div className="eq-stats" style={{ gridTemplateColumns: 'repeat(3, 1fr) 1.4fr' }}>
        <div className="stat">
          <div className="stat-label"><Timer className="tx-cyan" /> 対応中の依頼書</div>
          <div className="stat-value">{activeReqs.length}<small>件</small></div>
        </div>
        <div className="stat" style={{ ['--glow' as string]: 'rgba(155,140,255,.22)' }}>
          <div className="stat-label"><Wrench style={{ color: 'var(--violet)' }} /> 依頼書以外の作業（未完了）</div>
          <div className="stat-value">{activeOther.length}<small>件</small></div>
        </div>
        <div className="stat" style={{ ['--glow' as string]: 'rgba(255,107,107,.22)' }}>
          <div className="stat-label"><AlertOctagon className="tx-danger" /> 納期超過</div>
          <div className="stat-value" style={{ color: overdue ? 'var(--danger)' : undefined }}>{overdue}<small>件</small></div>
        </div>
        <Panel>
          <div className="row gap-16" style={{ alignItems: 'flex-end' }}>
            <Field label="メンバー" style={{ flex: 1 }}>
              <select className="select" value={member} onChange={(e) => setMember(e.target.value)}>
                <option value="all">すべて</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me.id ? '（自分）' : ''}</option>)}
              </select>
            </Field>
            <Field label="表示する範囲">
              <Seg value={scope} options={[['active', '対応中のみ'], ['all', '完了も含める']]} onChange={setScope} />
            </Field>
          </div>
        </Panel>
      </div>

      <div className="col gap-20 mt-24">
        {groups.map(({ emp, rows }) => {
          const reqCount = rows.filter((r) => r.kind === 'req').length
          const otherCount = rows.length - reqCount
          const avg = rows.length ? Math.round(rows.reduce((a, r) => a + r.progress, 0) / rows.length) : 0
          return (
            <section key={emp.id} className="panel eq-member">
              <div className="eq-member-head">
                <Avatar emp={emp} size="lg" />
                <div>
                  <b>{emp.name}</b>{emp.id === me.id && <span className="small tx-cyan">　（自分）</span>}
                  <div className="mt-4"><RoleTags emp={emp} /></div>
                </div>
                <div className="eq-mini-stats">
                  <div><b>{reqCount}</b><span>依頼書</span></div>
                  <div><b>{otherCount}</b><span>依頼書以外</span></div>
                  <div><b className="tx-cyan">{avg}%</b><span>平均進捗</span></div>
                </div>
              </div>
              {rows.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 110 }}>種類</th>
                        <th>件名・作業内容</th>
                        <th style={{ width: 130 }}>依頼部署</th>
                        <th style={{ width: 110 }}>納期</th>
                        <th style={{ width: 240 }}>進捗</th>
                        <th style={{ width: 250 }}>状態・完了日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) =>
                        r.kind === 'req' ? (
                          <ReqRow key={r.key} row={r} now={now} onOpen={() => go({ s: 'S15', reqId: r.req!.id })} />
                        ) : (
                          <OtherRow key={r.key} row={r} editable={r.work!.assignees.includes(me.id) || isLeaderPlus(me)} />
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="panel-body small tx-3 row gap-6"><ListChecks size={15} />{scope === 'active' ? '対応中の作業はありません' : '担当した作業はありません'}</div>
              )}
            </section>
          )
        })}
        {!groups.length && <Panel><Empty title="表示するメンバーがいません" /></Panel>}
      </div>
    </div>
  )
}

function ReqRow({ row, now, onOpen }: { row: Row; now: number; onOpen: () => void }) {
  const r = row.req!
  const tone = dueTone(r, now)
  const d = daysUntil(r.dueDate, now)
  return (
    <tr className={`click ${tone ?? ''}`} onClick={onOpen}>
      <td><span className="eq-kind req">依頼書</span></td>
      <td>
        <div className="eq-title">{row.title}{row.slot && <span className="tx-3 small">（{row.slot}）</span>}</div>
        <div className="mono tiny tx-cyan">{r.number}</div>
      </td>
      <td className="small">{row.dept}</td>
      <td className="nowrap">
        <span className="mono small">{fmtMD(r.dueDate)}</span>
        {tone === 'overdue' && <div className="tiny tx-danger">{-d}日超過</div>}
        {tone === 'soon' && <div className="tiny tx-warn">{d === 0 ? '本日' : `あと${d}日`}</div>}
      </td>
      <td><ProgressBar value={row.progress} /></td>
      <td>
        <span className="row gap-6">
          <StatusBadge req={r} />
          {r.deliveryDate && <span className="mono tiny tx-3">{fmtMD(r.deliveryDate)} 引き渡し</span>}
          <span className="grow" />
          <ChevronRight size={15} className="tx-3" />
        </span>
      </td>
    </tr>
  )
}

/** 依頼書以外の作業：担当者本人とリーダー以上は進捗と完了日をその場で更新できる */
function OtherRow({ row, editable }: { row: Row; editable: boolean }) {
  const w = row.work!
  const [progress, setProgress] = useState(w.progress)
  const [done, setDone] = useState(w.completedDate ?? '')
  const changed = progress !== w.progress || (done || null) !== w.completedDate
  const save = () => {
    const { id, requestDate, deptId, requesterName, assignees, ratios, title, contribution } = w
    useApp.getState().upsertOtherWork({
      id, requestDate, deptId, requesterName, assignees, ratios, title, contribution,
      progress: done ? 100 : progress,
      completedDate: done || null,
    })
  }
  return (
    <tr>
      <td><span className="eq-kind other">依頼書以外</span></td>
      <td>
        <div className="eq-title">{row.title}{row.slot && <span className="tx-3 small">（{row.slot}）</span>}</div>
        <div className="tiny tx-3">依頼者 {w.requesterName}</div>
      </td>
      <td className="small">{row.dept}</td>
      <td className="tx-3">—</td>
      <td>
        {editable ? (
          <div className="row gap-6">
            <select className="select eq-inline-input" style={{ width: 84 }} value={progress} onChange={(e) => setProgress(Number(e.target.value))}>
              {Array.from({ length: 11 }, (_, i) => i * 10).map((v) => <option key={v} value={v}>{v}%</option>)}
            </select>
            <div className="grow"><ProgressBar value={done ? 100 : progress} /></div>
          </div>
        ) : (
          <ProgressBar value={row.progress} />
        )}
      </td>
      <td>
        {editable ? (
          <div className="row gap-6">
            <input type="date" className="input eq-inline-input" style={{ width: 140 }} value={done} onChange={(e) => setDone(e.target.value)} title="完了日" />
            {changed ? (
              <button className="btn btn-sm btn-primary" onClick={save}><Check /> 保存</button>
            ) : w.completedDate ? (
              <Badge sm tone="muted">完了</Badge>
            ) : (
              <span className="tiny tx-3">完了日</span>
            )}
          </div>
        ) : w.completedDate ? (
          <span className="row gap-6"><Badge sm tone="muted">完了</Badge><span className="mono tiny tx-3">{fmtMD(w.completedDate)}</span></span>
        ) : (
          <Badge sm tone="info" dot>対応中</Badge>
        )}
      </td>
    </tr>
  )
}
