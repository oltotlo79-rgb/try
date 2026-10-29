// S11 依頼の詳細：承認状況と製作の進み具合を確認し、引き戻し・修正・取り下げを行う
import type { ReactNode } from 'react'
import {
  Ban, Check, CheckCircle2, ClipboardList, FileText, GitBranch, History, Info, List, Paperclip, PenTool, Undo2, UserRound, Wrench,
} from 'lucide-react'
import type { RouteOf } from '../../router'
import type { WorkRequest } from '../../domain/types'
import { useApp, useMe, useRequest } from '../../store'
import { ApprovalTrack, AttachmentList, Avatar, Badge, CommentLog, Empty, PageHead, Panel, ProgressBar, StatusBadge } from '../../components/ui'
import { DrawingThumb } from '../../components/DrawingThumb'
import { canPullBack, canRequesterCancel, canResubmit, dueTone, findEmployee, pendingStep } from '../../domain/rules'
import { daysUntil, fmtDate, fmtMDHM } from '../../domain/format'
import { latestSheets } from './S05RequestForm'
import './requester.css'

export default function S11MyRequestDetail({ route }: { route: RouteOf<'S11'> }) {
  const req = useRequest(route.reqId)
  const me = useMe()
  const go = useApp((s) => s.go)
  if (!req || !me || req.requester.employeeId !== me.id) {
    return (
      <div className="page narrow">
        <PageHead sid="S11" en="REQUEST DETAIL" title="依頼の詳細" />
        <Empty
          title="この依頼は表示できません"
          desc="表示できるのは、ログインした本人が依頼者の依頼だけです。"
          action={<button className="btn" onClick={() => go({ s: 'S10' })}>自分の依頼一覧へ</button>}
        />
      </div>
    )
  }
  return <Detail req={req} />
}

function StatusNotice({ req }: { req: WorkRequest }) {
  const p = pendingStep(req)
  const map: Partial<Record<WorkRequest['status'], [string, ReactNode]>> = {
    circulating: ['info', <>回覧中です{p ? `（${p.role} ${p.approver.name} さんの承認待ち）` : ''}。回覧中は内容を編集できません。修正するときは先に「引き戻す」を押してください。</>],
    returned: ['warn', <>承認者から修正を求められています。差し戻しコメントを確認し、「編集・再依頼する」で修正してください。</>],
    pulledBack: ['warn', <>引き戻し中です。内容を編集して、もう一度依頼できます（最初の回覧者から回覧をやり直します）。</>],
    circulated: ['info', <>すべての承認が完了しました。設備担当と打ち合わせの日程を設定してください。</>],
    inProgress: ['info', <>設備担当が製作を進めています。進み具合は右の「製作の進み具合」で確認できます。</>],
    done: ['violet', <>引き渡しが完了しました。ご利用ありがとうございました。</>],
    cancelled: ['danger', <>この依頼は取り下げられました。</>],
  }
  const m = map[req.status]
  if (!m) return null
  return (
    <div className={`notice ${m[0]}`} style={{ marginBottom: 20 }}>
      <Info />
      <div>{m[1]}</div>
    </div>
  )
}

function Milestone({ ok, label, date }: { ok: boolean; label: string; date?: string | null }) {
  return (
    <div className={`milestone ${ok ? 'ok' : ''}`}>
      <span className="mk">
        <Check strokeWidth={3} />
      </span>
      <span style={{ color: ok ? 'var(--tx-1)' : 'var(--tx-3)' }}>{label}</span>
      <span className="d">{ok ? fmtDate(date) : '未'}</span>
    </div>
  )
}

