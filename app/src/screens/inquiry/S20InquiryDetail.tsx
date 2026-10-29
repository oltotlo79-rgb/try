// S20 問い合わせの詳細・回答：質問と、回答・追加の質問のやり取り。IT担当者はここで回答する
import { useState } from 'react'
import { ArrowLeft, CheckCircle2, FileText, Lock, Paperclip, Send } from 'lucide-react'
import type { RouteOf } from '../../router'
import { useApp, useMe } from '../../store'
import { canViewInquiry } from '../../domain/inquiries'
import { deptName, findEmployee, isIT } from '../../domain/rules'
import { fmtDateTime } from '../../domain/format'
import { Avatar, Empty, PageHead, Panel } from '../../components/ui'
import { CategoryChip, InquiryStatusBadge } from './S18InquiryList'
import './inquiry.css'

export default function S20InquiryDetail({ route }: { route: RouteOf<'S20'> }) {
  const me = useMe()!
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const ask = useApp((s) => s.ask)
  const postInquiry = useApp((s) => s.postInquiry)
  const resolveInquiry = useApp((s) => s.resolveInquiry)
  const [reply, setReply] = useState('')
  const q = db.inquiries.find((x) => x.id === route.inqId)

  if (!q || !canViewInquiry(q, me)) {
    return (
      <div className="page narrow">
        <PageHead sid="S20" en="INQUIRY" title="問い合わせの詳細・回答" />
        <Panel>
          <Empty title="この問い合わせは表示できません" desc="「IT担当者だけ」の問い合わせは、質問者本人とIT担当者だけが見られます。"
            action={<button className="btn" onClick={() => go({ s: 'S18' })}><ArrowLeft /> 一覧へ戻る</button>} />
        </Panel>
      </div>
    )
  }

  const asker = findEmployee(db, q.userId)
  const isAsker = q.userId === me.id
  const canPost = isAsker || isIT(me)
  const replyLabel = isAsker ? '追加の質問' : '回答'
  const related = q.requestId ? db.requests.find((r) => r.id === q.requestId) : undefined

  const send = () => {
    if (!reply.trim()) {
      useApp.getState().toast('warn', `${replyLabel}を入力してください`)
      return
    }
    if (postInquiry(q.id, reply)) setReply('')
  }

  const resolve = async () => {
    const ok = await ask({ title: '解決にしますか？', body: 'やり取りを終えて、状態を「解決」にします。', okLabel: '解決にする', tone: 'ok' })
    if (ok) resolveInquiry(q.id)
  }

  return (
    <div className="page">
      <PageHead
        sid="S20"
        en="INQUIRY DETAIL"
        title={
          <span className="row gap-16">
            <span className="mono tx-cyan" style={{ fontSize: 20 }}>{q.number}</span>
            <InquiryStatusBadge status={q.status} />
          </span>
        }
        desc="問い合わせの内容と、回答・追加の質問のやり取りを時間の順に表示します。"
        actions={<button className="btn" onClick={() => go({ s: 'S18' })}><ArrowLeft /> 一覧へ戻る</button>}
      />

      <div className="grid-main-side">
        <div className="col gap-20">
          <Panel>
            <div className="row gap-6">
              <CategoryChip category={q.category} />
              {q.visibility === 'it' && <span className="inq-lock"><Lock /> IT担当者だけ</span>}
            </div>
            <h2 style={{ margin: '10px 0 16px', fontSize: 19, fontWeight: 600 }}>{q.title}</h2>
            <div className="thread">
              <div className="msg origin">
                <Avatar emp={asker} />
                <div className="msg-bubble">
                  <div className="msg-head">
                    <b>{asker?.name ?? '—'}</b>
                    <span className="msg-kind">質問</span>
                    <span>{asker ? deptName(db, asker.deptId) : ''}</span>
                    <span className="grow" />
                    <span className="mono tiny tx-3">{fmtDateTime(q.createdAt)}</span>
                  </div>
                  <div className="msg-body">{q.body}</div>
                  {q.attachmentName && (
                    <div className="row gap-6 mt-12 small tx-2"><Paperclip size={14} /> {q.attachmentName}</div>
                  )}
                </div>
              </div>
              {q.messages.map((m) => {
                const who = findEmployee(db, m.userId)
                return (
                  <div key={m.id} className={`msg ${m.kind}`}>
                    <Avatar emp={who} />
                    <div className="msg-bubble">
                      <div className="msg-head">
                        <b>{who?.name ?? '—'}</b>
                        <span className="msg-kind">{m.kind === 'answer' ? 'IT担当 回答' : '質問者 追加の質問'}</span>
                        <span className="grow" />
                        <span className="mono tiny tx-3">{fmtDateTime(m.at)}</span>
                      </div>
                      <div className="msg-body">{m.body}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          {canPost && q.status !== 'resolved' && (
            <Panel title={isAsker ? '追加の質問を書く' : '回答を書く'} sub={isAsker ? '送るとIT担当者全員にメール（M15）で知らせます。' : '送ると質問者にメール（M14）で知らせ、状態が「回答済み」になります。'}>
              <div className="reply-box">
                <textarea
                  className="textarea"
                  placeholder={isAsker ? '追加で聞きたいことを入力してください' : '回答を入力してください'}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <div className="row end">
                  <span className="tiny tx-3 grow">あなたが書くと「{replyLabel}」になります</span>
                  <button className="btn btn-primary" onClick={send}><Send /> 送信する</button>
                </div>
              </div>
            </Panel>
          )}
          {q.status === 'resolved' && (
            <div className="notice info"><CheckCircle2 />この問い合わせは解決済みです。やり取りは終了しています。</div>
          )}
        </div>

        <div className="col gap-20">
          <Panel title="状況">
            <div className="status-steps">
              <span className={q.status === 'open' ? 'on' : ''}>未回答</span>
              <i />
              <span className={q.status === 'answered' ? 'on' : ''}>回答済み</span>
              <i />
              <span className={q.status === 'resolved' ? 'on' : ''}>解決</span>
            </div>
            <dl className="kv mt-16">
              <dt>番号</dt>
              <dd className="mono">{q.number}</dd>
              <dt>分類</dt>
              <dd>{q.category}</dd>
              <dt>質問者</dt>
              <dd>{asker ? `${deptName(db, asker.deptId)} ${asker.name}` : '—'}</dd>
              <dt>公開範囲</dt>
              <dd>{q.visibility === 'public' ? '全員に公開' : 'IT担当者だけ'}</dd>
              <dt>登録日時</dt>
              <dd className="mono small">{fmtDateTime(q.createdAt)}</dd>
              <dt>更新日時</dt>
              <dd className="mono small">{fmtDateTime(q.updatedAt)}</dd>
              <dt>関係する依頼</dt>
              <dd>
                {related ? (
                  <span className="row gap-6"><FileText size={14} className="tx-3" /><span className="mono tx-cyan">{related.number}</span>{related.title}</span>
                ) : '—'}
              </dd>
            </dl>
            <p className="hint mt-12">回答が入ると「回答済み」、質問者が追加の質問をすると「未回答」に戻ります。</p>
          </Panel>
          {(isAsker || isIT(me)) && q.status !== 'resolved' && (
            <button className="btn btn-ok btn-lg btn-block" onClick={resolve}><CheckCircle2 /> 解決にする</button>
          )}
        </div>
      </div>
    </div>
  )
}
