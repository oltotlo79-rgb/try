// S07 回覧者の入力：自部署の回覧者（最大3人）を決めて依頼を送信する。S08（回覧者を選ぶ）を重ねて使う
import { useState } from 'react'
import { ArrowLeft, ChevronRight, ClipboardCheck, Route as RouteIcon, Send, UserPlus, UserRoundPen, Users, X } from 'lucide-react'
import type { RouteOf } from '../../router'
import type { Employee, WorkRequest } from '../../domain/types'
import { useApp, useRequest } from '../../store'
import { Avatar, Badge, Empty, EmployeePicker, PageHead, Panel } from '../../components/ui'
import { DrawingThumb } from '../../components/DrawingThumb'
import { deptName, findEmployee } from '../../domain/rules'
import { fmtDate } from '../../domain/format'
import { FlowSteps, latestSheets } from './S05RequestForm'
import './requester.css'

type Slots = WorkRequest['reviewers']
const HINTS = ['例：組長。最初に承認依頼メールが届きます', '例：工長。いない場合は空欄にすると飛ばします', '例：課長']

export default function S07Reviewers({ route }: { route: RouteOf<'S07'> }) {
  const req = useRequest(route.reqId)
  const go = useApp((s) => s.go)
  if (!req || !['draft', 'returned', 'pulledBack'].includes(req.status)) {
    return (
      <div className="page narrow">
        <PageHead sid="S07" en="REVIEWERS" title="回覧者の入力" />
        <Empty
          title="この依頼は送信できない状態です"
          action={<button className="btn" onClick={() => go(req ? { s: 'S11', reqId: req.id } : { s: 'S04' })}>戻る</button>}
        />
      </div>
    )
  }
  return <Reviewers req={req} key={req.id} />
}

