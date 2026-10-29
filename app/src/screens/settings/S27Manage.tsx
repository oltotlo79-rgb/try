// S27 依頼書の管理・代理承認：依頼書の編集、止まっている承認の代理承認、承認依頼メールの再送・承認者の変更
import { useMemo, useState } from 'react'
import {
  ArrowLeft, Ban, Check, CircleDot, ExternalLink, FileClock, History, Mail, PenLine, Save, Search, ShieldCheck, Undo2, UserCog, X,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import type { ApprovalStep, WorkRequest } from '../../domain/types'
import { useApp } from '../../store'
import { Badge, Empty, EmployeePicker, Field, PageHead, Panel, StatusBadge } from '../../components/ui'
import { currentRoundSteps, pendingStep } from '../../domain/rules'
import { elapsedDays, fmtDate, fmtDateTime, fmtMD, fmtMDHM } from '../../domain/format'
import headImg from '../../assets/img/set_manage.webp'
import './settings-d.css'

const stallTone = (days: number) => (days >= 3 ? 'danger' : days >= 2 ? 'warn' : 'neutral')

function ResultCell({ s, now }: { s: ApprovalStep; now: number }) {
  switch (s.result) {
    case 'approved':
      return <Badge tone="ok" sm><Check size={11} strokeWidth={3} /> 承認</Badge>
    case 'proxy':
      return <Badge tone="violet" sm><ShieldCheck size={11} /> 代理承認（{s.proxy?.by.name.split(/[\s　]/)[0]}）</Badge>
    case 'pending': {
      const d = s.sentAt ? elapsedDays(s.sentAt, now) : 0
      return <Badge tone={stallTone(d) === 'neutral' ? 'warn' : stallTone(d)} dot sm>▶ 承認待ち（{d}日）</Badge>
    }
    case 'returned':
      return <Badge tone="warn" sm><Undo2 size={11} /> 差し戻し</Badge>
    case 'cancelled':
      return <Badge tone="muted" sm>取り消し</Badge>
    default:
      return <span className="tx-3 small">—（待機中）</span>
  }
}

export default function S27Manage({ route }: { route: RouteOf<'S27'> }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()
  const [q, setQ] = useState('')
  const [applied, setApplied] = useState('')

  const list = useMemo(() => {
    const all = db.requests.filter((r) => r.status !== 'draft' && r.number)
    const stall = (r: WorkRequest) => {
      const p = r.status === 'circulating' ? pendingStep(r) : undefined
      return p?.sentAt ? elapsedDays(p.sentAt, now) : -1
    }
    const filtered = applied ? all.filter((r) => r.number.includes(applied) || r.title.includes(applied)) : all
    return filtered.sort((a, b) => {
      const ca = a.status === 'circulating' ? 1 : 0
      const cb = b.status === 'circulating' ? 1 : 0
      if (ca !== cb) return cb - ca
      if (ca) return stall(b) - stall(a)
      return (b.requestDate ?? 0) - (a.requestDate ?? 0)
    })
    // now は描画のたびに変わるので依存に入れない
  }, [db.requests, applied]) // eslint-disable-line react-hooks/exhaustive-deps

  const defaultId = route.reqId ?? list.find((r) => r.status === 'circulating')?.id ?? list[0]?.id
  const [selId, setSelId] = useState<string | undefined>(defaultId)
  const req = db.requests.find((r) => r.id === selId)

  return (
    <div className="page wide">
      <div className="sd-head">
        <img className="sd-head-img" src={headImg} alt="" />
        <PageHead
          sid="S27"
          en="REQUEST ADMINISTRATION"
          title="依頼書の管理・代理承認"
          desc="承認者が休みなどで止まっている依頼を代理で承認して次へ進めます。承認依頼メールの再送・承認者の変更、依頼書の編集もここで行います。"
          actions={
            <button className="btn" onClick={() => go({ s: 'S21' })}>
              <ArrowLeft /> 設定メニューへ
            </button>
          }
        />
      </div>

      <div className="grid-main-side" style={{ gridTemplateColumns: '360px minmax(0,1fr)' }}>
        <Panel title="依頼書を検索" icon={<Search />} sub="回覧中（止まっている順）→ その他の依頼">
          <div className="row">
            <input
              className="input grow"
              placeholder="依頼番号・件名で検索"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setApplied(q.trim())}
            />
            <button className="btn btn-primary btn-icon" title="検索" onClick={() => setApplied(q.trim())}><Search /></button>
          </div>
          <div className="sd-list mt-16">
            {list.map((r) => {
              const p = r.status === 'circulating' ? pendingStep(r) : undefined
              const d = p?.sentAt ? elapsedDays(p.sentAt, now) : null
              return (
                <button key={r.id} className={`sd-item ${r.id === selId ? 'on' : ''}`} onClick={() => setSelId(r.id)}>
                  <div className="row between">
                    <span className="id-cell">{r.number}</span>
                    <StatusBadge req={r} />
                  </div>
                  <div className="sd-item-title">{r.title}</div>
                  {p ? (
                    <div className="sd-stall">
                      <CircleDot size={12} className="tx-warn" />
                      <span className="grow">{p.role} {p.approver.name}</span>
                      <Badge tone={stallTone(d ?? 0)} sm>{d}日経過</Badge>
                    </div>
                  ) : (
                    <div className="sd-item-meta">
                      <span>{r.requester.dept} {r.requester.name}</span>
                      <span className="grow" />
                      <span className="mono">納期 {fmtMD(r.dueDate)}</span>
                    </div>
                  )}
                </button>
              )
            })}
            {!list.length && <Empty title="該当する依頼書がありません" />}
          </div>
        </Panel>

        {req ? <Detail req={req} key={req.id} now={now} /> : (
          <Panel><Empty title="依頼書を選んでください" desc="左の一覧から編集・代理承認したい依頼書を選びます" /></Panel>
        )}
      </div>
    </div>
  )
}