function Detail({ req }: { req: WorkRequest }) {
  const db = useApp((s) => s.db)
  const go = useApp((s) => s.go)
  const now = Date.now()
  const sheets = latestSheets(req)
  const tone = dueTone(req, now)
  const days = daysUntil(req.dueDate, now)
  const assignees = req.assignees.map((id) => findEmployee(db, id)).filter((e) => !!e)
  const showWork = ['circulated', 'inProgress', 'done'].includes(req.status)
  const p = pendingStep(req)

  const doPullBack = async () => {
    const ok = await useApp.getState().ask({
      title: '依頼を引き戻しますか？',
      body:
        (p ? `承認待ちの人（${p.role} ${p.approver.name}）のURLは使えなくなり、「対応不要」のメールが届きます。\n` : '') +
        '引き戻すと「引き戻し中」になり、内容を編集できるようになります。',
      okLabel: '引き戻す',
      tone: 'warn',
    })
    if (ok) useApp.getState().pullBack(req.id)
  }
  const doCancel = async () => {
    const ok = await useApp.getState().ask({
      title: '依頼を取り下げますか？',
      body: '依頼そのものを取りやめます。取り下げた依頼は元に戻せません（記録は残ります）。',
      okLabel: '取り下げる',
      tone: 'danger',
    })
    if (ok) useApp.getState().cancelByRequester(req.id)
  }

  return (
    <div className="page">
      <PageHead
        sid="S11"
        en={`REQUEST DETAIL ・ ${req.number}`}
        title={req.title}
        desc={
          <span className="row gap-6 wrap">
            <StatusBadge req={req} long />
            <span className="tx-3 small">依頼日 {fmtDate(req.requestDate)}・回覧 {req.round}回目</span>
          </span>
        }
        actions={
          <button className="btn" onClick={() => go({ s: 'S10' })}>
            <List /> 一覧へ戻る
          </button>
        }
      />
      <StatusNotice req={req} />

      <Panel title="承認の進み具合" icon={<GitBranch />} sub="✔＝承認済み　▶＝承認待ち　－＝空欄のため飛ばし" glow={req.status === 'circulating'}>
        <ApprovalTrack req={req} />
      </Panel>

      <div className="grid-main-side mt-24">
        <div className="col gap-20">
          <Panel title="依頼内容" icon={<FileText />}>
            <dl className="kv">
              <dt>依頼番号</dt>
              <dd className="id-cell">{req.number}</dd>
              <dt>件名</dt>
              <dd style={{ fontWeight: 600 }}>{req.title}</dd>
              <dt>依頼部署・依頼者</dt>
              <dd>{req.requester.dept}　{req.requester.name}</dd>
              <dt>納期</dt>
              <dd className="row gap-6">
                <span className={`mono ${tone === 'overdue' ? 'tx-danger' : tone === 'soon' ? 'tx-warn' : ''}`}>{fmtDate(req.dueDate)}</span>
                {tone === 'overdue' && <Badge tone="danger" sm>納期超過</Badge>}
                {tone === 'soon' && <Badge tone="warn" sm>{days === 0 ? '本日' : `あと${days}日`}</Badge>}
              </dd>
              <dt>依頼内容</dt>
              <dd className="desc-text">{req.description}</dd>
            </dl>
          </Panel>

          <Panel title="図面" icon={<PenTool />} sub={sheets.length ? 'クリックすると製図ページで開きます（閲覧・印刷）' : undefined}>
            {sheets.length ? (
              <div className="thumbs">
                {sheets.map((d) => (
                  <DrawingThumb
                    key={d.id}
                    json={d.json}
                    caption={`${d.sheetNo}枚目　${d.name || '（図名なし）'}`}
                    sub={d.revision > 1 ? `版${d.revision}（設備）` : '版1'}
                    onClick={() => go({ s: 'S06', reqId: req.id, sheet: d.sheetNo, mode: 'view', back: { s: 'S11', reqId: req.id } })}
                  />
                ))}
              </div>
            ) : (
              <span className="tx-3 small">図面はありません</span>
            )}
          </Panel>

          <div className="grid-2">
            <Panel title="補足資料" icon={<Paperclip />}>
              <AttachmentList req={req} />
            </Panel>
            <Panel title="差し戻しコメント" icon={<Undo2 />} sub="過去の分もすべて残ります">
              <CommentLog comments={req.returnComments} />
            </Panel>
          </div>
        </div>

        <div className="col gap-20">
          <Panel title="操作" icon={<ClipboardList />}>
            <div className="col gap-16">
              <ActionRow
                show={canPullBack(req)}
                button={
                  <button className="btn btn-warn btn-block" onClick={doPullBack}>
                    <Undo2 /> 引き戻す
                  </button>
                }
                note="回覧中だけ押せます。承認待ちの人のURLは使えなくなり、編集できるようになります。"
              />
              <ActionRow
                show={canResubmit(req)}
                button={
                  <button className="btn btn-primary btn-block" onClick={() => go({ s: 'S05', reqId: req.id })}>
                    <PenTool /> 編集・再依頼する
                  </button>
                }
                note="差し戻し中・引き戻し中だけ押せます。修正後、最初の回覧者から回覧をやり直します。"
              />
              <ActionRow
                show={canRequesterCancel(req)}
                button={
                  <button className="btn btn-danger btn-block" onClick={doCancel}>
                    <Ban /> 取り下げる
                  </button>
                }
                note="回覧完了前だけ取り下げられます。それ以降は設備の管理者へ連絡してください。"
              />
              {!canPullBack(req) && !canResubmit(req) && !canRequesterCancel(req) && (
                <span className="tx-3 small">今の状態でできる操作はありません。</span>
              )}
            </div>
          </Panel>

          <Panel title="製作の進み具合" icon={<Wrench />} sub={showWork ? undefined : '回覧完了後に表示します'}>
            {showWork ? (
              <div className="col gap-16">
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>担当者</div>
                  {assignees.length ? (
                    <div className="row wrap gap-16">
                      {assignees.map((e) => (
                        <span key={e!.id} className="row gap-6">
                          <Avatar emp={e} size="sm" />
                          <span>{e!.name}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="tx-3 small row gap-6">
                      <UserRound size={14} /> 未定（打ち合わせの後に決まります）
                    </span>
                  )}
                </div>
                <div>
                  <div className="label" style={{ marginBottom: 8 }}>製作進捗</div>
                  <ProgressBar value={req.status === 'done' ? 100 : req.progress} />
                </div>
                <div className="milestones">
                  <Milestone ok={req.meetingDone} label="打ち合わせ" date={req.meetingDate} />
                  <Milestone ok={req.estimateDone} label="見積り依頼" date={req.estimateDate} />
                  <Milestone ok={req.purchaseDone} label="買い入れ完了" date={req.purchaseDate} />
                  <Milestone ok={!!req.productionDate} label="製作完了" date={req.productionDate} />
                  <Milestone ok={!!req.deliveryDate} label="引き渡し完了" date={req.deliveryDate} />
                </div>
              </div>
            ) : (
              <div className="row gap-6 tx-3 small">
                <Wrench size={14} /> まだ製作は始まっていません
              </div>
            )}
          </Panel>

          <Panel title="履歴" icon={<History />}>
            <div className="timeline">
              {[...req.history].reverse().map((h, i) => {
                const cls = /差し戻し|引き戻し/.test(h.action) ? 'warn' : /取り下げ/.test(h.action) ? 'muted' : /完了/.test(h.action) ? 'ok' : ''
                return (
                  <div key={i} className={`tl-item ${cls}`}>
                    <div className="tl-time">{fmtMDHM(h.at)}</div>
                    <div className="tl-text">
                      <b style={{ fontWeight: 600 }}>{h.action}</b>
                      <span className="tx-2">　{h.actor}</span>
                    </div>
                    {h.detail && <div className="tl-detail">{h.detail}</div>}
                  </div>
                )
              })}
              {!req.history.length && <span className="tx-3 small">履歴はありません</span>}
            </div>
          </Panel>
          {req.status === 'done' && (
            <div className="notice violet">
              <CheckCircle2 />
              <div>引き渡し完了日：{fmtDate(req.deliveryDate)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActionRow({ show, button, note }: { show: boolean; button: ReactNode; note: string }) {
  if (!show) return null
  return (
    <div className="col gap-6">
      {button}
      <span className="tiny tx-3">{note}</span>
    </div>
  )
}
