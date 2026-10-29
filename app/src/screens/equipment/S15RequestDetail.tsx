// S15 依頼書詳細・進捗更新：依頼書1件の詳細を確認し、担当者の割り当てや進捗の更新を行う
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowLeft, CalendarCheck2, ClipboardList, FileText, History, Info, Layers, Lock, PackageCheck, Save, ShieldCheck,
  Truck, UserPlus, Users, Wrench, Coins, Handshake, Calculator, X,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import type { ApprovalStep, Drawing, WorkRequest } from '../../domain/types'
import type { ProgressPatch } from '../../domain/workflow'
import { useApp, useMe, useRequest } from '../../store'
import {
  AttachmentList, Avatar, Badge, CommentLog, Empty, Field, PageHead, Panel, ProgressBar, StatusBadge,
} from '../../components/ui'
import { DrawingThumb } from '../../components/DrawingThumb'
import { MAX_ASSIGNEES, canEditField, dueTone, equalRatios, findEmployee, isEquipment, isLeaderPlus } from '../../domain/rules'
import { splitAmount } from '../../domain/stats'
import { daysUntil, fmtDate, fmtDateTime, fmtMDHM, fmtYen, toISODate } from '../../domain/format'
import { readBom } from '../../data/drawings'
import './equipment.css'

/** 担当者ごとの色（配分の帯） */
const TEAM_COLORS = ['#1ba3cb', '#7f6cf2', '#2fbf8f', '#e0a33a', '#e06c86']

function patchFromReq(r: WorkRequest): ProgressPatch {
  return {
    assignees: [...r.assignees],
    ratios: [...r.ratios],
    meetingDone: r.meetingDone,
    meetingDate: r.meetingDate,
    estimateDone: r.estimateDone,
    estimateDate: r.estimateDate,
    purchaseDone: r.purchaseDone,
    purchaseDate: r.purchaseDate,
    progress: r.progress,
    productionDate: r.productionDate,
    deliveryDate: r.deliveryDate,
    contribution: r.contribution,
  }
}

const RESULT_BADGE: Record<ApprovalStep['result'], [string, string]> = {
  waiting: ['待機中', 'muted'],
  pending: ['承認待ち', 'warn'],
  approved: ['承認', 'cyan'],
  returned: ['差し戻し', 'warn'],
  proxy: ['代理承認', 'violet'],
  cancelled: ['取り消し', 'muted'],
}