function Detail({ req, now }: { req: WorkRequest; now: number }) {
  const go = useApp((s) => s.go)
  const store = useApp.getState
  const steps = currentRoundSteps(req)
  const pending = pendingStep(req)
  const canAct = req.status === 'circulating' && !!pending
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [edit, setEdit] = useState({ title: req.title, description: req.description, dueDate: req.dueDate })
  const editable = req.status !== 'cancelled' && req.status !== 'done'
  const dirty = edit.title !== req.title || edit.description !== req.description || edit.dueDate !== req.dueDate

  // 回覧者1〜3（空欄は「飛ばし」）＋回覧先の行
  type Row = { key: string; order: string; role: string; step?: ApprovalStep }
  const rows: Row[] = []
  if (steps.length) {
    for (let i = 1; i <= 3; i++) {
      const s = steps.find((x) => x.role === `回覧者${i}`)
      rows.push({ key: s?.id ?? `skip${i}`, order: s ? String(s.order) : '—', role: `回覧者${i}`, step: s })
    }
    steps.filter((s) => s.kind === 'target').forEach((s) => rows.push({ key: s.id, order: String(s.order), role: s.role, step: s }))
  }

  const resend = async () => {
    if (!pending) return
    const ok = await store().ask({
      title: '承認依頼メールを再送しますか？',
      body: `${pending.role} ${pending.approver.name} さんに、新しいURLで承認依頼メール（M02）を送り直します。\n古いURLは使えなくなります。`,
      okLabel: '再送する',
    })
    if (ok) store().resend(req.id)
  }

  const changeApprover = async (id: string, name: string) => {
    if (!pending) return
    setPicking(false)
    const ok = await store().ask({
      title: '承認者を変更して再送しますか？',
      body: `${pending.role}を「${pending.approver.name}」から「${name}」に変更し、新しいURLで承認依頼メールを送ります。\n古いURLは使えなくなります。`,
      okLabel: '変更して再送',
    })
    if (ok) store().resend(req.id, id)
  }

  const proxy = async () => {
    if (!pending) return
    if (!reason.trim()) {
      setReasonErr('代理承認の理由を入力してください')
      return
    }
    setReasonErr(null)
    const ok = await store().ask({
      title: '代理で承認して次へ進めますか？',
      body: `${pending.role} ${pending.approver.name} さんの代わりに承認します。\n理由：${reason.trim()}\n\n元のURLを開くと「管理者により代理承認されました」と表示し、本人と依頼者に知らせます（M10）。`,
      okLabel: '代理で承認する',
      tone: 'ok',
    })
    if (ok && store().proxyApprove(req.id, reason)) setReason('')
  }

  const cancel = async () => {
    const ok = await store().ask({
      title: '取り下げにしますか？',
      body: `${req.number}「${req.title}」を取り下げにします。\n削除はせず、記録は残ります。回覧中の承認用URLは使えなくなります。`,
      okLabel: '取り下げにする',
      tone: 'danger',
    })
    if (ok) store().adminCancel(req.id)
  }

  const saveEdit = () => {
    if (!edit.title.trim() || !edit.description.trim() || !edit.dueDate) {
      store().toast('danger', '件名・依頼内容・納期を入力してください')
      return
    }
    store().adminEditRequest(req.id, { title: edit.title.trim(), description: edit.description.trim(), dueDate: edit.dueDate })
  }

  const rounds = [...new Set(req.steps.map((s) => s.round))].sort((a, b) => b - a)

  return (
    <div className="col gap-20">
      <Panel glow>
        <div className="row top gap-16">
          <div className="grow">
            <div className="row gap-6">
              <span className="id-cell" style={{ fontSize: 14 }}>{req.number}</span>
              <StatusBadge req={req} long />
              {req.round > 1 && <Badge tone="muted" sm>回覧{req.round}回目</Badge>}
            </div>
            <h2 style={{ margin: '6px 0 4px', fontSize: 19, fontWeight: 600 }}>{req.title}</h2>
            <div className="small tx-2">
              {req.requester.dept} {req.requester.name}　・　依頼日 <span className="mono">{fmtDate(req.requestDate)}</span>　・　納期 <span className="mono">{fmtDate(req.dueDate)}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => go({ s: 'S15', reqId: req.id })}>
            <ExternalLink /> 依頼書詳細を開く
          </button>
        </div>
      </Panel>

      <Panel title={`回覧状況：${req.number} ${req.title}`} icon={<FileClock />} sub="誰で止まっているか、何日経過しているか" tight>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>順番</th>
                  <th>役割</th>
                  <th>氏名</th>
                  <th>結果</th>
                  <th>日時</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.step?.result === 'pending' ? (elapsedDays(r.step.sentAt ?? now, now) >= 3 ? 'overdue' : 'soon') : r.step ? '' : 'muted'}>
                    <td className="mono">{r.order}</td>
                    <td>{r.role}</td>
                    <td>
                      {r.step ? (
                        <>
                          <div>{r.step.approver.name}</div>
                          <div className="tiny tx-3">{r.step.approver.dept}</div>
                        </>
                      ) : <span className="tx-3">（空欄）</span>}
                    </td>
                    <td>{r.step ? <ResultCell s={r.step} now={now} /> : <span className="tx-3 small">－ 飛ばし</span>}</td>
                    <td className="mono small tx-2">
                      {r.step?.actedAt ? fmtMDHM(r.step.actedAt) : r.step?.result === 'pending' && r.step.sentAt ? `${fmtMDHM(r.step.sentAt)} 送信` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="まだ回覧していません" />
        )}
      </Panel>

      <Panel title="代理承認・再送" icon={<UserCog />} sub={canAct ? `承認待ち：${pending!.role} ${pending!.approver.name}（${pending!.sentAt ? elapsedDays(pending!.sentAt, now) : 0}日経過）` : undefined}>
        {canAct ? (
          <div className="col gap-20">
            <div className="row wrap">
              <button className="btn" onClick={resend}><Mail /> 承認依頼メールを再送</button>
              <button className="btn" onClick={() => setPicking(true)}><UserCog /> 承認者を変更して再送</button>
              <span className="hint">同じ人・別の人に新しいURLを送り直します（古いURLは使えなくなります）</span>
            </div>
            <hr className="divider" style={{ margin: 0 }} />
            <Field label="代理承認の理由" required error={reasonErr} hint="承認履歴に残ります。代理で差し戻すことはできません">
              <textarea
                className={`textarea ${reasonErr ? 'invalid' : ''}`}
                style={{ minHeight: 80 }}
                placeholder={`例）${pending!.approver.name.split(/[\s　]/)[0]}${pending!.approver.position}が休暇のため（${fmtMD(now + 4 * 86400000)}まで）`}
                value={reason}
                onChange={(e) => { setReason(e.target.value); if (e.target.value.trim()) setReasonErr(null) }}
              />
            </Field>
            <div className="row">
              <span className="grow small tx-3">承認待ちの人の代わりに承認し、次の承認者へ承認依頼メール（M02）を送ります。</span>
              <button className="btn btn-violet" onClick={proxy}><ShieldCheck /> 代理で承認して次へ進める</button>
            </div>
          </div>
        ) : (
          <div className="notice info">
            <CircleDot />
            <span>承認待ちの人はいません（状態：{req.status === 'circulating' ? '回覧中' : <StatusBadge req={req} long />}）。代理承認・再送は回覧中の依頼だけで行えます。</span>
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel
          title="依頼書の内容を編集"
          icon={<PenLine />}
          sub="設備側の項目は依頼書詳細（S15）で編集できます"
          foot={
            <>
              <button className="btn btn-danger" disabled={!editable} onClick={cancel}><Ban /> 取り下げにする</button>
              <span className="grow" />
              <button className="btn btn-ghost" disabled={!dirty} onClick={() => setEdit({ title: req.title, description: req.description, dueDate: req.dueDate })}>元に戻す</button>
              <button className="btn btn-primary" disabled={!dirty || req.status === 'cancelled'} onClick={saveEdit}><Save /> 保存</button>
            </>
          }
        >
          <div className="col gap-16">
            <Field label="件名" required>
              <input className="input" maxLength={100} value={edit.title} disabled={req.status === 'cancelled'} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </Field>
            <Field label="依頼内容" required>
              <textarea className="textarea" value={edit.description} disabled={req.status === 'cancelled'} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label="納期" required>
              <input type="date" className="input" style={{ width: 200 }} value={edit.dueDate} disabled={req.status === 'cancelled'} onChange={(e) => setEdit({ ...edit, dueDate: e.target.value })} />
            </Field>
          </div>
        </Panel>

        <Panel title="承認の記録" icon={<ShieldCheck />} sub="誰が・いつ・承認／差し戻し／代理承認したか">
          {rounds.length ? (
            <div className="sd-log">
              {rounds.map((round) => (
                <div key={round}>
                  <div className="sd-round">ROUND {round}・回覧{round}回目</div>
                  {req.steps
                    .filter((s) => s.round === round && s.result !== 'waiting')
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                      <div key={s.id} className="sd-log-item">
                        <span className={`sd-log-dot ${s.result === 'approved' ? 'ok' : s.result === 'proxy' ? 'violet' : s.result === 'returned' ? 'warn' : s.result === 'pending' ? 'cyan' : ''}`}>
                          {s.result === 'approved' ? <Check strokeWidth={3} /> : s.result === 'proxy' ? <ShieldCheck /> : s.result === 'returned' ? <Undo2 /> : s.result === 'pending' ? <CircleDot /> : <X />}
                        </span>
                        <div>
                          <div className="sd-log-head">
                            <b>{s.role}</b>
                            <span>{s.approver.name}</span>
                            <ResultCell s={s} now={now} />
                            <span className="grow" />
                            <span className="mono tiny tx-3">{s.actedAt ? fmtDateTime(s.actedAt) : s.sentAt ? `${fmtDateTime(s.sentAt)} 送信` : ''}</span>
                          </div>
                          {s.proxy && (
                            <div className="sd-log-body">代理承認：{s.proxy.by.name}（{s.proxy.by.dept}）／ 理由：{s.proxy.reason}</div>
                          )}
                          {s.comment && <div className="sd-log-body">コメント：{s.comment}</div>}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ) : (
            <span className="tx-3 small">承認の記録はありません</span>
          )}
        </Panel>
      </div>

      <Panel title="操作の記録" icon={<History />} sub="誰がいつ何をしたか" tight>
        {req.history.length ? (
          <div className="table-wrap" style={{ maxHeight: 320 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 170 }}>日時</th>
                  <th style={{ width: 200 }}>操作した人</th>
                  <th>操作内容</th>
                </tr>
              </thead>
              <tbody>
                {[...req.history].reverse().map((h, i) => (
                  <tr key={i}>
                    <td className="mono small tx-2">{fmtDateTime(h.at)}</td>
                    <td>{h.actor}</td>
                    <td>
                      {h.action}
                      {h.detail && <span className="tx-3 small">　{h.detail}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="操作の記録はありません" />
        )}
      </Panel>

      {picking && pending && (
        <EmployeePicker
          title={`${pending.role}の承認者を選ぶ`}
          exclude={[pending.approver.employeeId, req.requester.employeeId]}
          onClose={() => setPicking(false)}
          onPick={(e) => changeApprover(e.id, e.name)}
        />
      )}
    </div>
  )
}