function Reviewers({ req }: { req: WorkRequest }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const [slots, setSlots] = useState<Slots>(req.reviewers)
  const [picking, setPicking] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const requester = findEmployee(db, req.requester.employeeId)
  const sheets = latestSheets(req)
  const targets = db.targets
    .filter((t) => t.active)
    .sort((a, b) => a.order - b.order)
    .map((t) => findEmployee(db, t.employeeId))
    .filter((e): e is Employee => !!e && e.active)
  const chosen = slots.filter((x): x is string => !!x)
  const resubmit = req.status !== 'draft'

  const setSlot = (i: number, id: string | null) => {
    const next = [...slots] as Slots
    next[i] = id
    setSlots(next)
    setError(null)
  }

  const backToForm = () => {
    useApp.getState().saveDraft(req.id, { reviewers: slots })
    go({ s: 'S05', reqId: req.id })
  }

  const send = async () => {
    if (!chosen.length) {
      setError('回覧者を1人以上選んでください')
      return
    }
    const firstIdx = slots.findIndex((x) => !!x)
    const first = findEmployee(db, slots[firstIdx])
    const ok = await useApp.getState().ask({
      title: resubmit ? 'もう一度依頼しますか？' : '依頼を送信しますか？',
      body:
        (resubmit ? '最初の回覧者から回覧をやり直します。\n' : '依頼番号を発行します。\n') +
        `回覧者${firstIdx + 1}（${first?.name}）へ承認依頼メール、あなたへ受付メールを送ります。`,
      okLabel: '依頼する',
      tone: 'primary',
    })
    if (!ok) return
    setSending(true)
    const st = useApp.getState()
    st.saveDraft(req.id, { reviewers: slots })
    if (st.submit(req.id)) go({ s: 'S09', reqId: req.id })
    else setSending(false)
  }

  return (
    <div className="page">
      <PageHead
        sid="S07"
        en="REVIEWERS"
        title="回覧者の入力"
        desc="自部署の回覧者（最大3人）を決めて依頼を送信します。自分の部署に登録されている回覧者が自動で入っています。"
      />
      <FlowSteps step={2} />

      <div className="grid-main-side">
        <div className="col gap-20">
          <Panel
            title="自部署の回覧者"
            icon={<Users />}
            sub="この順番でメールが回ります。空欄は飛ばします。1人以上は必須です。"
            glow
          >
            <div className="slots">
              {slots.map((id, i) => {
                const e = findEmployee(db, id)
                return (
                  <div key={i} className={`slot ${e ? '' : 'empty'}`}>
                    <span className="slot-no">{i + 1}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="slot-role">回覧者{i + 1}</div>
                      {e ? (
                        <div className="slot-person mt-4">
                          <Avatar emp={e} color="var(--role-approver)" />
                          <div style={{ minWidth: 0 }}>
                            <b>{e.name}</b>
                            <small>{deptName(db, e.deptId)}　{e.position}　<span className="mono">{e.email}</span></small>
                          </div>
                        </div>
                      ) : (
                        <div className="slot-empty mt-4">（空欄＝飛ばす）<span className="tiny tx-4">{HINTS[i]}</span></div>
                      )}
                    </div>
                    <div className="row gap-6">
                      <button className="btn btn-sm" onClick={() => setPicking(i)}>
                        {e ? <><UserRoundPen /> 変更</> : <><UserPlus /> 選ぶ</>}
                      </button>
                      {e && (
                        <button className="btn btn-sm btn-ghost btn-icon" title="空欄にする（飛ばす）" onClick={() => setSlot(i, null)}>
                          <X />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {error && <div className="notice danger mt-12">{error}</div>}
            <div className="row mt-12">
              <button className="btn btn-sm btn-ghost" onClick={() => setPicking(slots.findIndex((x) => !x) >= 0 ? slots.findIndex((x) => !x) : 0)}>
                <Users /> 回覧者を選ぶ（社員データから絞り込む）
              </button>
              <span className="grow" />
              <span className="tiny tx-3">回覧者は社員データから選ぶので、メールアドレスを手で入力することはありません。自分自身や、同じ人を2回は選べません。</span>
            </div>
          </Panel>

          <Panel title="その後の回覧先（毎回固定）" icon={<RouteIcon />} sub="回覧者の後に、設定された順番で回ります">
            <div className="route-map">
              <span className="route-node me"><span className="k">依頼者</span>{req.requester.name}</span>
              {slots.map((id, i) => {
                const e = findEmployee(db, id)
                return (
                  <span key={`r${i}`} className="row" style={{ gap: 0 }}>
                    <span className="route-arrow"><ChevronRight /></span>
                    <span className={`route-node ${e ? 'rev' : 'skip'}`}>
                      <span className="k">回覧者{i + 1}</span>
                      {e ? e.name.split(' ')[0] : '飛ばし'}
                    </span>
                  </span>
                )
              })}
              {targets.map((e, i) => (
                <span key={e.id} className="row" style={{ gap: 0 }}>
                  <span className="route-arrow"><ChevronRight /></span>
                  <span className="route-node tgt">
                    <span className="k">回覧先{i + 1}</span>
                    {deptName(db, e.deptId)} {e.name.split(' ')[0]}
                  </span>
                </span>
              ))}
              <span className="route-arrow"><ChevronRight /></span>
              <span className="route-node end">回覧完了</span>
            </div>
            <p className="hint mt-12" style={{ marginBottom: 0 }}>
              回覧先は管理者が設定します。依頼を送った時点の回覧者・回覧先で回り、途中で設定が変わっても影響しません。
            </p>
          </Panel>
        </div>

        <Panel title="入力内容の確認" icon={<ClipboardCheck />}>
          {req.number && <Badge tone="cyan">{req.number}</Badge>}
          <div style={{ fontSize: 16, fontWeight: 600, margin: '10px 0 4px', lineHeight: 1.5 }}>{req.title}</div>
          <dl className="kv mt-8" style={{ gridTemplateColumns: '84px 1fr' }}>
            <dt>依頼者</dt>
            <dd>{req.requester.dept}　{req.requester.name}</dd>
            <dt>納期</dt>
            <dd className="mono">{fmtDate(req.dueDate)}</dd>
            <dt>図面</dt>
            <dd>{sheets.length ? `${sheets.length}枚` : 'なし'}</dd>
            <dt>補足資料</dt>
            <dd>{req.attachments.length ? `${req.attachments.length}件` : 'なし'}</dd>
          </dl>
          {sheets[0] && (
            <div className="mt-12">
              <DrawingThumb json={sheets[0].json} caption={sheets[0].name} sub={`${sheets.length}枚`} onClick={() => {
                useApp.getState().saveDraft(req.id, { reviewers: slots })
                go({ s: 'S06', reqId: req.id, sheet: sheets[0].sheetNo, mode: 'edit', back: { s: 'S07', reqId: req.id } })
              }} />
            </div>
          )}
          <div className="tiny tx-3 mt-12" style={{ whiteSpace: 'pre-wrap', maxHeight: 96, overflow: 'hidden' }}>{req.description}</div>
          {resubmit && (
            <div className="notice warn mt-16">
              再依頼すると、最初の回覧者から回覧をやり直します。
            </div>
          )}
        </Panel>
      </div>

      <div className="actionbar">
        <button className="btn btn-lg" onClick={backToForm}>
          <ArrowLeft /> 戻る（依頼書を修正）
        </button>
        <span className="grow small tx-3">「依頼する」を押すと、確認メッセージの後に送信します。</span>
        <button className="btn btn-lg btn-primary" onClick={send} disabled={sending}>
          <Send /> 依頼する
        </button>
      </div>

      {picking !== null && requester && (
        <EmployeePicker
          initialDeptId={requester.deptId}
          exclude={[requester.id, ...chosen.filter((id) => id !== slots[picking])]}
          onClose={() => setPicking(null)}
          onPick={(e) => {
            setSlot(picking, e.id)
            setPicking(null)
          }}
        />
      )}
    </div>
  )
}
