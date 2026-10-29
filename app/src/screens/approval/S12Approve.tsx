// S12 承認：メールのワンタイムURLから開く（ログイン不要）。内容と図面を確認し「承認」か「差し戻し」を選ぶ
import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, FileText, Mail, PenLine, ShieldAlert, Undo2 } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp } from '../../store'
import { checkToken } from '../../domain/workflow'
import { fmtDate, fmtDateTime } from '../../domain/format'
import { pendingStep } from '../../domain/rules'
import { ApprovalTrack, AttachmentList, Badge, CommentLog, Field, Panel } from '../../components/ui'
import { DrawingThumb } from '../../components/DrawingThumb'
import { UrlBar } from '../../components/Shell'
import { ResultView } from './S13Result'
import hero from '../../assets/img/approval_hero.webp'
import './approval.css'

export default function S12Approve({ route }: { route: RouteOf<'S12'> }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const [comment, setComment] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const chk = checkToken(db, route.token, Date.now())
  // 使用済み・期限切れ・引き戻し済みのURLは S13 のお知らせを表示する
  if (!chk.ok) return <ResultView route={{ s: 'S13', token: route.token }} reason={chk.reason} />
  const { req, step, token } = chk
  const latest = [...new Map(req.drawings.map((d) => [d.sheetNo, d])).values()]
    .map((d) => req.drawings.filter((x) => x.sheetNo === d.sheetNo).sort((a, b) => b.revision - a.revision)[0])
    .sort((a, b) => a.sheetNo - b.sheetNo)

  const approve = async () => {
    const ok = await useApp.getState().ask({ title: '承認しますか？', body: `${req.number}「${req.title}」を承認し、次の承認者へ承認依頼メールを送ります。`, okLabel: '承認する', tone: 'ok' })
    if (!ok) return
    if (useApp.getState().approve(route.token, comment)) {
      const after = useApp.getState().db.requests.find((r) => r.id === req.id)!
      const next = pendingStep(after)
      go({
        s: 'S13', token: route.token, done: 'approved',
        nextLabel: next
          ? `次の承認者（${next.role} ${next.approver.name}）へ承認依頼メールを送りました。`
          : 'すべての承認が完了しました。依頼者へ回覧完了のメールを、設備のリーダー・管理者へ新規依頼のお知らせを送りました。',
      })
    }
  }
  const sendBack = async () => {
    if (!comment.trim()) {
      setErr('差し戻す場合は理由を入力してください')
      return
    }
    const ok = await useApp.getState().ask({ title: '差し戻しますか？', body: `依頼者（${req.requester.name}）へ差し戻しのメールを送ります。\nコメントは日時・氏名付きで記録され、消えません。`, okLabel: '差し戻す', tone: 'warn' })
    if (!ok) return
    if (useApp.getState().returnRequest(route.token, comment)) {
      go({ s: 'S13', token: route.token, done: 'returned', nextLabel: `依頼者（${req.requester.dept} ${req.requester.name}）へ差し戻しのメールを送りました。` })
    }
  }

  return (
    <div className="approver-page">
      <ApproverBar token={route.token} />
      <div className="approver-scroll">
        <div className="page" style={{ maxWidth: 1180 }}>
          <section className="approve-hero">
            <img src={hero} alt="" />
            <div className="approve-hero-shade" />
            <div className="approve-hero-body">
              <div className="eyebrow"><span className="sid">S12</span>APPROVAL REQUEST</div>
              <h1>
                あなたは「<span className="tx-warn">{step.role}</span>」として承認を依頼されています。
              </h1>
              <div className="row small tx-2 mt-8 wrap">
                <span className="role-tag role-approver">承認者</span>
                {step.approver.dept} {step.approver.name} 様
                <span className="tx-3">・</span>
                <Clock size={13} /> 有効期限 {fmtDateTime(token.expiresAt)} まで
              </div>
            </div>
          </section>

          <Panel title="承認の進み具合" icon={<CheckCircle2 />} sub="✔ 承認済み ／ ▶ 承認待ち ／ － 空欄のため飛ばし" className="mt-16">
            <ApprovalTrack req={req} meStepId={step.id} />
          </Panel>

          <div className="grid-main-side mt-16">
            <div className="col gap-16">
              <Panel title="依頼の内容" icon={<FileText />} sub="依頼者が入力した内容（変更できません）">
                <dl className="kv">
                  <dt>依頼番号・件名</dt>
                  <dd><span className="id-cell">{req.number}</span>　<b>{req.title}</b></dd>
                  <dt>依頼部署・依頼者</dt>
                  <dd>{req.requester.dept}　{req.requester.name}</dd>
                  <dt>依頼日</dt>
                  <dd className="mono">{fmtDate(req.requestDate)}</dd>
                  <dt>納期</dt>
                  <dd className="mono">{fmtDate(req.dueDate)}</dd>
                  <dt>依頼内容</dt>
                  <dd style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{req.description}</dd>
                  <dt>補足資料</dt>
                  <dd><AttachmentList req={req} /></dd>
                </dl>
              </Panel>
              <Panel title="図面" icon={<PenLine />} sub="クリックすると製図ページで開きます（閲覧・印刷のみ）">
                {latest.length ? (
                  <div className="thumbs">
                    {latest.map((d) => (
                      <DrawingThumb key={d.id} json={d.json} caption={`${d.sheetNo}枚目 ${d.name}`} sub={`${d.drawingNo} 版${d.revision}`}
                        onClick={() => go({ s: 'S06', reqId: req.id, sheet: d.sheetNo, mode: 'view', back: { s: 'S12', token: route.token }, token: route.token })} />
                    ))}
                  </div>
                ) : (
                  <span className="tx-3 small">図面はありません</span>
                )}
              </Panel>
            </div>
            <div className="col gap-16 approve-side">
              <Panel title="これまでの差し戻し" icon={<Undo2 />}>
                <CommentLog comments={req.returnComments} />
              </Panel>
              <Panel title="承認・差し戻し" icon={<ShieldAlert />} glow>
                <Field label="コメント" hint="承認のときは任意、差し戻すときは理由を必ず書いてください" error={err}>
                  <textarea className={`textarea ${err ? 'invalid' : ''}`} rows={5} placeholder="差し戻す場合は理由を入力してください" value={comment}
                    onChange={(e) => { setComment(e.target.value); setErr(null) }} />
                </Field>
                <div className="row mt-16">
                  <button className="btn btn-warn btn-lg grow" onClick={sendBack}><Undo2 /> 差し戻す</button>
                  <button className="btn btn-ok btn-lg grow" onClick={approve}><CheckCircle2 /> 承認する</button>
                </div>
                <div className="notice warn mt-16">
                  <AlertTriangle />
                  <span>このURLはあなた専用・1回限りです。社内ネットワークからのみ開けます。メールと画面を転送しないでください。</span>
                </div>
              </Panel>
              <div className="row small tx-3 gap-6"><Badge tone="muted" sm>回覧 {req.round}回目</Badge>{req.round > 1 && '差し戻し後の再依頼です'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 承認者のブラウザ上部（ログイン不要であることと、デモ用の戻るボタン） */
export function ApproverBar({ token }: { token: string }) {
  const setView = useApp((s) => s.setView)
  return (
    <div className="approver-bar">
      <UrlBar route={{ s: 'S12', token }} />
      <Badge tone="violet" dot>ログイン不要・メールのURLから表示</Badge>
      <span className="grow" />
      <button className="btn btn-sm" onClick={() => setView('mailbox')}><Mail /> メールBOXに戻る（デモ）</button>
    </div>
  )
}
