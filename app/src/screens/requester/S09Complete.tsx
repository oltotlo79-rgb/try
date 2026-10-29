// S09 依頼受付完了：依頼を受け付けたことを確認する
import { CheckCircle2, ClipboardList, Home, Mail, Send } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp, useRequest } from '../../store'
import { ApprovalTrack, Empty, PageHead, Panel } from '../../components/ui'
import { pendingStep } from '../../domain/rules'
import { fmtDate } from '../../domain/format'
import { FlowSteps } from './S05RequestForm'
import doneImg from '../../assets/img/done_sent.webp'
import './requester.css'

export default function S09Complete({ route }: { route: RouteOf<'S09'> }) {
  const req = useRequest(route.reqId)
  const go = useApp((s) => s.go)
  const setView = useApp((s) => s.setView)
  if (!req || !req.number) {
    return (
      <div className="page narrow">
        <PageHead sid="S09" en="ACCEPTED" title="依頼受付完了" />
        <Empty title="依頼が見つかりません" action={<button className="btn" onClick={() => go({ s: 'S04' })}>メニューへ</button>} />
      </div>
    )
  }
  const first = pendingStep(req)
  return (
    <div className="done-wrap">
      <div className="eyebrow">
        <span className="sid">S09</span>REQUEST ACCEPTED
      </div>
      <FlowSteps step={3} />
      <div className="done-hero">
        <img src={doneImg} alt="" className="fade-img" />
        <div>
          <span className="done-check">
            <CheckCircle2 /> 送信しました
          </span>
          <h1 className="done-title">依頼を受け付けました</h1>
          <div className="done-number">
            <small>依頼番号（問い合わせのときに使います）</small>
            <b>{req.number}</b>
          </div>
          <div className="col gap-6 mt-12" style={{ fontSize: 14 }}>
            {first && (
              <div className="row gap-6">
                <Send size={15} className="tx-cyan" />
                <span>
                  {first.role}（{first.approver.name}）へ承認依頼メールを送りました。
                </span>
              </div>
            )}
            <div className="row gap-6 tx-2">
              <ClipboardList size={15} />
              進み具合は、メニューの「自分の依頼」でいつでも確認できます。
            </div>
            <div className="sample-note mt-4">※ サンプルのため、メールは実際には送信されていません（メールBOXで確認できます）。</div>
          </div>
          <div className="row mt-24">
            <button className="btn btn-lg btn-primary" onClick={() => go({ s: 'S10' })}>
              <ClipboardList /> 自分の依頼へ
            </button>
            <button className="btn btn-lg" onClick={() => go({ s: 'S04' })}>
              <Home /> メニューへ
            </button>
            <button className="btn btn-lg btn-ghost" onClick={() => setView('mailbox')}>
              <Mail /> メールBOXで確認
            </button>
          </div>
        </div>
      </div>

      <Panel
        title="承認の進み具合"
        sub={`${req.title}　／　納期 ${fmtDate(req.dueDate)}`}
        className="mt-24"
      >
        <ApprovalTrack req={req} />
      </Panel>
    </div>
  )
}