export default function S15RequestDetail({ route }: { route: RouteOf<'S15'> }) {
  const me = useMe()!
  const req = useRequest(route.reqId)
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const ask = useApp((s) => s.ask)
  const [form, setForm] = useState<ProgressPatch | null>(req ? patchFromReq(req) : null)

  useEffect(() => {
    if (req && !form) setForm(patchFromReq(req))
  }, [req, form])

  const members = useMemo(() => db.employees.filter((e) => isEquipment(e) && e.active), [db])
  // 図面：版ごとに保存されている。各図面（枚目）の最新版を表示
  const sheets = useMemoSheets(req?.drawings ?? NO_DRAWINGS)

  if (!req || !form) {
    return (
      <div className="page">
        <PageHead sid="S15" en="REQUEST DETAIL" title="依頼書詳細・進捗更新" />
        <Panel><Empty title="依頼書が見つかりません" action={<button className="btn" onClick={() => go({ s: 'S14' })}><ArrowLeft /> 一覧へ戻る</button>} /></Panel>
      </div>
    )
  }

  const now = Date.now()
  const base = patchFromReq(req)
  const dirty = JSON.stringify(form) !== JSON.stringify(base)
  const set = (p: Partial<ProgressPatch>) => setForm({ ...form, ...p })
  const can = (f: Parameters<typeof canEditField>[0]) => canEditField(f, me, req)
  const lockReason = (f: Parameters<typeof canEditField>[0]): string | null => {
    if (can(f)) return null
    if (['circulating', 'returned', 'pulledBack'].includes(req.status)) return '回覧完了後に入力できます'
    if (req.status === 'cancelled') return '取り下げられた依頼です'
    return f === 'assignees' || f === 'meeting' || f === 'contribution' ? 'リーダー以上が入力できます' : '担当者とリーダー以上が入力できます'
  }
  const ids = form.assignees.filter(Boolean)
  const multi = ids.length >= 2
  const ratioSum = form.ratios.reduce((a, b) => a + b, 0)
  /** 担当者を変えたら配分は均等に戻す */
  const setAssignees = (next: string[]) => set({ assignees: next, ratios: equalRatios(next.length) })
  const tone = dueTone(req, now)
  const d = daysUntil(req.dueDate, now)
  const newlyAssigned = ids.filter((id) => !req.assignees.includes(id))
  const delivering = !!form.deliveryDate && !req.deliveryDate

  const bom = sheets[0] ? readBom(sheets[0].latest.json) : []

  const confirmLeave = async (to: () => void) => {
    if (dirty) {
      const ok = await ask({
        title: '保存していない変更があります',
        body: '変更を保存せずに画面を移動しますか？',
        okLabel: '保存せずに移動',
        tone: 'warn',
      })
      if (!ok) return
    }
    to()
  }

  const save = async () => {
    if (delivering) {
      const ok = await ask({
        title: '引き渡し完了として保存しますか？',
        body: `引き渡し完了日（${fmtDate(form.deliveryDate)}）を保存すると状態が「完了」になり、依頼者へ完了メール（M11）を送ります。`,
        okLabel: '完了として保存',
        tone: 'ok',
      })
      if (!ok) return
    }
    const p: ProgressPatch = { ...form, ratios: multi ? form.ratios : ids.length ? [100] : [] }
    if (useApp.getState().saveProgress(req.id, p)) {
      const latest = useApp.getState().db.requests.find((r) => r.id === req.id)!
      setForm(patchFromReq(latest))
    }
  }

  const today = toISODate(now)
  const amount = form.contribution ?? 0
  const split = splitAmount(amount, ids, form.ratios)

  return (
    <div className="page wide">
      <PageHead
        sid="S15"
        en="REQUEST DETAIL / PROGRESS"
        title={req.title}
        desc={
          <span className="eq-detail-head">
            <span className="eq-number">{req.number}</span>
            <StatusBadge req={req} long />
            {tone === 'overdue' && <Badge tone="danger" dot>納期を{-d}日超過</Badge>}
            {tone === 'soon' && <Badge tone="warn" dot>{d === 0 ? '本日が納期' : `納期まであと${d}日`}</Badge>}
            <span className="small tx-3">依頼日 {fmtDate(req.requestDate)}</span>
          </span>
        }
        actions={
          <button className="btn btn-ghost" onClick={() => confirmLeave(() => go({ s: 'S14' }))}><ArrowLeft /> 一覧へ戻る</button>
        }
      />

      {req.status === 'circulated' && isLeaderPlus(me) && (
        <div className="notice info" style={{ marginBottom: 16 }}>
          <Info />
          <span>回覧が完了し、打ち合わせ待ちの依頼です。担当者（複数人可）を決めて保存すると状態が「対応中」になり、担当者へ任命メール（M07）を送ります。</span>
        </div>
      )}
      {['circulating', 'returned', 'pulledBack'].includes(req.status) && (
        <div className="notice warn" style={{ marginBottom: 16 }}>
          <Lock />
          <span>この依頼はまだ回覧が終わっていません。設備側の入力は、すべての承認が終わって「回覧完了」になってからできます。</span>
        </div>
      )}

      <div className="grid-main-side">
        <Panel title="依頼の内容" icon={<FileText />} sub="依頼者が入力した内容です（修正は管理者が「依頼書の管理」で行います）">
          <dl className="kv" style={{ gridTemplateColumns: '130px 1fr' }}>
            <dt>依頼番号・件名</dt>
            <dd><span className="id-cell">{req.number}</span>　{req.title}</dd>
            <dt>依頼部署・依頼者</dt>
            <dd className="row gap-6">
              <Avatar name={req.requester.name} size="sm" color="var(--role-requester)" />
              {req.requester.dept}　{req.requester.name}
              <span className="mono tiny tx-3">{req.requester.email}</span>
            </dd>
            <dt>納期／状態</dt>
            <dd className="row gap-6 wrap"><span className="mono">{fmtDate(req.dueDate)}</span><StatusBadge req={req} /></dd>
            <dt>依頼内容</dt>
            <dd style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{req.description}</dd>
            <dt>補足資料</dt>
            <dd><AttachmentList req={req} /></dd>
            {req.returnComments.length > 0 && (
              <>
                <dt>差し戻しコメント</dt>
                <dd><CommentLog comments={req.returnComments} /></dd>
              </>
            )}
          </dl>
        </Panel>

        <div className="col gap-20">
          <Panel title="図面" icon={<Layers />} sub="クリックすると製図ページで開きます（版2以降の保存も可）">
            {sheets.length ? (
              <div className="col gap-16">
                {sheets.map((s) => (
                  <div key={s.sheetNo}>
                    <DrawingThumb
                      json={s.latest.json}
                      caption={`${s.sheetNo}枚目 ${s.latest.name || '図面'}`}
                      sub={s.latest.drawingNo}
                      onClick={() => confirmLeave(() => go({ s: 'S06', reqId: req.id, sheet: s.sheetNo, mode: 'equipment', back: { s: 'S15', reqId: req.id } }))}
                    />
                    <div className="eq-sheet-meta">
                      <Badge sm tone={s.latest.revision > 1 ? 'violet' : 'cyan'}>
                        版{s.latest.revision}：{s.latest.revision > 1 ? '設備側の修正版' : '依頼者の原図'}
                      </Badge>
                      {s.revisions > 1 && <Badge sm tone="muted">全{s.revisions}版</Badge>}
                      {s.latest.material && <Badge sm tone="neutral">材質 {s.latest.material}</Badge>}
                      <span className="tiny tx-3" style={{ alignSelf: 'center' }}>{s.latest.savedBy}・{fmtMDHM(s.latest.savedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="tx-3 small">図面はありません</span>
            )}
          </Panel>

          <Panel title="部品表（図面から）" icon={<ClipboardList />} sub="見積り・買い入れの参考にしてください" tight>
            {bom.length ? (
              <table className="table">
                <thead>
                  <tr><th>品番</th><th>品名</th><th className="r">数量</th><th>材質</th></tr>
                </thead>
                <tbody>
                  {bom.map((b, i) => (
                    <tr key={i}>
                      <td className="mono">{b.no}</td>
                      <td>{b.name}</td>
                      <td className="r mono">{b.qty}</td>
                      <td className="small tx-2">{b.material}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="panel-body"><span className="tx-3 small">図面に部品表がありません</span></div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        className="mt-24"
        glow
        title="設備側の入力"
        icon={<Wrench />}
        sub="権限がない項目はグレー表示になり、変更できません"
        actions={dirty ? <span className="eq-dirty">未保存の変更があります</span> : <Badge tone="muted">保存済み</Badge>}
      >
        <div className="eq-form">
          <Step no={1} icon={<Users size={15} />} title={`担当者（${MAX_ASSIGNEES}人まで）`} lock={lockReason('assignees')} done={ids.length > 0}>
            <div className="eq-assignees">
              {ids.map((id, i) => {
                const e = findEmployee(db, id)
                return (
                  <span key={id} className="eq-assignee" style={{ ['--c' as string]: TEAM_COLORS[i % TEAM_COLORS.length] }}>
                    <span className="mono tiny tx-3">{i + 1}</span>
                    <Avatar emp={e} size="sm" />
                    <span>{e?.name}</span>
                    {can('assignees') && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="担当から外す" onClick={() => setAssignees(ids.filter((x) => x !== id))}>
                        <X />
                      </button>
                    )}
                  </span>
                )
              })}
              {!ids.length && <span className="small tx-3">未定</span>}
              {can('assignees') && ids.length < MAX_ASSIGNEES && (
                <select className="select eq-add-assignee" value="" onChange={(e) => e.target.value && setAssignees([...ids, e.target.value])}>
                  <option value="">＋ 担当者を追加</option>
                  {members.filter((m) => !ids.includes(m.id)).map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              )}
              <span className="tiny tx-3 mono" style={{ marginLeft: 'auto' }}>{ids.length} / {MAX_ASSIGNEES}人</span>
            </div>
            {newlyAssigned.length > 0 && (
              <div className="hint mt-8 row gap-6"><UserPlus size={13} />保存すると {newlyAssigned.map((id) => findEmployee(db, id)?.name).join('・')} さんへ任命メール（M07）を送ります</div>
            )}
          </Step>

          <Step no={2} icon={<Handshake size={15} />} title="打ち合わせ" lock={lockReason('meeting')} done={form.meetingDone}>
            <CheckDate
              label="実施済み"
              disabled={!can('meeting')}
              checked={form.meetingDone}
              date={form.meetingDate}
              onChange={(c, dt) => set({ meetingDone: c, meetingDate: dt })}
              today={today}
            />
          </Step>

          <Step no={3} icon={<Calculator size={15} />} title="見積り依頼" lock={lockReason('estimate')} done={form.estimateDone}>
            <CheckDate
              label="完了"
              disabled={!can('estimate')}
              checked={form.estimateDone}
              date={form.estimateDate}
              onChange={(c, dt) => set({ estimateDone: c, estimateDate: dt })}
              today={today}
            />
          </Step>

          <Step no={4} icon={<PackageCheck size={15} />} title="買い入れ完了" lock={lockReason('purchase')} done={form.purchaseDone}>
            <CheckDate
              label="完了"
              disabled={!can('purchase')}
              checked={form.purchaseDone}
              date={form.purchaseDate}
              onChange={(c, dt) => set({ purchaseDone: c, purchaseDate: dt })}
              today={today}
            />
          </Step>

          <Step no={5} icon={<Wrench size={15} />} title="製作進捗・製作完了日" lock={lockReason('progress')} done={form.progress >= 100 && !!form.productionDate}>
            <div className="row gap-16 top">
              <div className="grow">
                <div className="row between">
                  <span className="label">製作進捗（10％きざみ）</span>
                  <span className="mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--cyan)' }}>{form.progress}%</span>
                </div>
                <input
                  type="range"
                  className="eq-range"
                  min={0}
                  max={100}
                  step={10}
                  value={form.progress}
                  disabled={!can('progress')}
                  onChange={(e) => set({ progress: Number(e.target.value) })}
                />
                <div className="eq-ticks">{Array.from({ length: 11 }, (_, i) => <span key={i}>{i * 10}</span>)}</div>
              </div>
              <Field label="製作完了日" style={{ width: 170 }}>
                <input type="date" className="input" disabled={!can('production')} value={form.productionDate ?? ''}
                  onChange={(e) => set({ productionDate: e.target.value || null, progress: e.target.value ? 100 : form.progress })} />
              </Field>
            </div>
          </Step>

          <Step no={6} icon={<Truck size={15} />} title="引き渡し完了日" lock={lockReason('delivery')} done={!!form.deliveryDate}>
            <div className="row gap-16 top">
              <Field label="引き渡し完了日" style={{ width: 190 }}>
                <input type="date" className="input" disabled={!can('delivery')}
                  value={form.deliveryDate ?? ''} onChange={(e) => set({ deliveryDate: e.target.value || null })} />
              </Field>
              <div className="grow small tx-2" style={{ paddingTop: 26 }}>
                {req.status === 'done'
                  ? <span className="row gap-6"><CalendarCheck2 size={15} className="tx-ok" />{fmtDate(req.deliveryDate)} に引き渡しが完了しました</span>
                  : '入力して保存すると状態が「完了」になり、依頼者へ完了メール（M11）を送ります。'}
              </div>
            </div>
            {delivering && (
              <div className="notice warn mt-8"><Info /><span>保存すると「完了」になり、依頼者へ完了メール（M11）が届きます。</span></div>
            )}
          </Step>

          <div className="span-2">
            <Step no={7} icon={<Coins size={15} />} title="貢献額" lock={lockReason('contribution')} done={form.contribution !== null && form.contribution > 0}>
              <div className="row gap-24 top wrap">
                <Field label="貢献額（円）" hint="引き渡し完了後にリーダー以上が入力します。成果確認（S17）に反映されます" style={{ width: 260 }}>
                  <div className="row gap-6">
                    <input
                      className="input mono"
                      inputMode="numeric"
                      disabled={!can('contribution')}
                      value={form.contribution === null ? '' : form.contribution.toLocaleString('ja-JP')}
                      placeholder="0"
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        set({ contribution: v === '' ? null : Number(v) })
                      }}
                      style={{ textAlign: 'right' }}
                    />
                    <span className="tx-2">円</span>
                  </div>
                </Field>
                {multi ? (
                  <div className="grow" style={{ minWidth: 360 }}>
                    <div className="row between">
                      <span className="label">配分（担当者ごとの％・合計100％）</span>
                      <span className="row gap-6">
                        <span className={`mono small ${ratioSum === 100 ? 'tx-ok' : 'tx-danger'}`}>合計 {ratioSum}%</span>
                        <button className="btn btn-sm" disabled={!can('contribution')} onClick={() => set({ ratios: equalRatios(ids.length) })}>均等に分ける</button>
                      </span>
                    </div>
                    <div className="eq-split mt-8">
                      {ids.map((id, i) => (
                        <i key={id} style={{ width: `${Math.max(0, form.ratios[i] ?? 0)}%`, background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                      ))}
                    </div>
                    <div className="eq-split-rows mt-8">
                      {ids.map((id, i) => (
                        <div key={id} className="eq-split-row">
                          <i style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                          <Avatar emp={findEmployee(db, id)} size="sm" />
                          <span className="grow">{findEmployee(db, id)?.name}</span>
                          <input
                            className="input mono eq-inline-input"
                            style={{ width: 70, textAlign: 'right' }}
                            disabled={!can('contribution')}
                            value={form.ratios[i] ?? 0}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(100, Number(e.target.value.replace(/[^\d]/g, '')) || 0))
                              const next = [...form.ratios]
                              next[i] = v
                              set({ ratios: next })
                            }}
                          />
                          <span className="tx-2 small">％</span>
                          <span className="mono tx-2" style={{ width: 110, textAlign: 'right' }}>{fmtYen(split.find((x) => x.id === id)?.amount ?? 0)}円</span>
                        </div>
                      ))}
                    </div>
                    {ratioSum !== 100 && <div className="err-text mt-8">配分の合計が100％になるように入力してください</div>}
                  </div>
                ) : (
                  <div className="grow small tx-3" style={{ paddingTop: 26 }}>
                    {ids.length === 1 ? `担当者が1人のため、全額を ${findEmployee(db, ids[0])?.name} さんに計上します。` : '担当者が2人以上のときは、担当者ごとの配分（初期値は均等）を入力できます。'}
                  </div>
                )}
              </div>
            </Step>
          </div>
        </div>
      </Panel>

      <div className="grid-2 mt-24">
        <Panel title="承認履歴" icon={<ShieldCheck />} sub="誰が・いつ承認／差し戻し／代理承認したかの記録">
          <ApprovalHistory req={req} />
        </Panel>
        <Panel title="操作の記録" icon={<History />} sub="この依頼書に対して行われた操作">
          <div className="eq-history">
            {[...req.history].reverse().map((h, i) => (
              <div key={i} className="eq-history-row">
                <span className="mono tiny tx-3">{fmtMDHM(h.at)}</span>
                <span>
                  <b style={{ fontWeight: 500 }}>{h.action}</b>
                  {h.detail && <span className="small tx-2">　{h.detail}</span>}
                </span>
                <span className="small tx-3 nowrap">{h.actor}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {req.status === 'inProgress' && (
        <div className="mt-24 small tx-3 row gap-6"><Info size={14} />現在の製作進捗：<span style={{ width: 200 }}><ProgressBar value={req.progress} /></span></div>
      )}

      <div className="actionbar">
        {dirty ? <span className="eq-dirty">保存していない変更があります</span> : <span className="small tx-3">最終更新 {fmtDateTime(req.history[req.history.length - 1]?.at)}</span>}
        <span className="grow" />
        <button className="btn" onClick={() => confirmLeave(() => go({ s: 'S14' }))}><ArrowLeft /> 一覧へ戻る</button>
        <button className="btn btn-ghost" disabled={!dirty} onClick={() => setForm(base)}>変更を取り消す</button>
        <button className="btn btn-primary btn-lg" disabled={!dirty} onClick={save}><Save /> 保存</button>
      </div>
    </div>
  )
}

const NO_DRAWINGS: Drawing[] = []

function useMemoSheets(drawings: Drawing[]) {
  return useMemo(() => {
    const map = new Map<number, Drawing[]>()
    for (const d of drawings) map.set(d.sheetNo, [...(map.get(d.sheetNo) ?? []), d])
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([sheetNo, list]) => {
        const sorted = [...list].sort((a, b) => b.revision - a.revision)
        return { sheetNo, latest: sorted[0], revisions: sorted.length }
      })
  }, [drawings])
}

function Step({
  no, icon, title, lock, done, children,
}: { no: number; icon: ReactNode; title: string; lock: string | null; done?: boolean; children: ReactNode }) {
  return (
    <div className={`eq-step ${lock ? 'locked' : ''} ${done ? 'done' : ''}`}>
      <span className="eq-step-no">{no}</span>
      <div style={{ minWidth: 0 }}>
        <div className="eq-step-title">
          <span className="tx-cyan" style={{ display: 'inline-flex' }}>{icon}</span>
          {title}
          {lock && <span className="eq-lock"><Lock size={11} />{lock}</span>}
        </div>
        {children}
      </div>
    </div>
  )
}

function CheckDate({
  label, checked, date, disabled, onChange, today,
}: { label: string; checked: boolean; date: string | null; disabled: boolean; onChange: (c: boolean, d: string | null) => void; today: string }) {
  return (
    <div className="row gap-16">
      <label className="check">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked, e.target.checked ? date ?? today : null)} />
        {label}
      </label>
      <Field label="日付" style={{ width: 180 }}>
        <input type="date" className="input" disabled={disabled} value={date ?? ''} onChange={(e) => onChange(!!e.target.value, e.target.value || null)} />
      </Field>
      {!checked && <span className="small tx-3" style={{ paddingTop: 22 }}>未完了</span>}
    </div>
  )
}

function ApprovalHistory({ req }: { req: WorkRequest }) {
  const rounds = [...new Set(req.steps.map((s) => s.round))].sort((a, b) => a - b)
  if (!rounds.length) return <span className="tx-3 small">まだ回覧していません</span>
  return (
    <div className="eq-history">
      {rounds.map((round) => (
        <div key={round}>
          <div className="eq-round">回覧 {round}回目{round === req.round ? '（現在）' : ''}</div>
          {req.steps
            .filter((s) => s.round === round)
            .sort((a, b) => a.order - b.order)
            .map((s) => {
              const [label, tone] = RESULT_BADGE[s.result]
              return (
                <div key={s.id} className="eq-history-row">
                  <span className="small tx-2 nowrap">{s.role}</span>
                  <span>
                    {s.approver.name}<span className="tiny tx-3">（{s.approver.dept}）</span>
                    {s.proxy && <div className="tiny" style={{ color: 'var(--violet)' }}>代理：{s.proxy.by.name}　理由：{s.proxy.reason}</div>}
                    {s.comment && <div className="tiny tx-2">「{s.comment}」</div>}
                  </span>
                  <span className="col gap-4" style={{ alignItems: 'flex-end' }}>
                    <Badge sm tone={tone} dot>{label}</Badge>
                    <span className="mono tiny tx-3">{s.actedAt ? fmtMDHM(s.actedAt) : s.sentAt && s.result === 'pending' ? `${fmtMDHM(s.sentAt)} 送信` : ''}</span>
                  </span>
                </div>
              )
            })}
        </div>
      ))}
    </div>
  )
}
